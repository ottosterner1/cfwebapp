# app/__init__.py
from datetime import timedelta
from flask import Flask, send_from_directory, jsonify, request
from config import Config
import os
from app.extensions import db, migrate, login_manager, cors
from app.auth import init_oauth
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration
import json
import traceback
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('gunicorn.error')

def get_vite_asset(app, entry_point):
    try:
        # Check both possible manifest locations
        manifest_locations = [
            os.path.join(app.static_folder, 'dist', 'manifest.json'),
            os.path.join(app.static_folder, 'dist', '.vite', 'manifest.json')
        ]
        
        manifest = None
        for manifest_path in manifest_locations:
            if os.path.exists(manifest_path):
                with open(manifest_path) as f:
                    manifest = json.load(f)
                    break
                    
        if not manifest:
            app.logger.warning("No manifest file found")
            return ''
            
        if entry_point in manifest:
            return manifest[entry_point]['file']
        return ''
    except Exception as e:
        app.logger.error(f"Error reading Vite manifest: {e}")
        return ''
def register_extensions(app):
    """Register Flask extensions."""
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    init_oauth(app)
    
    # Updated CORS configuration
    cors_origins = app.config.get('CORS_ORIGINS', [])
    if not app.debug:
        cors_origins.append('https://cfwebapp-production.up.railway.app')
    
    cors.init_app(app, resources={
        r"/api/*": {
            "origins": cors_origins,
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization", "Cookie", "X-CSRF-TOKEN"],
            "expose_headers": ["Content-Type", "Authorization", "Set-Cookie"],
            "supports_credentials": True
        }
    })

def register_blueprints(app):
    """Register Flask blueprints."""
    from app.routes import register_routes
    register_routes(app)

def configure_login_manager(app):
    """Configure the Flask-Login extension."""
    login_manager.login_view = 'auth.login'
    login_manager.login_message = 'Please log in to access this page.'
    login_manager.login_message_category = 'info'
    
    @login_manager.user_loader
    def load_user(user_id):
        from app.models import User
        return User.query.get(int(user_id))

def create_app(config_class=Config):
    """Application factory function."""
    # Initialize Sentry in production
    if os.getenv('FLASK_ENV') == 'production':
        sentry_sdk.init(
            dsn=os.getenv('SENTRY_DSN'),
            integrations=[FlaskIntegration()],
            traces_sample_rate=1.0,
            environment="production"
        )
    
    app = Flask(__name__, 
                static_folder='static', 
                static_url_path='/static')  
    app.logger.handlers = logger.handlers
    app.logger.setLevel(logger.level)
    
    # Determine environment and configure the app
    env = os.getenv('FLASK_ENV', 'production')
    if isinstance(config_class, dict):
        config_obj = config_class[env]
    else:
        config_obj = config_class
    
    app.config.from_object(config_obj)

    # Remove server name restriction
    app.config['SERVER_NAME'] = None

    # Update session configuration for all environments
    app.config.update(
        SESSION_COOKIE_SECURE=True,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE='Lax',
        SESSION_COOKIE_DOMAIN=None,
        PERMANENT_SESSION_LIFETIME=timedelta(days=1),
        REMEMBER_COOKIE_DOMAIN=None,
        REMEMBER_COOKIE_SECURE=True,
        REMEMBER_COOKIE_HTTPONLY=True,
        REMEMBER_COOKIE_SAMESITE='Lax'
    )

    # Configure proxy settings for HTTPS
    from werkzeug.middleware.proxy_fix import ProxyFix
    app.wsgi_app = ProxyFix(
        app.wsgi_app,
        x_for=1,
        x_proto=1,
        x_host=1,
        x_prefix=1
    )

    # Database connection settings
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
        'pool_pre_ping': True,
        'pool_recycle': 300,
        'pool_timeout': 900,
        'pool_size': 10,
        'max_overflow': 5,
        'connect_args': {
            'connect_timeout': 10
        }
    }
    
    # Force HTTPS in production
    if not app.debug:
        app.config['PREFERRED_URL_SCHEME'] = 'https'
        os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = 'false'

    
    # Ensure directories exist
    try:
        os.makedirs(app.instance_path, exist_ok=True)
        os.makedirs(os.path.join(app.static_folder, 'dist'), exist_ok=True)
    except Exception as e:
        app.logger.error(f"Error creating directories: {e}")
    
    # Initialize extensions and register blueprints
    register_extensions(app)
    register_blueprints(app)
    configure_login_manager(app)
    
    # Error handlers
    @app.errorhandler(404)
    def not_found_error(error):
        if request.path.startswith('/api/'):
            return jsonify({"error": "Resource not found"}), 404
        return send_from_directory(os.path.join(app.static_folder, 'dist'), 'index.html')

    @app.errorhandler(500)
    def internal_error(error):
        db.session.rollback()
        if request.path.startswith('/api/'):
            return jsonify({"error": "Internal server error"}), 500
        return "Internal server error", 500

    @app.context_processor
    def utility_processor():
        def get_asset_path(entry_point):
            return get_vite_asset(app, entry_point)
        return dict(get_asset_path=get_asset_path)

    # Universal CORS and security headers
    @app.after_request
    def after_request(response):
        # Get the origin from the request
        origin = request.headers.get('Origin')
        allowed_origins = app.config.get('CORS_ORIGINS', [])
        
        if origin in allowed_origins:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Cookie, X-CSRF-TOKEN'
            response.headers['Access-Control-Expose-Headers'] = 'Content-Type, Authorization, Set-Cookie'
            
        # Security headers
        response.headers.update({
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'SAMEORIGIN',
            'X-XSS-Protection': '1; mode=block'
        })
        
        return response

    @app.route('/favicon.ico')
    def favicon():
        return '', 204

    @app.route('/static/dist/<path:filename>')
    def serve_dist(filename):
        try:
            dist_dir = os.path.join(app.static_folder, 'dist')
            
            if os.path.exists(os.path.join(dist_dir, filename)):
                return send_from_directory(dist_dir, filename)
            elif os.path.exists(os.path.join(dist_dir, '.vite', filename)):
                return send_from_directory(os.path.join(dist_dir, '.vite'), filename)
            else:
                app.logger.error(f"File not found: {filename}")
                return "File not found", 404
        except Exception as e:
            app.logger.error(f"Error serving static file: {str(e)}")
            return str(e), 500

    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve(path):
        dist_dir = os.path.join(app.static_folder, 'dist')
        
        # Log directory contents
        if not os.path.exists(dist_dir):
            app.logger.error(f"Dist directory does not exist: {dist_dir}")
            # Try to create it
            try:
                os.makedirs(dist_dir, exist_ok=True)
            except Exception as e:
                app.logger.error(f"Error creating dist directory: {e}")
        
        
        try:
            if path and os.path.exists(os.path.join(dist_dir, path)):
                return send_from_directory(dist_dir, path)
            
            index_path = os.path.join(dist_dir, 'index.html')
            if os.path.exists(index_path):
                return send_from_directory(dist_dir, 'index.html')
            else:
                app.logger.error(f"index.html not found at: {index_path}")
                return "index.html not found", 404
                
        except Exception as e:
            app.logger.error(f"Error serving file: {str(e)}")
            return str(e), 500
    
    @app.route('/debug')
    def debug_info():
        dist_dir = os.path.join(app.static_folder, 'dist')
        debug_info = {
            'static_folder': app.static_folder,
            'dist_dir': dist_dir,
            'dist_exists': os.path.exists(dist_dir),
            'static_contents': os.listdir(app.static_folder) if os.path.exists(app.static_folder) else 'not found',
            'dist_contents': os.listdir(dist_dir) if os.path.exists(dist_dir) else 'not found',
            'env': dict(os.environ)
        }
        return jsonify(debug_info)
    
    @app.route('/debug/static')
    def debug_static_files():
        static_dir = app.static_folder
        dist_dir = os.path.join(static_dir, 'dist')
        debug_info = {
            'static_folder_abs': os.path.abspath(static_dir),
            'dist_dir_abs': os.path.abspath(dist_dir),
            'static_exists': os.path.exists(static_dir),
            'dist_exists': os.path.exists(dist_dir),
            'static_contents': os.listdir(static_dir) if os.path.exists(static_dir) else [],
            'dist_contents': os.listdir(dist_dir) if os.path.exists(dist_dir) else []
        }
        return jsonify(debug_info)
    
    @app.route('/api/health')
    def health_check():
        return jsonify({"status": "healthy"}), 200
    
    # Development routes
    if app.debug:
        @app.route('/api/test-cors', methods=['GET'])
        def test_cors():
            return {'status': 'CORS is working'}
        
        # Error handlers
    @app.errorhandler(404)
    def not_found_error(error):
        if request.path.startswith('/api/') or request.path.startswith('/clubs/api/'):
            return jsonify({"error": "Resource not found"}), 404
        return send_from_directory(os.path.join(app.static_folder, 'dist'), 'index.html')

    @app.errorhandler(500)
    def internal_error(error):
        db.session.rollback()
        if request.path.startswith('/api/') or request.path.startswith('/clubs/api/'):
            app.logger.error(f"Internal server error: {str(error)}")
            return jsonify({"error": "Internal server error", "details": str(error)}), 500
        return "Internal server error", 500
        
    @app.errorhandler(403)
    def forbidden_error(error):
        if request.path.startswith('/api/') or request.path.startswith('/clubs/api/'):
            return jsonify({"error": "Access denied"}), 403
        return "Access denied", 403
        
    @app.errorhandler(400)
    def bad_request_error(error):
        if request.path.startswith('/api/') or request.path.startswith('/clubs/api/'):
            return jsonify({"error": "Bad request", "details": str(error)}), 400
        return "Bad request", 400
        
    @app.errorhandler(Exception)
    def handle_exception(e):
        """General exception handler for API routes"""
        # Always rollback any pending database changes on exceptions
        try:
            # Try to rollback transaction regardless of SQLAlchemy version
            db.session.rollback()
        except Exception as rollback_error:
            app.logger.error(f"Error during session rollback: {str(rollback_error)}")
            
        if request.path.startswith('/api/') or request.path.startswith('/clubs/api/'):
            # Log the error with traceback
            app.logger.error(f"Unhandled exception in API: {str(e)}")
            app.logger.error(traceback.format_exc())
            
            # Return JSON error response
            response = jsonify({
                "error": str(e),
                "type": e.__class__.__name__
            })
            response.status_code = 500
            return response
            
        # For non-API routes, use the default Flask error handler
        return app.handle_exception(e)
    
    return app
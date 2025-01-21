# app/__init__.py
from flask import Flask, send_from_directory, jsonify, request
from config import Config
import os
from app.extensions import db, migrate, login_manager, cors
from app.auth import init_oauth
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration
import json

def get_vite_asset(app, entry_point):
    try:
        manifest_path = os.path.join(app.static_folder, 'dist', '.vite', 'manifest.json')
        with open(manifest_path) as f:
            manifest = json.load(f)
            
        if entry_point in manifest:
            return manifest[entry_point]['file']
        return None
    except Exception as e:
        print(f"Error reading Vite manifest: {e}")
        return None

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
            "supports_credentials": True,
            "allow_credentials": True
        }
    })

def register_blueprints(app):
    """Register Flask blueprints."""
    from app.routes import main
    from app.clubs.routes import club_management
    
    app.register_blueprint(main)
    app.register_blueprint(club_management, url_prefix='/clubs')

def configure_login_manager(app):
    """Configure the Flask-Login extension."""
    login_manager.login_view = 'main.login'
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
    
    # Determine environment and configure the app
    env = os.getenv('FLASK_ENV', 'production')
    if isinstance(config_class, dict):
        config_obj = config_class[env]
    else:
        config_obj = config_class
    
    app.config.from_object(config_obj)

    # Session and cookie configuration
    if not app.debug:
        app.config.update(
            SESSION_COOKIE_SECURE=True,
            SESSION_COOKIE_HTTPONLY=True,
            SESSION_COOKIE_SAMESITE='Lax',
            SESSION_COOKIE_DOMAIN='cfwebapp-production.up.railway.app',
            REMEMBER_COOKIE_SECURE=True,
            REMEMBER_COOKIE_HTTPONLY=True
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

    # Add database connection retry logic
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
    
    # Print debug information
    if app.debug:
        print(f"Flask Debug Mode: {app.debug}")
        print(f"CORS origins configured for: {app.config.get('CORS_ORIGINS', 'default origins')}")
    
    # Ensure directories exist
    try:
        os.makedirs(app.instance_path, exist_ok=True)
        os.makedirs(os.path.join(app.static_folder, 'dist'), exist_ok=True)
    except Exception as e:
        print(f"Error creating directories: {e}")
    
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
    
    if not app.debug:
        @app.after_request
        def add_security_headers(response):
            headers = {
                'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
                'X-Content-Type-Options': 'nosniff',
                'X-Frame-Options': 'SAMEORIGIN',
                'X-XSS-Protection': '1; mode=block',
                'Access-Control-Allow-Credentials': 'true'
            }
            
            # Add CORS headers for preflight requests
            if request.method == 'OPTIONS':
                response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
                response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Cookie, X-CSRF-TOKEN'
                response.headers['Access-Control-Allow-Credentials'] = 'true'
                if request.headers.get('Origin') in app.config['CORS_ORIGINS']:
                    response.headers['Access-Control-Allow-Origin'] = request.headers['Origin']
            
            # Handle non-OPTIONS requests
            if request.headers.get('Origin') in app.config['CORS_ORIGINS']:
                response.headers['Access-Control-Allow-Origin'] = request.headers['Origin']
            
            for header, value in headers.items():
                response.headers[header] = value
            return response

    @app.route('/favicon.ico')
    def favicon():
        return '', 204

    # Static file and React app handling
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve(path):
        if path.startswith('api/'):
            return not_found_error(None)
        
        dist_dir = os.path.join(app.static_folder, 'dist')
        if path and os.path.exists(os.path.join(dist_dir, path)):
            return send_from_directory(dist_dir, path)
        
        if path and os.path.exists(os.path.join(app.static_folder, path)):
            return send_from_directory(app.static_folder, path)
        
        return send_from_directory(dist_dir, 'index.html')
    
    @app.route('/api/health')
    def health_check():
        return jsonify({"status": "healthy"}), 200
    
    # Development routes
    if app.debug:
        @app.route('/api/test-cors', methods=['GET'])
        def test_cors():
            return {'status': 'CORS is working'}
    
    return app
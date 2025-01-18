# app/__init__.py
from flask import Flask, send_from_directory, jsonify, request
from config import Config
import os
from app.extensions import db, migrate, login_manager, cors
from app.auth import init_oauth
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration

def register_extensions(app):
    """Register Flask extensions."""
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    init_oauth(app)
    
    cors.init_app(app, resources={
        r"/api/*": {
            "origins": app.config['CORS_ORIGINS'],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
            "supports_credentials": True
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

    # Add this to trust proxy headers
    app.config['PREFERRED_URL_SCHEME'] = 'https'
    
    # Print debug information (only in development)
    if app.debug:
        print(f"Flask Debug Mode: {app.debug}")
        print(f"CORS origins configured for: {app.config.get('CORS_ORIGINS', 'default origins')}")
    
    # Ensure instance folder exists
    try:
        os.makedirs(app.instance_path, exist_ok=True)
    except Exception as e:
        print(f"Error creating instance path: {e}")
    
    # Initialize extensions and register blueprints
    register_extensions(app)
    register_blueprints(app)
    configure_login_manager(app)
    
    # Set up error handlers
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
    
    # Add security headers in production
    if not app.debug:
        @app.after_request
        def add_security_headers(response):
            headers = {
                'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
                'X-Content-Type-Options': 'nosniff',
                'X-Frame-Options': 'SAMEORIGIN',
                'X-XSS-Protection': '1; mode=block'
            }
            for header, value in headers.items():
                response.headers[header] = value
            return response
    
    # Serve React app in production
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve(path):
        if path.startswith('api/'):
            return not_found_error(None)
        
        # First try to serve from the dist directory (React build)
        dist_path = os.path.join(app.static_folder, 'dist', path)
        if path != "" and os.path.exists(dist_path):
            return send_from_directory(os.path.join(app.static_folder, 'dist'), path)
            
        # Then try to serve from the regular static directory (CSS, etc)
        static_path = os.path.join(app.static_folder, path)
        if os.path.exists(static_path):
            return send_from_directory(app.static_folder, path)
            
        # Default to serving index.html for React routing
        return send_from_directory(os.path.join(app.static_folder, 'dist'), 'index.html')
    
    @app.route('/api/health')
    def health_check():
        return jsonify({"status": "healthy"}), 200
    
    # Add a route to test CORS (development only)
    if app.debug:
        @app.route('/api/test-cors', methods=['GET'])
        def test_cors():
            return {'status': 'CORS is working'}
    
    return app
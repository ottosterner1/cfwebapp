from datetime import timedelta
from flask import Flask, send_from_directory, jsonify, request
from config import Config
import os
from app.extensions import db, migrate, login_manager, cors
from app.auth import init_oauth
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration
import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('gunicorn.error')

def get_vite_asset(app, entry_point):
    try:
        manifest_path = os.path.join(app.static_folder, 'dist', 'manifest.json')
        if os.path.exists(manifest_path):
            with open(manifest_path) as f:
                manifest = json.load(f)
                return manifest[entry_point]['file'] if entry_point in manifest else ''
        return ''
    except Exception as e:
        app.logger.error(f"Error reading Vite manifest: {e}")
        return ''

def register_extensions(app):
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    init_oauth(app)
    
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
    from app.routes import main
    from app.clubs.routes import club_management
    app.register_blueprint(main)
    app.register_blueprint(club_management, url_prefix='/clubs')

def configure_login_manager(app):
    login_manager.login_view = 'main.login'
    login_manager.login_message = 'Please log in to access this page.'
    login_manager.login_message_category = 'info'
    
    @login_manager.user_loader
    def load_user(user_id):
        from app.models import User
        return User.query.get(int(user_id))

def create_app(config_class=Config):
    if os.getenv('FLASK_ENV') == 'production':
        sentry_sdk.init(
            dsn=os.getenv('SENTRY_DSN'),
            integrations=[FlaskIntegration()],
            traces_sample_rate=1.0,
            environment="production"
        )
    
    app = Flask(__name__, 
                static_folder='app/static', 
                static_url_path='/static')
    
    app.logger.handlers = logger.handlers
    app.logger.setLevel(logger.level)
    
    env = os.getenv('FLASK_ENV', 'production')
    config_obj = config_class[env] if isinstance(config_class, dict) else config_class
    app.config.from_object(config_obj)

    # Configuration updates
    app.config.update(
        SERVER_NAME=None,
        SESSION_COOKIE_SECURE=True,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE='Lax',
        PERMANENT_SESSION_LIFETIME=timedelta(days=1),
        REMEMBER_COOKIE_SECURE=True,
        REMEMBER_COOKIE_HTTPONLY=True,
        REMEMBER_COOKIE_SAMESITE='Lax',
        SQLALCHEMY_ENGINE_OPTIONS={
            'pool_pre_ping': True,
            'pool_recycle': 300,
            'pool_timeout': 900,
            'pool_size': 10,
            'max_overflow': 5,
            'connect_args': {'connect_timeout': 10}
        }
    )

    if not app.debug:
        app.config['PREFERRED_URL_SCHEME'] = 'https'
        os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = 'false'

    # Ensure directories exist
    try:
        os.makedirs(os.path.join(app.static_folder, 'dist'), exist_ok=True)
    except Exception as e:
        app.logger.error(f"Error creating directories: {e}")

    # Initialize extensions
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
        return jsonify({"error": "Internal server error"}), 500

    # Static file serving
    @app.route('/sw.js')
    def serve_service_worker():
        return send_from_directory(os.path.join(app.static_folder, 'dist'), 'sw.js')

    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve(path):
        dist_dir = os.path.join(app.static_folder, 'dist')
        
        # Handle specific static files
        if path and os.path.exists(os.path.join(dist_dir, path)):
            return send_from_directory(dist_dir, path)
            
        # Default to index.html for all other routes
        return send_from_directory(dist_dir, 'index.html')

    # Debug route
    @app.route('/debug/static')
    def debug_static():
        return jsonify({
            "static_folder": app.static_folder,
            "dist_dir": os.path.join(app.static_folder, 'dist'),
            "exists": os.path.exists(os.path.join(app.static_folder, 'dist'))
        })

    return app
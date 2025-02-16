import os
from datetime import timedelta
from urllib.parse import urlparse

class Config:
    # Base Security
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-key-change-this'
    
    # Session Configuration
    PERMANENT_SESSION_LIFETIME = timedelta(days=1)
    SESSION_TYPE = 'filesystem'
    SESSION_FILE_DIR = '/tmp/flask_session'
    SESSION_FILE_THRESHOLD = 500
    
    # Database Configuration
    DATABASE_URL = os.environ.get('DATABASE_URL')
    if not DATABASE_URL:
        raise ValueError("DATABASE_URL environment variable is required")
        
    # Convert Heroku-style postgres:// to postgresql://
    if DATABASE_URL.startswith('postgres://'):
        DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://')

    
    SQLALCHEMY_DATABASE_URI = DATABASE_URL
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # PostgreSQL connection pool settings
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': int(os.environ.get('DB_POOL_SIZE', 5)),
        'pool_timeout': int(os.environ.get('DB_POOL_TIMEOUT', 30)),
        'pool_recycle': int(os.environ.get('DB_POOL_RECYCLE', 1800)),
        'pool_pre_ping': True,
        'max_overflow': int(os.environ.get('DB_MAX_OVERFLOW', 10))
    }
    
    UPLOAD_FOLDER = 'uploads'
    
    # AWS Cognito Config
    AWS_ACCESS_KEY_ID = os.environ.get('AWS_ACCESS_KEY_ID')
    AWS_SECRET_ACCESS_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY')
    AWS_COGNITO_REGION = os.environ.get('AWS_COGNITO_REGION')
    AWS_COGNITO_USER_POOL_ID = os.environ.get('AWS_COGNITO_USER_POOL_ID')
    AWS_COGNITO_CLIENT_ID = os.environ.get('AWS_COGNITO_CLIENT_ID')
    AWS_COGNITO_CLIENT_SECRET = os.environ.get('AWS_COGNITO_CLIENT_SECRET')
    COGNITO_DOMAIN = os.environ.get('COGNITO_DOMAIN')
    
    # OAuth endpoints
    OAUTH_AUTHORIZE_URL = f"https://{COGNITO_DOMAIN}/oauth2/authorize"
    OAUTH_TOKEN_URL = f"https://{COGNITO_DOMAIN}/oauth2/token"
    OAUTH_USERINFO_URL = f"https://{COGNITO_DOMAIN}/oauth2/userInfo"

    # Static file config
    STATIC_FOLDER = 'static'
    STATIC_URL_PATH = '/static'
    
    # Metadata URL
    COGNITO_METADATA_URL = f'https://cognito-idp.{AWS_COGNITO_REGION}.amazonaws.com/{AWS_COGNITO_USER_POOL_ID}/.well-known/openid-configuration'
    
    # OAuth client configuration
    OAUTH_CLIENT_KWARGS = {
        'scope': 'email openid profile',
        'response_type': 'code'
    }

    def __init__(self):
        db_url = urlparse(self.DATABASE_URL)

    # AWS SES Configuration
    AWS_SES_REGION = os.environ.get('AWS_SES_REGION', 'eu-west-2')
    AWS_SES_ACCESS_KEY = os.environ.get('AWS_SES_ACCESS_KEY')
    AWS_SES_SECRET_KEY = os.environ.get('AWS_SES_SECRET_KEY')
    AWS_SES_SENDER = os.environ.get('AWS_SES_SENDER')
    
    # Club invitation configuration
    INVITATION_EXPIRY_HOURS = 48 


class DevelopmentConfig(Config):
    DEBUG = True
    CORS_ENABLED = True
    
    # Session and Cookie Settings
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Strict'
    SESSION_COOKIE_DOMAIN = None
    SESSION_COOKIE_NAME = 'session'
    
    # CORS Configuration
    CORS_ORIGINS = [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:8000',
        'http://127.0.0.1:8000',
        'https://cfwebapp.local', 
        'https://cfwebapp-production.up.railway.app',
        'https://courtflow.co.uk'
    ]
    CORS_SUPPORTS_CREDENTIALS = True
    
    # CSRF Settings
    WTF_CSRF_CHECK_DEFAULT = False
    WTF_CSRF_ENABLED = False


class ProductionConfig(Config):
    DEBUG = False
    
    # Session and Cookie Settings
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Strict'
    SESSION_COOKIE_DOMAIN = None
    SESSION_COOKIE_NAME = 'session'
    
    # CORS Configuration
    CORS_ORIGINS = [
        'https://courtflow.co.uk',
        'https://cfwebapp-production.up.railway.app'
    ]
    CORS_SUPPORTS_CREDENTIALS = True


class TestingConfig(Config):
    TESTING = True
    
    # Session Configuration for Testing
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Strict'
    
    def __init__(self):
        # Use a test PostgreSQL database
        self.DATABASE_URL = os.environ.get('TEST_DATABASE_URL', 'postgresql://localhost/tennis_test')
        super().__init__()
    
    WTF_CSRF_ENABLED = False


# Configuration dictionary
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}
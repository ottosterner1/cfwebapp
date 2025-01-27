from app import create_app
from config import config
import os

env = os.getenv('FLASK_ENV', 'development')
app = create_app(config[env])

if __name__ == '__main__':
    cert_path = '/app/certs/cert.pem'
    key_path = '/app/certs/key.pem'
    
    if not os.path.exists(cert_path) or not os.path.exists(key_path):
        raise Exception("SSL certificates not found")
        
    app.run(ssl_context=(cert_path, key_path), host='0.0.0.0', port=443)
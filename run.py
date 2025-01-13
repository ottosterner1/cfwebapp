from app import create_app
from config import config
import os

env = os.getenv('FLASK_ENV', 'development')
app = create_app(config[env])

if __name__ == '__main__':
    app.run()
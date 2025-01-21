from functools import wraps
from flask import abort, current_app, request
from flask_login import current_user
from app.models import UserRole

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or (not current_user.is_admin and not current_user.is_super_admin):
            abort(403)
        return f(*args, **kwargs)
    return decorated_function

def get_tennis_club_from_request():
    """Extract tennis club from subdomain"""
    host = request.host.split(':')[0]  # Remove port if present
    
    # Special handling for localhost development
    if host in ['localhost', '127.0.0.1']:
        return 'localhost'
        
    subdomain = host.split('.')[0]
    base_domain = current_app.config.get('BASE_DOMAIN', '')
    
    if subdomain == 'www' or subdomain == base_domain:
        return None
        
    return subdomain

def club_access_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        print(f"User authenticated: {current_user.is_authenticated}")
        print(f"Request host: {request.host}")
        print(f"Request headers: {dict(request.headers)}")
        
        if not current_user.is_authenticated:
            print("User not authenticated")
            abort(403)
        
        # Special handling for Railway.app
        if 'railway.app' in request.host:
            return f(*args, **kwargs)
            
        # Rest of your existing code...
        subdomain = get_tennis_club_from_request()
        if not subdomain or current_user.tennis_club.subdomain != subdomain:
            print(f"Subdomain mismatch: {subdomain} vs {current_user.tennis_club.subdomain}")
            abort(403)
            
        return f(*args, **kwargs)
    return decorated_function
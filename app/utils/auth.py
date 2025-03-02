from functools import wraps
from flask import abort, current_app, request, redirect, url_for
from flask_login import current_user
from app.models import UserRole
from app.config.subdomains import get_subdomain, redirect_to_subdomain

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or (not current_user.is_admin and not current_user.is_super_admin):
            abort(403)
            
        # Ensure admin is on admin subdomain
        subdomain = get_subdomain()
        if subdomain != 'admin':
            return redirect_to_subdomain('admin')
            
        return f(*args, **kwargs)
    return decorated_function

def club_access_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated:
            current_app.logger.error("User not authenticated")
            abort(403)
            
        # Get subdomain and user's club
        subdomain = get_subdomain()
        user_club = current_user.tennis_club
        
        # Special handling for development environment
        if current_app.debug and subdomain == 'localhost':
            return f(*args, **kwargs)
            
        # Handle admin subdomain
        if subdomain == 'admin':
            if current_user.is_super_admin:
                return f(*args, **kwargs)
            abort(403)
            
        # Verify club access
        if not subdomain or not user_club or user_club.subdomain != subdomain:
            if user_club:
                # Redirect to correct subdomain if user has a club
                return redirect_to_subdomain(user_club.subdomain)
            abort(403)
            
        return f(*args, **kwargs)
    return decorated_function

def marketing_site_only(f):
    """Decorator to ensure route is only accessible on main domain"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        subdomain = get_subdomain()
        if subdomain:
            abort(404)
        return f(*args, **kwargs)
    return decorated_function
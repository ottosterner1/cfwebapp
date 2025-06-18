from functools import wraps
from flask import g, jsonify, request, current_app
from flask_login import current_user

def get_club_from_request():
    """Extract club from subdomain"""
    if 'localhost' in request.host:
        # For local testing, return first club or specific test club
        from app.models import TennisClub
        return TennisClub.query.first().subdomain
    host = request.host.split(':')[0]
    return host.split('.')[0]

def verify_club_access():
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not current_user.is_authenticated:
                return jsonify({'error': 'Authentication required'}), 401
            
            # Get the club the user is currently managing
            current_club = current_user.get_active_club()
            
            if not current_club:
                return jsonify({'error': 'No club access'}), 403
            
            # Add current_club to request context for easy access
            g.current_club = current_club
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator
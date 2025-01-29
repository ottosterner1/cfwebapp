from functools import wraps
from flask import jsonify, request, current_app
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
            # Add detailed logging
            current_app.logger.info(f"=== verify_club_access check ===")
            current_app.logger.info(f"Is authenticated: {current_user.is_authenticated}")
            current_app.logger.info(f"Current user: {current_user}")
            
            if not current_user.is_authenticated:
                return jsonify({'error': 'Not authenticated'}), 401
                
            if not current_user.tennis_club_id:
                return jsonify({'error': 'No club access'}), 403
                
            return f(*args, **kwargs)
        return decorated_function
    return decorator
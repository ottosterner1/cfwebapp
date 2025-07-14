from functools import wraps
from flask import g, jsonify, request, current_app, redirect, url_for, flash
from flask_login import current_user

def get_club_from_request():
    """Extract club from subdomain"""
    if 'localhost' in request.host:
        # For local testing, return first club or specific test club
        from app.models import TennisClub
        return TennisClub.query.first().subdomain
    host = request.host.split(':')[0]
    return host.split('.')[0]

def verify_club_access(check_subscription=True, allow_trial=True):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not current_user.is_authenticated:
                return jsonify({'error': 'Authentication required'}), 401
            
            # Get the club the user is currently managing
            current_club = current_user.get_active_club()
            
            if not current_club:
                return jsonify({'error': 'No club access'}), 403
            
            # Add subscription checking if enabled
            if check_subscription and not current_user.is_super_admin:
                subscription_response = _check_subscription_access(allow_trial)
                if subscription_response:
                    return subscription_response
            
            # Add current_club to request context for easy access
            g.current_club = current_club
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def _check_subscription_access(allow_trial=True):
    """Helper function to check subscription access"""
    try:
        if (current_user.tennis_club and 
            current_user.tennis_club.organisation):
            
            org = current_user.tennis_club.organisation
            access_level = getattr(org, 'access_level', 'full')
            
            # Define allowed levels
            allowed_levels = ['full']
            if allow_trial:
                allowed_levels.extend(['trial', 'trial_warning', 'trial_ending'])
            
            # Check access
            if access_level not in allowed_levels:
                if request.is_json:
                    return jsonify({
                        'error': org.get_status_message(),
                        'redirect': url_for('main.subscription_required')
                    }), 403
                else:
                    flash(org.get_status_message(), 'warning')
                    return redirect(url_for('main.subscription_required'))
    except Exception as e:
        # Log but don't block
        current_app.logger.error(f"Subscription check error: {e}")
    
    return None

# Convenience decorators
def verify_club_access_with_subscription(allow_trial=True):
    """Club access with subscription checking (default behavior)"""
    return verify_club_access(check_subscription=True, allow_trial=allow_trial)

def verify_club_access_only():
    """Club access without subscription checking"""
    return verify_club_access(check_subscription=False)

def verify_paid_access():
    """Club access with paid subscription required (no trial)"""
    return verify_club_access(check_subscription=True, allow_trial=False)
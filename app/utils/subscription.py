# app/utils/subscription.py - Simplified subscription management without usage limits

from functools import wraps
from flask import jsonify, request, current_app, redirect, url_for, flash
from flask_login import current_user
from app import db

class AccessLevel:
    """Simple access levels for manual management"""
    FULL = 'full'                    # Active subscription
    TRIAL = 'trial'                  # Active trial
    TRIAL_WARNING = 'trial_warning'  # Trial ending soon (7 days)
    TRIAL_ENDING = 'trial_ending'    # Trial ending very soon (3 days)
    EXPIRED = 'expired'              # Trial expired
    SUSPENDED = 'suspended'          # Manually suspended

def get_organisation_access_info(user):
    """Get access information for a user's organisation"""
    if not user or not user.tennis_club or not user.tennis_club.organisation:
        return {
            'has_access': False,
            'access_level': AccessLevel.EXPIRED,
            'message': 'No organisation found',
            'days_remaining': 0,
            'can_upgrade': False
        }
    
    org = user.tennis_club.organisation
    
    return {
        'has_access': org.has_access,
        'access_level': org.access_level,
        'subscription_status': org.subscription_status,  # This will be uppercase (TRIAL, ACTIVE, etc.)
        'days_remaining': org.days_until_expiry,
        'trial_end_date': org.trial_end_date.isoformat() if org.trial_end_date else None,
        'message': org.get_status_message(),
        'can_upgrade': org.subscription_status in ['TRIAL', 'EXPIRED'],  # Can request upgrade
        'organisation_name': org.name
    }

def subscription_required(allow_trial=True):
    """
    Simplified decorator for access control
    
    Args:
        allow_trial: Whether to allow trial users (default: True)
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not current_user.is_authenticated:
                if request.is_json:
                    return jsonify({'error': 'Authentication required'}), 401
                return redirect(url_for('auth.login'))
            
            # Super admins bypass all checks
            if current_user.is_super_admin:
                return f(*args, **kwargs)
            
            access_info = get_organisation_access_info(current_user)
            
            # Check if access is allowed
            allowed_levels = [AccessLevel.FULL]
            if allow_trial:
                allowed_levels.extend([
                    AccessLevel.TRIAL, 
                    AccessLevel.TRIAL_WARNING, 
                    AccessLevel.TRIAL_ENDING
                ])
            
            if not access_info['has_access'] or access_info['access_level'] not in allowed_levels:
                error_msg = access_info['message']
                
                if request.is_json:
                    return jsonify({
                        'error': error_msg,
                        'access_info': access_info,
                        'upgrade_required': True
                    }), 403
                else:
                    flash(error_msg, 'warning')
                    return redirect(url_for('main.subscription_required'))
            
            # Add access info to request context
            request.access_info = access_info
            
            return f(*args, **kwargs)
        
        return decorated_function
    return decorator

def paid_only(f):
    """Decorator for features only available with manually activated subscription"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated:
            if request.is_json:
                return jsonify({'error': 'Authentication required'}), 401
            return redirect(url_for('auth.login'))
        
        # Super admins bypass all checks
        if current_user.is_super_admin:
            return f(*args, **kwargs)
        
        access_info = get_organisation_access_info(current_user)
        
        if access_info['access_level'] != AccessLevel.FULL:
            error_msg = "This feature requires an active subscription. Please contact support to upgrade."
            
            if request.is_json:
                return jsonify({
                    'error': error_msg,
                    'access_info': access_info,
                    'upgrade_required': True
                }), 403
            else:
                flash(error_msg, 'warning')
                return redirect(url_for('main.subscription_required'))
        
        return f(*args, **kwargs)
    
    return decorated_function

# Simple middleware for manual management
class SubscriptionMiddleware:
    """Lightweight middleware for manual subscription management"""
    
    def __init__(self, app=None):
        self.app = app
        if app:
            self.init_app(app)
    
    def init_app(self, app):
        app.before_request(self.before_request)
        app.context_processor(self.inject_subscription_context)
    
    def before_request(self):
        """Add subscription info to requests"""
        if current_user.is_authenticated and not current_user.is_super_admin:
            request.subscription_info = get_organisation_access_info(current_user)
        else:
            request.subscription_info = None
    
    def inject_subscription_context(self):
        """Inject subscription info into template context"""
        if hasattr(request, 'subscription_info'):
            return {'subscription_info': request.subscription_info}
        return {}

# Task to automatically expire trials (run daily)
def expire_trials_task():
    """Background task to expire trials - run this daily via cron"""
    from app.models.organisation import Organisation
    from datetime import datetime, timezone
    
    with current_app.app_context():
        try:
            now = datetime.now(timezone.utc)
            
            # Find trials that should be expired
            expired_trials = Organisation.query.filter(
                Organisation.subscription_status == 'TRIAL',
                Organisation.trial_end_date <= now
            ).all()
            
            count = 0
            for org in expired_trials:
                org.expire_trial()
                count += 1
                current_app.logger.info(f"Expired trial for organisation: {org.name}")
            
            if count > 0:
                db.session.commit()
                current_app.logger.info(f"Expired {count} trial organisations")
            
            return count
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error expiring trials: {str(e)}")
            return 0
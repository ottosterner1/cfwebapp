# app/models/organisation.py - Better approach: Keep Python enums, just match database values

from sqlalchemy import text, Index, Boolean
from app.extensions import db
from datetime import datetime, timezone, timedelta
from enum import Enum
from app.models import TennisClub

class SubscriptionStatus(Enum):
    TRIAL = 'TRIAL'           # Match database: uppercase values
    ACTIVE = 'ACTIVE'         # Match database: uppercase values  
    EXPIRED = 'EXPIRED'       # Match database: uppercase values
    SUSPENDED = 'SUSPENDED'   # Match database: uppercase values

class Organisation(db.Model):
    """Organisation model with manual subscription management"""
    __tablename__ = 'organisation'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    slug = db.Column(db.String(50), nullable=False, unique=True)
    sender_email = db.Column(db.String(120), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    
    # Keep using Python enum - just with correct values
    subscription_status = db.Column(db.Enum(SubscriptionStatus), default=SubscriptionStatus.TRIAL)
    trial_start_date = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    trial_end_date = db.Column(db.DateTime(timezone=True))
    
    # Manual management fields
    manually_activated_at = db.Column(db.DateTime(timezone=True))
    manually_activated_by_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    
    # Admin notes for manual management
    admin_notes = db.Column(db.Text)
    updated_at = db.Column(db.DateTime(timezone=True), onupdate=text('CURRENT_TIMESTAMP'))
    
    # Relationships
    clubs = db.relationship('TennisClub', back_populates='organisation')
    groups = db.relationship('TennisGroup', back_populates='organisation')
    report_templates = db.relationship('ReportTemplate', back_populates='organisation')
    manually_activated_by = db.relationship('User', foreign_keys=[manually_activated_by_id])
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Set default 30-day trial
        if not self.trial_end_date:
            self.trial_end_date = datetime.now(timezone.utc) + timedelta(days=30)
    
    @property
    def is_trial_active(self):
        """Check if trial is currently active"""
        if self.subscription_status != SubscriptionStatus.TRIAL:
            return False
        
        now = datetime.now(timezone.utc)
        return now <= self.trial_end_date
    
    @property
    def has_access(self):
        """Check if organisation has access"""
        if self.subscription_status == SubscriptionStatus.SUSPENDED:
            return False
        
        if self.subscription_status == SubscriptionStatus.ACTIVE:
            return True
            
        if self.subscription_status == SubscriptionStatus.TRIAL:
            return self.is_trial_active
            
        return False  # EXPIRED
    
    @property
    def days_until_expiry(self):
        """Get days until trial expires (0 if not trial)"""
        if self.subscription_status != SubscriptionStatus.TRIAL or not self.trial_end_date:
            return 0
            
        now = datetime.now(timezone.utc)
        delta = self.trial_end_date - now
        return max(0, delta.days)
    
    @property
    def access_level(self):
        """Get current access level for UI"""
        if self.subscription_status == SubscriptionStatus.ACTIVE:
            return 'full'
        elif self.subscription_status == SubscriptionStatus.SUSPENDED:
            return 'suspended'
        elif self.subscription_status == SubscriptionStatus.TRIAL:
            if not self.is_trial_active:
                return 'expired'
            
            days_left = self.days_until_expiry
            if days_left <= 3:
                return 'trial_ending'
            elif days_left <= 7:
                return 'trial_warning'
            else:
                return 'trial'
        else:  # EXPIRED
            return 'expired'
    
    def manually_activate(self, activated_by_user_id, notes=None):
        """Manually activate subscription (super admin action)"""
        self.subscription_status = SubscriptionStatus.ACTIVE
        self.manually_activated_at = datetime.now(timezone.utc)
        self.manually_activated_by_id = activated_by_user_id
        
        if notes:
            if self.admin_notes:
                self.admin_notes += f"\n{datetime.now().strftime('%Y-%m-%d')}: {notes}"
            else:
                self.admin_notes = f"{datetime.now().strftime('%Y-%m-%d')}: {notes}"
    
    def extend_trial(self, days=30, extended_by_user_id=None):
        """Extend trial period"""
        if self.subscription_status == SubscriptionStatus.TRIAL:
            if self.trial_end_date:
                self.trial_end_date += timedelta(days=days)
            else:
                self.trial_end_date = datetime.now(timezone.utc) + timedelta(days=days)
            
            note = f"Trial extended by {days} days"
            if extended_by_user_id:
                from app.models import User
                user = User.query.get(extended_by_user_id)
                note += f" by {user.name if user else 'admin'}"
            
            if self.admin_notes:
                self.admin_notes += f"\n{datetime.now().strftime('%Y-%m-%d')}: {note}"
            else:
                self.admin_notes = f"{datetime.now().strftime('%Y-%m-%d')}: {note}"
            
            return True
        return False
    
    def suspend_access(self, reason="Administrative action", suspended_by_user_id=None):
        """Suspend organisation access"""
        old_status = self.subscription_status
        self.subscription_status = SubscriptionStatus.SUSPENDED
        
        note = f"Suspended (was {old_status.value}): {reason}"
        if suspended_by_user_id:
            from app.models import User
            user = User.query.get(suspended_by_user_id)
            note += f" by {user.name if user else 'admin'}"
        
        if self.admin_notes:
            self.admin_notes += f"\n{datetime.now().strftime('%Y-%m-%d')}: {note}"
        else:
            self.admin_notes = f"{datetime.now().strftime('%Y-%m-%d')}: {note}"
    
    def expire_trial(self):
        """Mark trial as expired (automated or manual)"""
        if self.subscription_status == SubscriptionStatus.TRIAL:
            self.subscription_status = SubscriptionStatus.EXPIRED
            
            note = "Trial expired"
            if self.admin_notes:
                self.admin_notes += f"\n{datetime.now().strftime('%Y-%m-%d')}: {note}"
            else:
                self.admin_notes = f"{datetime.now().strftime('%Y-%m-%d')}: {note}"
    
    def get_status_message(self):
        """Get user-friendly status message"""
        if self.subscription_status == SubscriptionStatus.ACTIVE:
            if self.manually_activated_at:
                return f"Active subscription (activated {self.manually_activated_at.strftime('%B %d, %Y')})"
            return "Active subscription"
        elif self.subscription_status == SubscriptionStatus.TRIAL:
            if self.is_trial_active:
                return f"Free trial - {self.days_until_expiry} days remaining"
            else:
                return "Trial expired"
        elif self.subscription_status == SubscriptionStatus.EXPIRED:
            return "Access expired - contact support to reactivate"
        elif self.subscription_status == SubscriptionStatus.SUSPENDED:
            return "Account suspended - contact support"
        
        return "Status unknown"
    
    def get_admin_users(self):
        """Get all admin users across all clubs in this organisation"""
        from app.models import User, UserRole
        return User.query.join(TennisClub).filter(
            TennisClub.organisation_id == self.id,
            User.role.in_([UserRole.ADMIN, UserRole.SUPER_ADMIN])
        ).all()
    
    def get_primary_club(self):
        """Get the primary club for this organisation"""
        return self.clubs.order_by(TennisClub.name).first()
    
    def __repr__(self):
        return f'<Organisation {self.name} ({self.subscription_status.value})>'
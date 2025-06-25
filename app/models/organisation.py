# Update your app/models/organisation.py file with this content:

from sqlalchemy import text, Index
from app.extensions import db
from datetime import datetime, timezone

from app.models.core import TennisClub

class Organisation(db.Model):
    """Organisation model for grouping tennis clubs with email configuration"""
    __tablename__ = 'organisation'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    slug = db.Column(db.String(50), nullable=False, unique=True)
    sender_email = db.Column(db.String(120), nullable=True)  # Custom sender for reports
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    
    # Relationships
    clubs = db.relationship('TennisClub', back_populates='organisation')
    groups = db.relationship('TennisGroup', back_populates='organisation')
    report_templates = db.relationship('ReportTemplate', back_populates='organisation')
    
    def get_admin_users(self):
        """Get all admin users across all clubs in this organisation"""
        from app.models import User, UserRole
        return User.query.join(TennisClub).filter(
            TennisClub.organisation_id == self.id,
            User.role.in_([UserRole.ADMIN, UserRole.SUPER_ADMIN])
        ).all()
    
    def get_primary_club(self):
        """Get the primary club for this organisation (first club alphabetically)"""
        return self.clubs.order_by(TennisClub.name).first()
    
    def __repr__(self):
        return f'<Organisation {self.name}>'
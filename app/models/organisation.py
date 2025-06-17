# app/models/organisation.py
from sqlalchemy import text, Index
from app.extensions import db
from datetime import datetime, timezone

from app.models.core import TennisClub

class Organisation(db.Model):
    """Simple organisation model for grouping tennis clubs"""
    __tablename__ = 'organisation'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    slug = db.Column(db.String(50), nullable=False, unique=True)
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    
    # Relationships
    clubs = db.relationship('TennisClub', back_populates='organisation')
    report_templates = db.relationship('ReportTemplate', back_populates='organisation')
    
    def get_admin_users(self):
        """Get all admin users across all clubs in this organisation"""
        from app.models import User, UserRole
        return User.query.join(TennisClub).filter(
            TennisClub.organisation_id == self.id,
            User.role.in_([UserRole.ADMIN, UserRole.SUPER_ADMIN])
        ).all()
    
    def __repr__(self):
        return f'<Organisation {self.name}>'
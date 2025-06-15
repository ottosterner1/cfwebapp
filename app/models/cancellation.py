# Add this to app/models/cancellation.py

from sqlalchemy import text, Index, Boolean, String
from sqlalchemy.types import Enum as PGEnum
from app.extensions import db
from app.models.base import DayOfWeek
from datetime import datetime, timezone
from enum import Enum

class CancellationType(Enum):
    SESSION = 'session'          # Cancel specific session on specific date
    DAY = 'day'                 # Cancel all sessions on a specific day
    WEEK = 'week'               # Cancel entire week

class Cancellation(db.Model):
    """Model for tracking session cancellations at session, day, and week levels"""
    __tablename__ = 'cancellation'
    
    id = db.Column(db.Integer, primary_key=True)
    tennis_club_id = db.Column(db.Integer, db.ForeignKey('tennis_club.id'), nullable=False)
    created_by_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    
    # Cancellation type and scope
    cancellation_type = db.Column(PGEnum(CancellationType, name='cancellationtype'), nullable=False)
    
    # Date-based cancellations
    specific_date = db.Column(db.Date, nullable=True)  # For DAY and SESSION types
    week_start_date = db.Column(db.Date, nullable=True)  # For WEEK type
    week_end_date = db.Column(db.Date, nullable=True)    # For WEEK type
    
    # Session-specific cancellations
    group_time_id = db.Column(db.Integer, db.ForeignKey('tennis_group_times.id'), nullable=True)  # For SESSION type
    
    # Metadata
    reason = db.Column(db.Text, nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    updated_at = db.Column(db.DateTime(timezone=True), onupdate=text('CURRENT_TIMESTAMP'))
    
    # Relationships
    tennis_club = db.relationship('TennisClub', backref='cancellations')
    created_by = db.relationship('User', backref='cancellations_created')
    group_time = db.relationship('TennisGroupTimes', backref='cancellations')
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_cancellation_club_date', tennis_club_id, specific_date),
        Index('idx_cancellation_club_week', tennis_club_id, week_start_date, week_end_date),
        Index('idx_cancellation_group_time', group_time_id, specific_date),
    )
    
    def is_session_cancelled(self, group_time_id, session_date):
        """
        Check if this cancellation affects a specific session.
        
        Args:
            group_time_id: ID of the group time slot
            session_date: Date of the session (date object)
            
        Returns:
            bool: True if this cancellation cancels the session
        """
        if not self.is_active:
            return False
            
        if self.cancellation_type == CancellationType.SESSION:
            # Exact session match
            return (self.group_time_id == group_time_id and 
                   self.specific_date == session_date)
                   
        elif self.cancellation_type == CancellationType.DAY:
            # All sessions on this specific date
            return self.specific_date == session_date
            
        elif self.cancellation_type == CancellationType.WEEK:
            # All sessions within the week range
            return (self.week_start_date <= session_date <= self.week_end_date)
                    
        return False
    
    def __repr__(self):
        return f'<Cancellation id={self.id} type={self.cancellation_type.value} club_id={self.tennis_club_id}>'
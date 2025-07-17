# app/models/session_planning.py

from sqlalchemy import text, Index, Boolean, String
from sqlalchemy.types import Enum as PGEnum
from app.extensions import db
from datetime import datetime, timezone
from enum import Enum

class PlannedAttendanceStatus(Enum):
    PLANNED_PRESENT = 'planned_present'
    PLANNED_ABSENT = 'planned_absent'
    TRIAL_PLAYER = 'trial_player'
    MAKEUP_PLAYER = 'makeup_player'

class PlayerType(Enum):
    REGULAR = 'regular'
    MAKEUP = 'makeup'
    TRIAL = 'trial'

class SessionPlan(db.Model):
    """Model for advance planning of session attendance by admins"""
    __tablename__ = 'session_plan'
    
    id = db.Column(db.Integer, primary_key=True)
    group_time_id = db.Column(db.Integer, db.ForeignKey('tennis_group_times.id'), nullable=False)
    date = db.Column(db.Date, nullable=False)
    teaching_period_id = db.Column(db.Integer, db.ForeignKey('teaching_period.id'), nullable=False)
    tennis_club_id = db.Column(db.Integer, db.ForeignKey('tennis_club.id'), nullable=False)
    planned_by_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    
    # Planning metadata
    notes = db.Column(db.Text)
    is_active = db.Column(db.Boolean, default=True)
    
    # Timestamps
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    updated_at = db.Column(db.DateTime(timezone=True), onupdate=text('CURRENT_TIMESTAMP'))
    
    # Relationships
    group_time = db.relationship('TennisGroupTimes', backref='session_plans')
    teaching_period = db.relationship('TeachingPeriod', backref='session_plans')
    tennis_club = db.relationship('TennisClub', backref='session_plans')
    planned_by = db.relationship('User', backref='session_plans_created')
    
    # Related planning entries
    plan_entries = db.relationship('SessionPlanEntry', back_populates='session_plan', cascade='all, delete-orphan')
    trial_players = db.relationship('TrialPlayer', back_populates='session_plan', cascade='all, delete-orphan')
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_session_plan_group_time_date', group_time_id, date),
        Index('idx_session_plan_teaching_period', teaching_period_id),
        Index('idx_session_plan_club', tennis_club_id),
        Index('idx_session_plan_date', date),
        # Ensure only one plan per session
        db.UniqueConstraint('group_time_id', 'date', 'teaching_period_id', name='unique_session_plan'),
    )
    
    @property
    def session_description(self):
        """Get a human-readable description of the planned session"""
        group_name = self.group_time.tennis_group.name if self.group_time else "Unknown Group"
        day = self.group_time.day_of_week.value if self.group_time else "Unknown Day"
        start_time = self.group_time.start_time.strftime('%H:%M') if self.group_time and self.group_time.start_time else "Unknown Time"
        end_time = self.group_time.end_time.strftime('%H:%M') if self.group_time and self.group_time.end_time else "Unknown Time"
        
        return f"{group_name} - {day} {start_time}-{end_time} on {self.date.strftime('%Y-%m-%d')}"
    
    def get_plan_summary(self):
        """Get a summary of the planned changes"""
        total_entries = len(self.plan_entries)
        total_trials = len(self.trial_players)
        
        planned_absent = sum(1 for entry in self.plan_entries 
                           if entry.planned_status == PlannedAttendanceStatus.PLANNED_ABSENT)
        makeup_players = sum(1 for entry in self.plan_entries 
                           if entry.player_type == PlayerType.MAKEUP)
        
        return {
            'total_plan_entries': total_entries,
            'total_trial_players': total_trials,
            'planned_absent': planned_absent,
            'makeup_players': makeup_players,
            'has_changes': total_entries > 0 or total_trials > 0
        }
    
    def __repr__(self):
        return f'<SessionPlan id={self.id} group_time_id={self.group_time_id} date={self.date}>'


class SessionPlanEntry(db.Model):
    """Model for individual player planning entries within a session plan"""
    __tablename__ = 'session_plan_entry'
    
    id = db.Column(db.Integer, primary_key=True)
    session_plan_id = db.Column(db.Integer, db.ForeignKey('session_plan.id'), nullable=False)
    programme_player_id = db.Column(db.Integer, db.ForeignKey('programme_players.id'), nullable=False)
    
    # Planning details
    planned_status = db.Column(PGEnum(PlannedAttendanceStatus, name='plannedattendancestatus'), nullable=False)
    player_type = db.Column(PGEnum(PlayerType, name='playertype'), default=PlayerType.REGULAR)
    notes = db.Column(db.Text)
    
    # Timestamps
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    updated_at = db.Column(db.DateTime(timezone=True), onupdate=text('CURRENT_TIMESTAMP'))
    
    # Relationships
    session_plan = db.relationship('SessionPlan', back_populates='plan_entries')
    programme_player = db.relationship('ProgrammePlayers', backref='plan_entries')
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_session_plan_entry_plan', session_plan_id),
        Index('idx_session_plan_entry_player', programme_player_id),
        # Ensure one entry per player per plan
        db.UniqueConstraint('session_plan_id', 'programme_player_id', name='unique_plan_entry_player'),
    )
    
    @property
    def student_name(self):
        """Get the student name for this planned entry"""
        return self.programme_player.student.name if self.programme_player and self.programme_player.student else "Unknown Student"
    
    @property
    def is_regular_player(self):
        """Check if this is a regular player (not makeup)"""
        return self.player_type == PlayerType.REGULAR
    
    @property
    def is_makeup_player(self):
        """Check if this is a makeup player"""
        return self.player_type == PlayerType.MAKEUP
    
    def __repr__(self):
        return f'<SessionPlanEntry id={self.id} plan_id={self.session_plan_id} player_id={self.programme_player_id}>'


class TrialPlayer(db.Model):
    """Model for trial players (not yet enrolled) planned for sessions"""
    __tablename__ = 'trial_player'
    
    id = db.Column(db.Integer, primary_key=True)
    session_plan_id = db.Column(db.Integer, db.ForeignKey('session_plan.id'), nullable=False)
    
    # Trial player details
    name = db.Column(db.String(100), nullable=False)
    contact_email = db.Column(db.String(120))
    contact_number = db.Column(db.String(20))
    emergency_contact_number = db.Column(db.String(20))
    date_of_birth = db.Column(db.Date)
    medical_information = db.Column(db.Text)
    notes = db.Column(db.Text)
    
    # Planning metadata
    planned_status = db.Column(PGEnum(PlannedAttendanceStatus, name='plannedattendancestatus'), 
                              default=PlannedAttendanceStatus.TRIAL_PLAYER)
    
    # Timestamps
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    updated_at = db.Column(db.DateTime(timezone=True), onupdate=text('CURRENT_TIMESTAMP'))
    
    # Relationships
    session_plan = db.relationship('SessionPlan', back_populates='trial_players')
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_trial_player_session_plan', session_plan_id),
        Index('idx_trial_player_name', name),
        Index('idx_trial_player_email', contact_email),
    )
    
    def to_dict(self):
        """Convert trial player to dictionary for API responses"""
        return {
            'id': self.id,
            'session_plan_id': self.session_plan_id,
            'name': self.name,
            'contact_email': self.contact_email,
            'contact_number': self.contact_number,
            'emergency_contact_number': self.emergency_contact_number,
            'date_of_birth': self.date_of_birth.isoformat() if self.date_of_birth else None,
            'medical_information': self.medical_information,
            'notes': self.notes,
            'planned_status': self.planned_status.value,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    def __repr__(self):
        return f'<TrialPlayer id={self.id} name={self.name} plan_id={self.session_plan_id}>'
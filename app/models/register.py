from sqlalchemy import text, Index, Boolean
from app.extensions import db
from app.models.base import AttendanceStatus, RegisterStatus
from datetime import datetime, timezone

class Register(db.Model):
    __tablename__ = 'register'
    
    id = db.Column(db.Integer, primary_key=True)
    group_time_id = db.Column(db.Integer, db.ForeignKey('tennis_group_times.id'), nullable=False)
    coach_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    date = db.Column(db.Date, nullable=False)
    teaching_period_id = db.Column(db.Integer, db.ForeignKey('teaching_period.id'), nullable=False)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    updated_at = db.Column(db.DateTime(timezone=True), onupdate=text('CURRENT_TIMESTAMP'))
    tennis_club_id = db.Column(db.Integer, db.ForeignKey('tennis_club.id'), nullable=False)
    
    # Relationships
    group_time = db.relationship('TennisGroupTimes', back_populates='registers')
    coach = db.relationship('User', backref='registers')
    teaching_period = db.relationship('TeachingPeriod', backref='registers')
    tennis_club = db.relationship('TennisClub', backref='registers')
    entries = db.relationship('RegisterEntry', back_populates='register', cascade='all, delete-orphan')
    assistant_coaches = db.relationship('RegisterAssistantCoach', back_populates='register', cascade='all, delete-orphan')
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_register_date_coach', date, coach_id),
        Index('idx_register_group_time', group_time_id, date),
        Index('idx_register_teaching_period', teaching_period_id),
    )
    
    @property
    def attendance_rate(self):
        """Calculate the attendance rate for this register"""
        if not self.entries:
            return 0
            
        present_count = sum(1 for entry in self.entries 
                           if entry.attendance_status == AttendanceStatus.PRESENT)
        late_count = sum(1 for entry in self.entries 
                         if entry.attendance_status == AttendanceStatus.AWAY_WITH_NOTICE)
        total_count = len(self.entries)
        
        return round(((present_count + late_count) / total_count) * 100, 1) if total_count > 0 else 0
    
    def __repr__(self):
        return f'<Register id={self.id} date={self.date} group_time_id={self.group_time_id}>'


class RegisterEntry(db.Model):
    __tablename__ = 'register_entry'
    
    id = db.Column(db.Integer, primary_key=True)
    register_id = db.Column(db.Integer, db.ForeignKey('register.id'), nullable=False)
    programme_player_id = db.Column(db.Integer, db.ForeignKey('programme_players.id'), nullable=False)
    attendance_status = db.Column(db.Enum(AttendanceStatus), default=AttendanceStatus.ABSENT)
    predicted_attendance = db.Column(Boolean, default=False)  # New column for predicted attendance
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    updated_at = db.Column(db.DateTime(timezone=True), onupdate=text('CURRENT_TIMESTAMP'))
    
    # Relationships
    register = db.relationship('Register', back_populates='entries')
    programme_player = db.relationship('ProgrammePlayers', backref='register_entries')
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_register_entry_register', register_id),
        Index('idx_register_entry_player', programme_player_id),
        # Ensure one entry per student per register
        Index('idx_register_entry_unique', register_id, programme_player_id, unique=True),
    )
    
    def __repr__(self):
        return f'<RegisterEntry id={self.id} register_id={self.register_id} status={self.attendance_status.value}>'
    
class RegisterAssistantCoach(db.Model):
    __tablename__ = 'register_assistant_coach'
    
    id = db.Column(db.Integer, primary_key=True)
    register_id = db.Column(db.Integer, db.ForeignKey('register.id'), nullable=False)
    coach_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    
    # Relationships
    register = db.relationship('Register', back_populates='assistant_coaches')
    coach = db.relationship('User', backref='assisted_registers')

    # Add index for performance
    __table_args__ = (
        Index('idx_register_assistant_coach', register_id, coach_id, unique=True),
    )
    
    def __repr__(self):
        return f'<RegisterAssistantCoach register_id={self.register_id} coach_id={self.coach_id}>'
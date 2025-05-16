from sqlalchemy import text, Index
from sqlalchemy.dialects.postgresql import JSONB
from app.extensions import db
from datetime import datetime, timezone
from app.models.base import DayOfWeek, FieldType

class TennisGroup(db.Model):
    __tablename__ = 'tennis_group'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    description = db.Column(db.String(200))
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    tennis_club_id = db.Column(db.Integer, db.ForeignKey('tennis_club.id'), nullable=False)

    # Relationships
    tennis_club = db.relationship('TennisClub', back_populates='groups')
    reports = db.relationship('Report', foreign_keys='Report.group_id', back_populates='tennis_group')
    recommended_in_reports = db.relationship('Report', foreign_keys='Report.recommended_group_id', backref='recommended_group')
    programme_players = db.relationship('ProgrammePlayers', back_populates='tennis_group', lazy='dynamic')
    template_associations = db.relationship(
        'GroupTemplate', 
        back_populates='group', 
        cascade='all, delete-orphan',
        overlaps="templates,groups,group_associations"
    )
    templates = db.relationship(
        'ReportTemplate', 
        secondary='group_template', 
        back_populates='groups',
        overlaps="template_associations,group_associations"
    )
    group_times = db.relationship(
        'TennisGroupTimes', 
        back_populates='tennis_group', 
        cascade='all, delete-orphan',
        lazy='joined'
    )

class TennisGroupTimes(db.Model):
    __tablename__ = 'tennis_group_times'

    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey('tennis_group.id'), nullable=False)
    day_of_week = db.Column(db.Enum(DayOfWeek), nullable=False)
    start_time = db.Column(db.Time, nullable=False)
    end_time = db.Column(db.Time, nullable=False)
    capacity = db.Column(db.Integer, nullable=True)
    tennis_club_id = db.Column(db.Integer, db.ForeignKey('tennis_club.id'), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))

    # Relationships
    tennis_group = db.relationship('TennisGroup', back_populates='group_times')
    tennis_club = db.relationship('TennisClub', backref='group_times')
    programme_players = db.relationship('ProgrammePlayers', back_populates='group_time', lazy='dynamic')
    registers = db.relationship('Register', back_populates='group_time')

    def __repr__(self):
        return f'<TennisGroupTime {self.tennis_group.name} {self.day_of_week.value} {self.start_time}-{self.end_time}>'

class ProgrammePlayers(db.Model):
    __tablename__ = 'programme_players'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('student.id'), nullable=False)
    coach_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    group_id = db.Column(db.Integer, db.ForeignKey('tennis_group.id'), nullable=False)
    group_time_id = db.Column(db.Integer, db.ForeignKey('tennis_group_times.id'), nullable=True)
    teaching_period_id = db.Column(db.Integer, db.ForeignKey('teaching_period.id'), nullable=False)
    tennis_club_id = db.Column(db.Integer, db.ForeignKey('tennis_club.id'), nullable=False)
    report_submitted = db.Column(db.Boolean, default=False)
    walk_home = db.Column(db.Boolean, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))

    # Relationships remain the same
    student = db.relationship('Student', back_populates='programme_players')
    coach = db.relationship('User', back_populates='programme_players')
    tennis_group = db.relationship('TennisGroup', back_populates='programme_players')
    group_time = db.relationship('TennisGroupTimes', back_populates='programme_players')
    teaching_period = db.relationship('TeachingPeriod', back_populates='programme_players')
    tennis_club = db.relationship('TennisClub', back_populates='programme_players')
    reports = db.relationship('Report', back_populates='programme_player', lazy='dynamic')

class Report(db.Model):
    __tablename__ = 'report'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('student.id'), nullable=False)
    coach_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    group_id = db.Column(db.Integer, db.ForeignKey('tennis_group.id'), nullable=False)
    recommended_group_id = db.Column(db.Integer, db.ForeignKey('tennis_group.id'), nullable=True)
    teaching_period_id = db.Column(db.Integer, db.ForeignKey('teaching_period.id'), nullable=False)
    programme_player_id = db.Column(db.Integer, db.ForeignKey('programme_players.id'), nullable=False)
    template_id = db.Column(db.Integer, db.ForeignKey('report_template.id'), nullable=False)
    content = db.Column(JSONB, nullable=False)  # Structured report data
    date = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    is_draft = db.Column(db.Boolean, default=False)
    last_updated = db.Column(db.DateTime(timezone=True), onupdate=text('CURRENT_TIMESTAMP'))

    # Enhanced email tracking fields
    email_sent = db.Column(db.Boolean, default=False)
    email_sent_at = db.Column(db.DateTime(timezone=True))
    email_recipients = db.Column(JSONB)
    email_history = db.Column(JSONB, default=[])
    last_email_status = db.Column(db.String(255))
    email_message_id = db.Column(db.String(100)) 
    email_attempts = db.Column(db.Integer, default=0)

    # Relationships
    student = db.relationship('Student', back_populates='reports')
    coach = db.relationship('User', back_populates='reports')
    tennis_group = db.relationship('TennisGroup', 
                                 foreign_keys=[group_id],
                                 back_populates='reports')
    teaching_period = db.relationship('TeachingPeriod', back_populates='reports')
    programme_player = db.relationship('ProgrammePlayers', back_populates='reports')
    template = db.relationship('ReportTemplate', back_populates='reports')

    def can_send_email(self, is_bulk_send=False) -> tuple[bool, str]:
        """
        Check if email can be sent and return (bool, reason)
        
        Args:
            is_bulk_send (bool): If True, checks if email has already been sent
        """
        if not self.student.contact_email:
            return False, "No contact email available for this student"
            
        # Only check email_sent status for bulk sends
        if is_bulk_send and self.email_sent:
            return False, "Report has already been sent"
            
        return True, "OK"

    @property
    def status(self):
        if self.is_draft:
            return 'draft'
        else:
            return 'submitted'

    def record_email_attempt(self, status: str, recipients: list, subject: str, 
                           message_id: str = None, error: str = None):
        """Record a detailed email attempt"""
        if self.email_history is None:
            self.email_history = []
            
        attempt = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'status': status,
            'recipients': recipients,
            'subject': subject,
            'message_id': message_id,
            'error': error
        }
        
        # Initialize email_attempts if it's None
        if self.email_attempts is None:
            self.email_attempts = 0
            
        # Increment attempts counter for all cases
        self.email_attempts += 1
        
        # Add to history
        self.email_history.append(attempt)
        
        # Update status based on result
        if status == 'success':
            self.email_sent = True
            self.email_sent_at = datetime.now(timezone.utc)
            self.last_email_status = 'Success'
            self.email_recipients = recipients
            self.email_message_id = message_id
        elif status == 'skipped':
            self.last_email_status = f'Skipped: {error}'
        else:
            self.last_email_status = f'Failed: {error}'
        
        db.session.add(self)
        db.session.commit()

    def is_student_under_18(self):
        """Check if the student is under 18"""
        if not self.student.date_of_birth:
            return True  # Default to safest option if no birth date
        
        today = datetime.now(timezone.utc).date()
        age = today.year - self.student.date_of_birth.year
        # Adjust age if birthday hasn't occurred this year
        if today.month < self.student.date_of_birth.month or \
           (today.month == self.student.date_of_birth.month and 
            today.day < self.student.date_of_birth.day):
            age -= 1
        return age < 18

class ReportTemplate(db.Model):
    __tablename__ = 'report_template'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    tennis_club_id = db.Column(db.Integer, db.ForeignKey('tennis_club.id'), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    created_by_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    
    # Relationships
    tennis_club = db.relationship('TennisClub', backref='report_templates')
    created_by = db.relationship('User', backref='created_templates')
    sections = db.relationship('TemplateSection', back_populates='template', cascade='all, delete-orphan')
    reports = db.relationship('Report', back_populates='template')
    group_associations = db.relationship(
        'GroupTemplate', 
        back_populates='template', 
        cascade='all, delete-orphan',
        overlaps="groups,templates" 
    )
    groups = db.relationship(
        'TennisGroup', 
        secondary='group_template', 
        back_populates='templates',
        overlaps="group_associations,template_associations"
    )

class TemplateSection(db.Model):
    __tablename__ = 'template_section'

    id = db.Column(db.Integer, primary_key=True)
    template_id = db.Column(db.Integer, db.ForeignKey('report_template.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    order = db.Column(db.Integer, nullable=False)
    
    # Relationships
    template = db.relationship('ReportTemplate', back_populates='sections')
    fields = db.relationship('TemplateField', back_populates='section', cascade='all, delete-orphan')

class TemplateField(db.Model):
    __tablename__ = 'template_field'

    id = db.Column(db.Integer, primary_key=True)
    section_id = db.Column(db.Integer, db.ForeignKey('template_section.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    field_type = db.Column(db.Enum(FieldType), nullable=False)
    is_required = db.Column(db.Boolean, default=True)
    order = db.Column(db.Integer, nullable=False)
    options = db.Column(JSONB)  # For select/rating fields
    
    # Relationships
    section = db.relationship('TemplateSection', back_populates='fields')

class GroupTemplate(db.Model):
    __tablename__ = 'group_template'

    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey('tennis_group.id'), nullable=False)
    template_id = db.Column(db.Integer, db.ForeignKey('report_template.id'), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    
    # Relationships
    group = db.relationship('TennisGroup', 
                          back_populates='template_associations', 
                          overlaps="templates,groups")
    template = db.relationship('ReportTemplate', 
                             back_populates='group_associations',
                             overlaps="templates,groups")
from sqlalchemy import text, Index, Boolean, Float, Enum as SQLAEnum
from sqlalchemy.dialects.postgresql import JSONB
from app.extensions import db
from datetime import datetime, timezone, timedelta
from enum import Enum
from app.models.base import uk_timezone

class SurveyQuestionType(Enum):
    TEXT = 'text'
    TEXTAREA = 'textarea'
    RATING = 'rating'
    MULTIPLE_CHOICE = 'multiple_choice'
    YES_NO = 'yes_no'
    NPS = 'nps'

class SurveyTriggerType(Enum):
    MANUAL = 'manual'
    END_OF_TERM = 'end_of_term'
    NEW_STUDENT = 'new_student'
    PERIODIC = 'periodic'
    COACHING_CHANGE = 'coaching_change'
    FACILITY_UPDATE = 'facility_update'

class SurveyStatus(Enum):
    DRAFT = 'draft'
    ACTIVE = 'active'
    PAUSED = 'paused'
    COMPLETED = 'completed'
    ARCHIVED = 'archived'

class SurveyTemplate(db.Model):
    """Survey template that can be reused across different campaigns"""
    __tablename__ = 'survey_template'
    
    id = db.Column(db.Integer, primary_key=True)
    tennis_club_id = db.Column(db.Integer, db.ForeignKey('tennis_club.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    is_active = db.Column(db.Boolean, default=True)
    
    # GDPR Compliance fields
    lawful_basis = db.Column(db.String(50), default='legitimate_interests')
    purpose_statement = db.Column(db.Text, nullable=False)  # Why we're collecting this data
    retention_days = db.Column(db.Integer, default=730)  # 2 years default
    max_frequency_days = db.Column(db.Integer, default=90)  # Quarterly max
    
    # Survey settings
    allow_anonymous = db.Column(db.Boolean, default=True)
    collect_contact_info = db.Column(db.Boolean, default=False)
    send_reminder = db.Column(db.Boolean, default=True)
    reminder_days = db.Column(db.Integer, default=7)
    
    # Metadata
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    updated_at = db.Column(db.DateTime(timezone=True), onupdate=text('CURRENT_TIMESTAMP'))
    created_by_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    
    # Relationships
    tennis_club = db.relationship('TennisClub', backref='survey_templates')
    created_by = db.relationship('User', backref='created_survey_templates')
    questions = db.relationship('SurveyQuestion', back_populates='template', cascade='all, delete-orphan', order_by='SurveyQuestion.order_index')
    campaigns = db.relationship('SurveyCampaign', back_populates='template')
    
    # Indexes
    __table_args__ = (
        Index('idx_survey_template_club', tennis_club_id),
        Index('idx_survey_template_active', tennis_club_id, is_active),
    )
    
    def __repr__(self):
        return f'<SurveyTemplate {self.name} (Club: {self.tennis_club_id})>'

class SurveyQuestion(db.Model):
    """Individual questions within a survey template"""
    __tablename__ = 'survey_question'
    
    id = db.Column(db.Integer, primary_key=True)
    template_id = db.Column(db.Integer, db.ForeignKey('survey_template.id'), nullable=False)
    question_text = db.Column(db.Text, nullable=False)
    question_type = db.Column(SQLAEnum(SurveyQuestionType, name='surveyquestiontype'), nullable=False)
    is_required = db.Column(db.Boolean, default=False)
    order_index = db.Column(db.Integer, nullable=False)
    
    # Question configuration (stored as JSON)
    options = db.Column(JSONB)  # For multiple choice, rating scales, etc.
    help_text = db.Column(db.Text)  # Additional guidance for respondents
    
    # Conditional logic (future enhancement)
    show_if_condition = db.Column(JSONB)  # Show this question if previous answer meets condition
    
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    updated_at = db.Column(db.DateTime(timezone=True), onupdate=text('CURRENT_TIMESTAMP'))
    
    # Relationships
    template = db.relationship('SurveyTemplate', back_populates='questions')
    
    # Indexes
    __table_args__ = (
        Index('idx_survey_question_template', template_id, order_index),
    )
    
    @property
    def default_options(self):
        """Get default options based on question type"""
        defaults = {
            SurveyQuestionType.RATING: {
                'min': 1,
                'max': 5,
                'labels': ['Poor', 'Fair', 'Good', 'Very Good', 'Excellent']
            },
            SurveyQuestionType.YES_NO: {
                'options': ['Yes', 'No']
            },
            SurveyQuestionType.NPS: {
                'min': 0,
                'max': 10,
                'low_label': 'Not at all likely',
                'high_label': 'Extremely likely'
            }
        }
        return defaults.get(self.question_type, {})
    
    def __repr__(self):
        return f'<SurveyQuestion {self.id}: {self.question_text[:50]}...>'

class SurveyCampaign(db.Model):
    """A specific instance of sending a survey template to recipients"""
    __tablename__ = 'survey_campaign'
    
    id = db.Column(db.Integer, primary_key=True)
    tennis_club_id = db.Column(db.Integer, db.ForeignKey('tennis_club.id'), nullable=False)
    template_id = db.Column(db.Integer, db.ForeignKey('survey_template.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    
    # Campaign settings
    status = db.Column(SQLAEnum(SurveyStatus, name='surveystatus'), default=SurveyStatus.DRAFT)
    trigger_type = db.Column(SQLAEnum(SurveyTriggerType, name='surveytriggertype'), default=SurveyTriggerType.MANUAL)
    
    # Targeting
    teaching_period_id = db.Column(db.Integer, db.ForeignKey('teaching_period.id'), nullable=True)
    group_id = db.Column(db.Integer, db.ForeignKey('tennis_group.id'), nullable=True)
    coach_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)  # Optional: specific coach's students
    
    # Scheduling
    scheduled_send_date = db.Column(db.DateTime(timezone=True))
    actual_send_date = db.Column(db.DateTime(timezone=True))
    reminder_send_date = db.Column(db.DateTime(timezone=True))
    close_date = db.Column(db.DateTime(timezone=True))  # When to stop accepting responses
    
    # Campaign statistics
    total_recipients = db.Column(db.Integer, default=0)
    emails_sent = db.Column(db.Integer, default=0)
    emails_delivered = db.Column(db.Integer, default=0)
    emails_bounced = db.Column(db.Integer, default=0)
    responses_received = db.Column(db.Integer, default=0)
    
    # Metadata
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    updated_at = db.Column(db.DateTime(timezone=True), onupdate=text('CURRENT_TIMESTAMP'))
    created_by_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    
    # Relationships
    tennis_club = db.relationship('TennisClub', backref='survey_campaigns')
    template = db.relationship('SurveyTemplate', back_populates='campaigns')
    teaching_period = db.relationship('TeachingPeriod', backref='survey_campaigns')
    group = db.relationship('TennisGroup', backref='survey_campaigns')
    coach = db.relationship('User', foreign_keys=[coach_id], backref='targeted_survey_campaigns')
    created_by = db.relationship('User', foreign_keys=[created_by_id], backref='created_survey_campaigns')
    
    recipients = db.relationship('SurveyRecipient', back_populates='campaign', cascade='all, delete-orphan')
    responses = db.relationship('SurveyResponse', back_populates='campaign')
    
    # Indexes
    __table_args__ = (
        Index('idx_survey_campaign_club', tennis_club_id),
        Index('idx_survey_campaign_status', status),
        Index('idx_survey_campaign_schedule', scheduled_send_date),
    )
    
    @property
    def response_rate(self):
        """Calculate response rate as percentage"""
        if self.emails_delivered == 0:
            return 0
        return round((self.responses_received / self.emails_delivered) * 100, 1)
    
    def __repr__(self):
        return f'<SurveyCampaign {self.name} (Club: {self.tennis_club_id})>'

class SurveyRecipient(db.Model):
    """Track who was sent each survey campaign"""
    __tablename__ = 'survey_recipient'
    
    id = db.Column(db.Integer, primary_key=True)
    campaign_id = db.Column(db.Integer, db.ForeignKey('survey_campaign.id'), nullable=False)
    tennis_club_id = db.Column(db.Integer, db.ForeignKey('tennis_club.id'), nullable=False)
    
    # Recipient information
    email = db.Column(db.String(120), nullable=False)
    student_id = db.Column(db.Integer, db.ForeignKey('student.id'), nullable=True)  # Optional link to student
    recipient_name = db.Column(db.String(100))  # For personalization
    student_name = db.Column(db.String(100))  # Child's name for context
    
    # Survey access
    survey_token = db.Column(db.String(100), unique=True, nullable=False)  # Unique survey access token
    opt_out_token = db.Column(db.String(100), unique=True, nullable=False)  # Unique opt-out token
    
    # Email tracking
    email_sent_at = db.Column(db.DateTime(timezone=True))
    email_delivered_at = db.Column(db.DateTime(timezone=True))
    email_bounced_at = db.Column(db.DateTime(timezone=True))
    email_opened_at = db.Column(db.DateTime(timezone=True))  # If tracking enabled
    
    # Response tracking
    survey_opened_at = db.Column(db.DateTime(timezone=True))
    survey_completed_at = db.Column(db.DateTime(timezone=True))
    reminder_sent_at = db.Column(db.DateTime(timezone=True))
    
    # GDPR compliance
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)  # When token expires
    
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    
    # Relationships
    campaign = db.relationship('SurveyCampaign', back_populates='recipients')
    student = db.relationship('Student', backref='survey_recipients')
    tennis_club = db.relationship('TennisClub', backref='survey_recipients')
    
    # Indexes
    __table_args__ = (
        Index('idx_survey_recipient_campaign', campaign_id),
        Index('idx_survey_recipient_token', survey_token),
        Index('idx_survey_recipient_email', tennis_club_id, email),
        Index('idx_survey_recipient_expires', expires_at),
    )
    
    @classmethod
    def generate_tokens(cls):
        """Generate secure tokens for survey access and opt-out"""
        import secrets
        return {
            'survey_token': secrets.token_urlsafe(32),
            'opt_out_token': secrets.token_urlsafe(32)
        }
    
    def is_expired(self):
        """Check if survey access has expired"""
        return datetime.now(timezone.utc) > self.expires_at
    
    def __repr__(self):
        return f'<SurveyRecipient {self.email} (Campaign: {self.campaign_id})>'

class SurveyResponse(db.Model):
    """Individual responses to survey campaigns"""
    __tablename__ = 'survey_response'
    
    id = db.Column(db.Integer, primary_key=True)
    campaign_id = db.Column(db.Integer, db.ForeignKey('survey_campaign.id'), nullable=False)
    template_id = db.Column(db.Integer, db.ForeignKey('survey_template.id'), nullable=False)
    tennis_club_id = db.Column(db.Integer, db.ForeignKey('tennis_club.id'), nullable=False)
    recipient_id = db.Column(db.Integer, db.ForeignKey('survey_recipient.id'), nullable=True)  # Null for anonymous
    
    # Response data
    responses = db.Column(JSONB, nullable=False)  # {"question_1": "answer", "question_2": 5, ...}
    
    # Optional demographic/context data
    respondent_type = db.Column(db.String(50))  # 'parent', 'student', 'guardian'
    student_age_group = db.Column(db.String(20))  # Age bracket for analytics
    group_name = db.Column(db.String(50))  # Tennis group for context
    
    # Response metadata
    is_complete = db.Column(db.Boolean, default=False)
    completion_time_seconds = db.Column(db.Integer)  # How long survey took
    ip_address = db.Column(db.String(45))  # For fraud detection (anonymized after period)
    user_agent = db.Column(db.String(200))  # For analytics
    
    # Timestamps
    started_at = db.Column(db.DateTime(timezone=True))
    submitted_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    
    # GDPR compliance
    retention_expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    anonymized_at = db.Column(db.DateTime(timezone=True))  # When PII was removed
    
    # Relationships
    campaign = db.relationship('SurveyCampaign', back_populates='responses')
    template = db.relationship('SurveyTemplate', backref='responses')
    tennis_club = db.relationship('TennisClub', backref='survey_responses')
    recipient = db.relationship('SurveyRecipient', backref='responses')
    
    # Indexes
    __table_args__ = (
        Index('idx_survey_response_campaign', campaign_id),
        Index('idx_survey_response_club', tennis_club_id, submitted_at),
        Index('idx_survey_response_retention', retention_expires_at),
    )
    
    def get_answer(self, question_id):
        """Get answer for a specific question"""
        return self.responses.get(str(question_id))
    
    def calculate_nps_score(self, nps_question_id):
        """Calculate NPS category for a specific NPS question"""
        score = self.get_answer(nps_question_id)
        if score is None:
            return None
        
        if score >= 9:
            return 'promoter'
        elif score >= 7:
            return 'passive'
        else:
            return 'detractor'
    
    def anonymize(self):
        """Remove PII from response while keeping analytics data"""
        self.ip_address = None
        self.user_agent = None
        self.recipient_id = None
        self.anonymized_at = datetime.now(timezone.utc)
    
    def __repr__(self):
        return f'<SurveyResponse {self.id} (Campaign: {self.campaign_id})>'

class SurveyOptOut(db.Model):
    """Track users who have opted out of receiving surveys"""
    __tablename__ = 'survey_opt_out'
    
    id = db.Column(db.Integer, primary_key=True)
    tennis_club_id = db.Column(db.Integer, db.ForeignKey('tennis_club.id'), nullable=False)
    email = db.Column(db.String(120), nullable=False)
    
    # Opt-out details
    opted_out_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    source = db.Column(db.String(50))  # 'survey_link', 'email_request', 'admin_portal'
    campaign_id = db.Column(db.Integer, db.ForeignKey('survey_campaign.id'), nullable=True)  # Which campaign triggered opt-out
    reason = db.Column(db.String(200))  # Optional reason
    
    # Admin fields
    opted_back_in_at = db.Column(db.DateTime(timezone=True))  # If they later opt back in
    notes = db.Column(db.Text)  # Admin notes
    
    # Relationships
    tennis_club = db.relationship('TennisClub', backref='survey_opt_outs')
    campaign = db.relationship('SurveyCampaign', backref='caused_opt_outs')
    
    # Constraints and indexes
    __table_args__ = (
        db.UniqueConstraint('tennis_club_id', 'email', name='unique_club_email_optout'),
        Index('idx_survey_opt_out_email', tennis_club_id, email),
    )
    
    @classmethod
    def is_opted_out(cls, tennis_club_id, email):
        """Check if an email is opted out for a specific club"""
        return cls.query.filter_by(
            tennis_club_id=tennis_club_id,
            email=email.lower(),
            opted_back_in_at=None  # Not opted back in
        ).first() is not None
    
    def __repr__(self):
        return f'<SurveyOptOut {self.email} (Club: {self.tennis_club_id})>'

class ClubComplianceStatus(db.Model):
    """Track GDPR compliance status for each tennis club's survey feature"""
    __tablename__ = 'club_compliance_status'
    
    id = db.Column(db.Integer, primary_key=True)
    tennis_club_id = db.Column(db.Integer, db.ForeignKey('tennis_club.id'), nullable=False, unique=True)
    
    # Legitimate Interest Assessment (LIA) tracking
    lia_completed = db.Column(db.Boolean, default=False)
    lia_completed_at = db.Column(db.DateTime(timezone=True))
    lia_completed_by_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    lia_purpose_statement = db.Column(db.Text)
    lia_balancing_assessment = db.Column(db.Text)
    lia_safeguards = db.Column(JSONB)  # List of safeguards implemented
    
    # Privacy policy compliance
    privacy_policy_updated = db.Column(db.Boolean, default=False)
    privacy_policy_updated_at = db.Column(db.DateTime(timezone=True))
    privacy_policy_url = db.Column(db.String(255))
    
    # Data retention policy
    default_retention_days = db.Column(db.Integer, default=730)  # 2 years
    data_retention_policy_url = db.Column(db.String(255))
    
    # Survey feature status
    surveys_enabled = db.Column(db.Boolean, default=False)
    surveys_enabled_at = db.Column(db.DateTime(timezone=True))
    surveys_enabled_by_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    
    # Compliance monitoring
    last_compliance_review = db.Column(db.DateTime(timezone=True))
    compliance_notes = db.Column(db.Text)
    requires_review = db.Column(db.Boolean, default=False)
    
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    updated_at = db.Column(db.DateTime(timezone=True), onupdate=text('CURRENT_TIMESTAMP'))
    
    # Relationships
    tennis_club = db.relationship('TennisClub', backref=db.backref('compliance_status', uselist=False))
    lia_completed_by = db.relationship('User', foreign_keys=[lia_completed_by_id])
    surveys_enabled_by = db.relationship('User', foreign_keys=[surveys_enabled_by_id])
    
    @property
    def is_compliant(self):
        """Check if club meets all compliance requirements"""
        return (self.lia_completed and 
                self.privacy_policy_updated and 
                self.surveys_enabled)
    
    @property
    def compliance_percentage(self):
        """Calculate compliance completion percentage"""
        total_requirements = 3  # LIA, Privacy Policy, Enabled
        completed = sum([
            self.lia_completed,
            self.privacy_policy_updated,
            self.surveys_enabled
        ])
        return round((completed / total_requirements) * 100)
    
    def __repr__(self):
        return f'<ClubComplianceStatus Club: {self.tennis_club_id} ({self.compliance_percentage}% complete)>'
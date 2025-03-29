import os
import boto3
import secrets
from flask import current_app
from flask_login import UserMixin
from sqlalchemy import Index, text
from sqlalchemy.types import Enum as PGEnum
from app.extensions import db
from datetime import datetime, timezone, timedelta
from app.models.base import UserRole, CoachQualification, CoachRole, uk_timezone

class TennisClub(db.Model):
    __tablename__ = 'tennis_club'
    __table_args__ = (
        Index('idx_tennis_club_subdomain', 'subdomain', unique=True),
    )

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    subdomain = db.Column(db.String(50), nullable=False)
    logo_url = db.Column(db.String(255))
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))

    # Relationships
    users = db.relationship('User', back_populates='tennis_club', lazy='dynamic')
    groups = db.relationship('TennisGroup', back_populates='tennis_club', lazy='dynamic')
    teaching_periods = db.relationship('TeachingPeriod', back_populates='tennis_club', lazy='dynamic')
    students = db.relationship('Student', back_populates='tennis_club', lazy='dynamic')
    programme_players = db.relationship('ProgrammePlayers', back_populates='tennis_club', lazy='dynamic')
    
    def _get_presigned_url_with_timestamp(self):
        """Generate and cache presigned URL with timestamp"""
        if not self.logo_url:
            return None, None
            
        try:
            s3_client = boto3.client(
                's3',
                aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
                aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY'),
                region_name=os.environ.get('AWS_S3_REGION')
            )
            
            # Increased expiration time to 1 hour (3600 seconds)
            url = s3_client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': os.environ.get('AWS_S3_BUCKET'),
                    'Key': self.logo_url,
                    'ResponseContentType': 'image/*'  # Ensure proper content type
                },
                ExpiresIn=3600
            )
            
            return url, datetime.now(timezone.utc)
        except Exception as e:
            current_app.logger.error(f"Error generating presigned URL: {str(e)}")
            return None, None

    @property
    def logo_presigned_url(self):
        """Get presigned URL with improved caching"""
        url, timestamp = self._get_presigned_url_with_timestamp()
        
        # If URL is None or more than 45 minutes old, generate a new one
        if url is None or timestamp is None or \
           datetime.now(timezone.utc) - timestamp > timedelta(minutes=45):
            # Clear the cache and generate new URL
            self._get_presigned_url_with_timestamp.cache_clear()
            url, _ = self._get_presigned_url_with_timestamp()
            
        return url if url else ''

class User(UserMixin, db.Model):
    __tablename__ = 'user'
    __table_args__ = (
        Index('idx_user_email_lower', text('lower(email)'), unique=True),
    )

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), nullable=False)
    username = db.Column(db.String(80), nullable=False, unique=True)
    name = db.Column(db.String(100))
    role = db.Column(PGEnum(UserRole, name='userrole'), nullable=False, default=UserRole.COACH)
    is_active = db.Column(db.Boolean, default=True)
    auth_provider = db.Column(db.String(20), default='email')
    auth_provider_id = db.Column(db.String(200))
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    tennis_club_id = db.Column(db.Integer, db.ForeignKey('tennis_club.id'), nullable=False)

    # Relationships
    tennis_club = db.relationship('TennisClub', back_populates='users')
    reports = db.relationship('Report', back_populates='coach', lazy='dynamic')
    programme_players = db.relationship('ProgrammePlayers', back_populates='coach', lazy='dynamic')

    @property
    def is_admin(self):
        return self.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN]
    
    @property
    def is_super_admin(self):
        return self.role == UserRole.SUPER_ADMIN

class CoachDetails(db.Model):
    __tablename__ = 'coach_details'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, unique=True)
    tennis_club_id = db.Column(db.Integer, db.ForeignKey('tennis_club.id'), nullable=False)

    # Basic Information
    coach_number = db.Column(db.String(50), unique=True)
    qualification = db.Column(PGEnum(CoachQualification, name='coachqualification'), default=CoachQualification.NONE)
    date_of_birth = db.Column(db.Date)
    contact_number = db.Column(db.String(20))

    # Emergency Contact
    emergency_contact_name = db.Column(db.String(100))
    emergency_contact_number = db.Column(db.String(20))

    # Address
    address_line1 = db.Column(db.String(100))
    address_line2 = db.Column(db.String(100))
    city = db.Column(db.String(50))
    postcode = db.Column(db.String(10))

    # Role and UTR
    coach_role = db.Column(PGEnum(CoachRole, name='coachrole'))
    utr_number = db.Column(db.String(20))

    # Accreditations
    accreditation_expiry = db.Column(db.DateTime(timezone=True))
    bcta_accreditation = db.Column(db.String(10), default='N/A')

    # DBS Information
    dbs_number = db.Column(db.String(50))
    dbs_issue_date = db.Column(db.DateTime(timezone=True))
    dbs_expiry = db.Column(db.DateTime(timezone=True))
    dbs_update_service_id = db.Column(db.String(50))

    # First Aid
    pediatric_first_aid = db.Column(db.Boolean, default=False)
    pediatric_first_aid_expiry = db.Column(db.DateTime(timezone=True))
    first_aid_expiry = db.Column(db.DateTime(timezone=True))

    # Safeguarding
    safeguarding_expiry = db.Column(db.DateTime(timezone=True))

    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    updated_at = db.Column(db.DateTime(timezone=True), onupdate=text('CURRENT_TIMESTAMP'))

    # Relationships
    user = db.relationship('User', backref=db.backref('coach_details', uselist=False))
    tennis_club = db.relationship('TennisClub', backref='coach_details')

    def get_expiry_status(self, expiry_date):
        if not expiry_date:
            return None

        current_time = datetime.now(uk_timezone)
        if expiry_date.tzinfo != uk_timezone:
            expiry_date = expiry_date.astimezone(uk_timezone)

        days_until_expiry = (expiry_date - current_time).days

        if days_until_expiry < 0:
            return ('expired', days_until_expiry)
        elif days_until_expiry <= 90:
            return ('warning', days_until_expiry)
        else:
            return ('valid', days_until_expiry)

class TeachingPeriod(db.Model):
    __tablename__ = 'teaching_period'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    start_date = db.Column(db.DateTime(timezone=True), nullable=False)
    end_date = db.Column(db.DateTime(timezone=True), nullable=False)
    next_period_start_date = db.Column(db.DateTime(timezone=True), nullable=True)  
    bookings_open_date = db.Column(db.DateTime(timezone=True), nullable=True)    
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    tennis_club_id = db.Column(db.Integer, db.ForeignKey('tennis_club.id'), nullable=False)

    # Relationships
    tennis_club = db.relationship('TennisClub', back_populates='teaching_periods')
    reports = db.relationship('Report', back_populates='teaching_period', lazy='dynamic')
    programme_players = db.relationship('ProgrammePlayers', back_populates='teaching_period', lazy='dynamic')

class Student(db.Model):
    __tablename__ = 'student'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    date_of_birth = db.Column(db.Date)
    contact_email = db.Column(db.String(120))
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    tennis_club_id = db.Column(db.Integer, db.ForeignKey('tennis_club.id'), nullable=False)

    # Relationships
    tennis_club = db.relationship('TennisClub', back_populates='students')
    reports = db.relationship('Report', back_populates='student', lazy='dynamic')
    programme_players = db.relationship('ProgrammePlayers', back_populates='student', lazy='dynamic')

class CoachInvitation(db.Model):
    __tablename__ = 'coach_invitation'
    
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), nullable=False)
    token = db.Column(db.String(100), unique=True, nullable=False)
    tennis_club_id = db.Column(db.Integer, db.ForeignKey('tennis_club.id'), nullable=False)
    invited_by_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    used = db.Column(db.Boolean, default=False)

    # Relationships
    tennis_club = db.relationship('TennisClub', backref='coach_invitations')
    invited_by = db.relationship('User', backref='sent_invitations')

    @staticmethod
    def create_invitation(email, tennis_club_id, invited_by_id, expiry_hours=48):
        token = secrets.token_urlsafe(32)
        # Create timezone-aware datetime objects
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=expiry_hours)
        
        invitation = CoachInvitation(
            email=email,
            token=token,
            tennis_club_id=tennis_club_id,
            invited_by_id=invited_by_id,
            expires_at=expires_at
        )
        
        return invitation

    @property
    def is_expired(self):
        # Ensure both datetimes are timezone-aware for comparison
        now = datetime.now(timezone.utc)
        expires_at = self.expires_at.replace(tzinfo=timezone.utc) if self.expires_at.tzinfo is None else self.expires_at
        return now > expires_at

class ClubInvitation(db.Model):
    """Model for tracking invitations to create new tennis clubs"""
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), nullable=False)
    token = db.Column(db.String(64), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))
    expires_at = db.Column(db.DateTime, nullable=False)
    used = db.Column(db.Boolean, default=False)
    invited_by_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    
    # Relationships
    invited_by = db.relationship('User', backref=db.backref('club_invitations_sent', lazy='dynamic'))
    
    @property
    def is_expired(self):
        """Check if the invitation has expired"""
        return datetime.now(timezone.utc) > self.expires_at
    
    @classmethod
    def create_invitation(cls, email, invited_by_id, expiry_hours=48):
        """Create a new club invitation"""
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=expiry_hours)
        
        return cls(
            email=email,
            token=token,
            expires_at=expires_at,
            invited_by_id=invited_by_id
        )
from sqlalchemy import text, Index, Boolean
from app.extensions import db
from datetime import datetime, timezone

class Document(db.Model):
    """Model for storing document metadata and S3 references"""
    __tablename__ = 'document'
    
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)  # Original filename
    file_key = db.Column(db.String(500), nullable=False)  # S3 key/path
    file_size = db.Column(db.BigInteger, nullable=False)  # Size in bytes
    mime_type = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(50), nullable=False, default='General')  # Training, Safety, Forms, etc.
    description = db.Column(db.Text)
    
    # Associations
    uploaded_by_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    uploaded_for_coach_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    tennis_club_id = db.Column(db.Integer, db.ForeignKey('tennis_club.id'), nullable=False)
    
    # Metadata
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    updated_at = db.Column(db.DateTime(timezone=True), onupdate=text('CURRENT_TIMESTAMP'))
    
    # Relationships
    uploaded_by = db.relationship('User', foreign_keys=[uploaded_by_id], backref='uploaded_documents')
    uploaded_for_coach = db.relationship('User', foreign_keys=[uploaded_for_coach_id], backref='documents')
    tennis_club = db.relationship('TennisClub', backref='documents')
    download_logs = db.relationship('DocumentDownloadLog', back_populates='document', cascade='all, delete-orphan')
    permissions = db.relationship('DocumentPermission', back_populates='document', cascade='all, delete-orphan')
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_document_coach', uploaded_for_coach_id),
        Index('idx_document_club', tennis_club_id),
        Index('idx_document_category', category),
        Index('idx_document_active', is_active),
    )
    
    @property
    def file_extension(self):
        """Get file extension from filename"""
        return self.filename.split('.')[-1].upper() if '.' in self.filename else 'FILE'
    
    @property
    def formatted_size(self):
        """Return human-readable file size"""
        if self.file_size < 1024:
            return f"{self.file_size} B"
        elif self.file_size < 1024 * 1024:
            return f"{self.file_size / 1024:.1f} KB"
        elif self.file_size < 1024 * 1024 * 1024:
            return f"{self.file_size / (1024 * 1024):.1f} MB"
        else:
            return f"{self.file_size / (1024 * 1024 * 1024):.1f} GB"
    
    def to_dict(self):
        """Convert to dictionary for JSON responses"""
        return {
            'id': self.id,
            'name': self.filename,
            'type': self.file_extension,
            'size': self.formatted_size,
            'category': self.category,
            'description': self.description,
            'uploadedAt': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None,
            'uploadedBy': self.uploaded_by.name if self.uploaded_by else None,
            'coachId': self.uploaded_for_coach_id
        }
    
    def __repr__(self):
        return f'<Document {self.filename} for coach {self.uploaded_for_coach_id}>'


class DocumentPermission(db.Model):
    """Model for document access permissions"""
    __tablename__ = 'document_permission'
    
    id = db.Column(db.Integer, primary_key=True)
    document_id = db.Column(db.Integer, db.ForeignKey('document.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    permission_type = db.Column(db.String(20), default='read')  # read, write, delete
    granted_by_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    
    # Relationships
    document = db.relationship('Document', back_populates='permissions')
    user = db.relationship('User', foreign_keys=[user_id], backref='document_permissions')
    granted_by = db.relationship('User', foreign_keys=[granted_by_id])
    
    # Ensure unique permissions per user per document
    __table_args__ = (
        db.UniqueConstraint('document_id', 'user_id', name='unique_document_user_permission'),
        Index('idx_document_permission_user', user_id),
    )


class DocumentDownloadLog(db.Model):
    """Model for tracking document downloads"""
    __tablename__ = 'document_download_log'
    
    id = db.Column(db.Integer, primary_key=True)
    document_id = db.Column(db.Integer, db.ForeignKey('document.id'), nullable=False)
    downloaded_by_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    downloaded_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    ip_address = db.Column(db.String(45))  # Support IPv6
    user_agent = db.Column(db.String(500))
    
    # Relationships
    document = db.relationship('Document', back_populates='download_logs')
    downloaded_by = db.relationship('User', backref='document_downloads')
    
    # Indexes for analytics
    __table_args__ = (
        Index('idx_download_log_document', document_id),
        Index('idx_download_log_user', downloaded_by_id),
        Index('idx_download_log_date', downloaded_at),
    )
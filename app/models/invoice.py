# models/invoice.py
from sqlalchemy import text, Index, Boolean, Float, Enum as SQLAEnum
from app.extensions import db
from datetime import datetime, timezone
from enum import Enum

class InvoiceStatus(Enum):
    DRAFT = 'draft'
    SUBMITTED = 'submitted'
    APPROVED = 'approved'
    REJECTED = 'rejected'
    PAID = 'paid'

class CoachingRate(db.Model):
    """Model for storing coaching rates per club"""
    __tablename__ = 'coaching_rate'
    
    id = db.Column(db.Integer, primary_key=True)
    coach_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    tennis_club_id = db.Column(db.Integer, db.ForeignKey('tennis_club.id'), nullable=False)
    rate_name = db.Column(db.String(50), nullable=False)  # e.g., 'Group Coaching', 'Private Lesson'
    hourly_rate = db.Column(db.Float, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    updated_at = db.Column(db.DateTime(timezone=True), onupdate=text('CURRENT_TIMESTAMP'))
    
    # Relationships
    coach = db.relationship('User', backref='coaching_rates')
    tennis_club = db.relationship('TennisClub', backref='coaching_rates')
    
    __table_args__ = (
        # Ensure unique rate names per coach per club
        db.UniqueConstraint('coach_id', 'tennis_club_id', 'rate_name', name='unique_coach_rate_name'),
    )

class Invoice(db.Model):
    """Model for storing coach invoices"""
    __tablename__ = 'invoice'
    
    id = db.Column(db.Integer, primary_key=True)
    coach_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    tennis_club_id = db.Column(db.Integer, db.ForeignKey('tennis_club.id'), nullable=False)
    month = db.Column(db.Integer, nullable=False)  # 1-12
    year = db.Column(db.Integer, nullable=False)
    status = db.Column(SQLAEnum(InvoiceStatus), default=InvoiceStatus.DRAFT)
    subtotal = db.Column(db.Float, default=0.0)
    deductions = db.Column(db.Float, default=0.0)
    total = db.Column(db.Float, default=0.0)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    updated_at = db.Column(db.DateTime(timezone=True), onupdate=text('CURRENT_TIMESTAMP'))
    submitted_at = db.Column(db.DateTime(timezone=True))
    approved_at = db.Column(db.DateTime(timezone=True))
    approved_by_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    invoice_number = db.Column(db.String(50))  # For reference in accounting software
    
    # Relationships
    coach = db.relationship('User', foreign_keys=[coach_id], backref='invoices')
    tennis_club = db.relationship('TennisClub', backref='invoices')
    approved_by = db.relationship('User', foreign_keys=[approved_by_id])
    line_items = db.relationship('InvoiceLineItem', back_populates='invoice', cascade='all, delete-orphan')
    
    __table_args__ = (
        # Ensure one invoice per coach per month per club
        db.UniqueConstraint('coach_id', 'tennis_club_id', 'month', 'year', name='unique_coach_invoice'),
        Index('idx_invoice_status', status),
        Index('idx_invoice_coach', coach_id),
        Index('idx_invoice_date', year, month),
    )
    
    def calculate_totals(self):
        """Recalculate subtotal, deductions, and total based on line items"""
        self.subtotal = sum(item.amount for item in self.line_items if not item.is_deduction)
        self.deductions = sum(item.amount for item in self.line_items if item.is_deduction)
        self.total = self.subtotal - self.deductions
        return self.total

class InvoiceLineItem(db.Model):
    """Model for storing individual invoice line items"""
    __tablename__ = 'invoice_line_item'
    
    id = db.Column(db.Integer, primary_key=True)
    invoice_id = db.Column(db.Integer, db.ForeignKey('invoice.id'), nullable=False)
    register_id = db.Column(db.Integer, db.ForeignKey('register.id'), nullable=True)  # Nullable for manual entries
    item_type = db.Column(db.String(50), nullable=False)  # 'session', 'cardio', 'team', 'deduction', etc.
    is_deduction = db.Column(db.Boolean, default=False)  # Flag for deduction items
    description = db.Column(db.String(255), nullable=False)
    date = db.Column(db.Date, nullable=False)
    hours = db.Column(db.Float, nullable=False)
    rate = db.Column(db.Float, nullable=False)
    amount = db.Column(db.Float, nullable=False)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    
    # Relationships
    invoice = db.relationship('Invoice', back_populates='line_items')
    register = db.relationship('Register', backref='invoice_line_items')
    
    __table_args__ = (
        Index('idx_line_item_invoice', invoice_id),
        Index('idx_line_item_register', register_id),
        Index('idx_line_item_date', date),
    )
from sqlalchemy import text, Index, Boolean
from app.extensions import db

class ClubFeature(db.Model):
    """Model to track which features are enabled for each tennis club"""
    __tablename__ = 'club_feature'

    id = db.Column(db.Integer, primary_key=True)
    tennis_club_id = db.Column(db.Integer, db.ForeignKey('tennis_club.id'), nullable=False)
    feature_name = db.Column(db.String(50), nullable=False)  # E.g., 'coaching_reports', 'registers', etc.
    is_enabled = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime(timezone=True), server_default=text('CURRENT_TIMESTAMP'))
    updated_at = db.Column(db.DateTime(timezone=True), onupdate=text('CURRENT_TIMESTAMP'))

    # Relationship
    tennis_club = db.relationship('TennisClub', backref=db.backref('features', lazy='dynamic'))

    __table_args__ = (
        # Ensure that a feature is only defined once per club
        db.UniqueConstraint('tennis_club_id', 'feature_name', name='unique_feature_per_club'),
    )
    
    def __repr__(self):
        return f'<ClubFeature tennis_club_id={self.tennis_club_id} feature={self.feature_name} enabled={self.is_enabled}>'
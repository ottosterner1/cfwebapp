import secrets
from datetime import datetime, timezone, timedelta
from flask import current_app
from typing import Dict, Any, Optional

class SurveyTokenManager:
    """Manage survey access tokens using simple database lookups"""
    
    @staticmethod
    def generate_survey_token(recipient_id: int = None, campaign_id: int = None, expires_days: int = 30) -> str:
        """Generate simple URL-safe token"""
        return secrets.token_urlsafe(32)
    
    @staticmethod
    def generate_opt_out_token(email: str = None, tennis_club_id: int = None) -> str:
        """Generate simple opt-out token"""
        return secrets.token_urlsafe(32)
    
    @staticmethod
    def validate_survey_token(token: str) -> Optional[Dict[str, Any]]:
        """Validate survey token by checking database"""
        try:
            from app.models.survey import SurveyRecipient
            
            # Find recipient with this token
            recipient = SurveyRecipient.query.filter_by(survey_token=token).first()
            
            if not recipient:
                current_app.logger.warning(f"No recipient found for token: {token}")
                return None
            
            # Check if expired
            if recipient.is_expired():
                current_app.logger.warning(f"Token expired for recipient: {recipient.email}")
                return {'expired': True}
            
            current_app.logger.info(f"Valid token for recipient: {recipient.email}")
            return {
                'recipient_id': recipient.id,
                'campaign_id': recipient.campaign_id,
                'expired': False
            }
            
        except Exception as e:
            current_app.logger.error(f"Token validation error: {str(e)}")
            return None
    
    @staticmethod
    def validate_opt_out_token(token: str) -> Optional[Dict[str, Any]]:
        """Validate opt-out token by checking database"""
        try:
            from app.models.survey import SurveyRecipient
            
            recipient = SurveyRecipient.query.filter_by(opt_out_token=token).first()
            
            if not recipient:
                return None
            
            return {
                'email': recipient.email,
                'tennis_club_id': recipient.tennis_club_id
            }
            
        except Exception as e:
            current_app.logger.error(f"Opt-out token validation error: {str(e)}")
            return None
    
    @staticmethod
    def generate_simple_token(length: int = 32) -> str:
        """Generate simple URL-safe token"""
        return secrets.token_urlsafe(length)
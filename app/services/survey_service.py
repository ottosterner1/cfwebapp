from typing import Dict, List, Any, Tuple
from datetime import datetime, timezone, timedelta
from app.models import (
    SurveyCampaign, SurveyRecipient, SurveyTemplate, SurveyQuestion,
    SurveyOptOut, Student, ProgrammePlayers, SurveyQuestionType,
    SurveyResponse, SurveyStatus
)
from app import db
from app.services.email_service import EmailService
from app.utils.survey_tokens import SurveyTokenManager
import secrets
from flask import current_app, url_for
import traceback

class SurveyService:
    """Core business logic for survey operations"""
    
    def __init__(self):
        self.email_service = EmailService()
        self.token_manager = SurveyTokenManager()
    
    def generate_campaign_recipients(self, campaign_id: int) -> Dict[str, Any]:
        """Generate recipient list for a survey campaign"""
        try:
            campaign = SurveyCampaign.query.get(campaign_id)
            if not campaign:
                raise ValueError(f"Campaign {campaign_id} not found")
            
            # Get eligible contacts based on campaign targeting
            eligible_contacts = self._get_eligible_contacts(campaign)
            
            # Filter out opted-out emails
            opted_out_emails = self._get_opted_out_emails(campaign.tennis_club_id)
            eligible_contacts = [
                contact for contact in eligible_contacts 
                if contact['email'].lower() not in opted_out_emails
            ]
            
            # Apply frequency limits
            eligible_contacts = self._apply_frequency_limits(
                eligible_contacts, campaign.tennis_club_id, campaign.template.max_frequency_days
            )
            
            # Generate recipients
            recipients_created = 0
            for contact in eligible_contacts:
                tokens = SurveyRecipient.generate_tokens()
                
                recipient = SurveyRecipient(
                    campaign_id=campaign_id,
                    tennis_club_id=campaign.tennis_club_id,
                    email=contact['email'],
                    student_id=contact.get('student_id'),
                    recipient_name=contact.get('recipient_name'),
                    student_name=contact.get('student_name'),
                    survey_token=tokens['survey_token'],
                    opt_out_token=tokens['opt_out_token'],
                    expires_at=datetime.now(timezone.utc) + timedelta(days=30)  # 30 days to respond
                )
                
                db.session.add(recipient)
                recipients_created += 1
            
            db.session.commit()
            
            return {
                'success': True,
                'total_recipients': recipients_created,
                'eligible_found': len(eligible_contacts),
                'opted_out_excluded': len([c for c in self._get_eligible_contacts(campaign) 
                                         if c['email'].lower() in opted_out_emails])
            }
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error generating campaign recipients: {str(e)}")
            current_app.logger.error(traceback.format_exc())
            return {
                'success': False,
                'error': str(e),
                'total_recipients': 0
            }
    
    def preview_campaign_recipients(self, campaign_id: int) -> Dict[str, Any]:
        """Preview who would receive a survey campaign without creating recipients"""
        try:
            campaign = SurveyCampaign.query.get(campaign_id)
            if not campaign:
                raise ValueError(f"Campaign {campaign_id} not found")
            
            # Get all eligible contacts
            all_eligible = self._get_eligible_contacts(campaign)
            
            # Get opted out emails
            opted_out_emails = self._get_opted_out_emails(campaign.tennis_club_id)
            after_opt_outs = [
                contact for contact in all_eligible 
                if contact['email'].lower() not in opted_out_emails
            ]
            
            # Apply frequency limits
            after_frequency = self._apply_frequency_limits(
                after_opt_outs, campaign.tennis_club_id, campaign.template.max_frequency_days
            )
            
            return {
                'total_eligible': len(all_eligible),
                'after_opt_outs': len(after_opt_outs),
                'after_frequency_limits': len(after_frequency),
                'final_recipients': len(after_frequency),
                'sample_recipients': after_frequency[:10],  # First 10 for preview
                'opt_out_count': len(all_eligible) - len(after_opt_outs),
                'frequency_blocked_count': len(after_opt_outs) - len(after_frequency)
            }
            
        except Exception as e:
            current_app.logger.error(f"Error previewing campaign recipients: {str(e)}")
            return {
                'total_eligible': 0,
                'error': str(e)
            }
    
    def send_campaign_immediately(self, campaign_id: int) -> Dict[str, Any]:
        """Send survey campaign immediately"""
        try:
            campaign = SurveyCampaign.query.get(campaign_id)
            if not campaign:
                raise ValueError(f"Campaign {campaign_id} not found")
            
            # Get all recipients for this campaign
            recipients = SurveyRecipient.query.filter_by(
                campaign_id=campaign_id
            ).filter(SurveyRecipient.email_sent_at.is_(None)).all()
            
            if not recipients:
                return {
                    'success': False,
                    'error': 'No recipients found for campaign',
                    'emails_sent': 0
                }
            
            emails_sent = 0
            emails_failed = 0
            
            # Send emails in batches
            BATCH_SIZE = 10
            for i in range(0, len(recipients), BATCH_SIZE):
                batch = recipients[i:i + BATCH_SIZE]
                
                for recipient in batch:
                    try:
                        # Generate survey URL
                        survey_url = url_for('survey_public.survey_response_page', 
                                           token=recipient.survey_token, _external=True)
                        
                        # Generate opt-out URL
                        opt_out_url = url_for('survey_public.opt_out_page', 
                                            token=recipient.opt_out_token, _external=True)
                        
                        # Send email
                        success, message_id = self.email_service.send_survey_invitation(
                            recipient_email=recipient.email,
                            survey_url=survey_url,
                            opt_out_url=opt_out_url,
                            club_name=campaign.tennis_club.name,
                            recipient_name=recipient.recipient_name,
                            student_name=recipient.student_name,
                            template_name=campaign.template.name
                        )
                        
                        if success:
                            recipient.email_sent_at = datetime.now(timezone.utc)
                            # Note: email_delivered_at would be updated by webhook if available
                            emails_sent += 1
                        else:
                            current_app.logger.error(f"Failed to send email to {recipient.email}: {message_id}")
                            emails_failed += 1
                            
                    except Exception as e:
                        current_app.logger.error(f"Error sending email to {recipient.email}: {str(e)}")
                        emails_failed += 1
                
                # Commit batch
                db.session.commit()
            
            # Update campaign statistics
            campaign.emails_sent = emails_sent
            campaign.actual_send_date = datetime.now(timezone.utc)
            campaign.status = SurveyStatus.COMPLETED if emails_sent > 0 else SurveyStatus.DRAFT
            
            db.session.commit()
            
            return {
                'success': True,
                'emails_sent': emails_sent,
                'emails_failed': emails_failed
            }
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error sending campaign: {str(e)}")
            current_app.logger.error(traceback.format_exc())
            return {
                'success': False,
                'error': str(e),
                'emails_sent': 0,
                'emails_failed': 0
            }
    
    def validate_survey_responses(self, template_id: int, responses: Dict[str, Any]) -> Dict[str, Any]:
        """Validate survey responses against template"""
        try:
            template = SurveyTemplate.query.get(template_id)
            if not template:
                return {
                    'valid': False,
                    'errors': ['Template not found']
                }
            
            errors = []
            
            for question in template.questions:
                question_id = str(question.id)
                response_value = responses.get(question_id)
                
                # Check required questions
                if question.is_required and (response_value is None or response_value == ''):
                    errors.append(f"Question '{question.question_text}' is required")
                    continue
                
                # Skip validation if not answered and not required
                if response_value is None or response_value == '':
                    continue
                
                # Validate based on question type
                if question.question_type == SurveyQuestionType.RATING:
                    options = question.options or question.default_options
                    min_val = options.get('min', 1)
                    max_val = options.get('max', 5)
                    
                    try:
                        rating = int(response_value)
                        if rating < min_val or rating > max_val:
                            errors.append(f"Rating must be between {min_val} and {max_val}")
                    except (ValueError, TypeError):
                        errors.append(f"Rating must be a number")
                
                elif question.question_type == SurveyQuestionType.NPS:
                    try:
                        nps = int(response_value)
                        if nps < 0 or nps > 10:
                            errors.append(f"NPS score must be between 0 and 10")
                    except (ValueError, TypeError):
                        errors.append(f"NPS score must be a number")
                
                elif question.question_type == SurveyQuestionType.MULTIPLE_CHOICE:
                    options = question.options or {}
                    valid_options = options.get('options', [])
                    if valid_options and response_value not in valid_options:
                        errors.append(f"Invalid option selected for question '{question.question_text}'")
                
                elif question.question_type == SurveyQuestionType.YES_NO:
                    if response_value not in ['Yes', 'No', 'yes', 'no', True, False]:
                        errors.append(f"Yes/No question must have a Yes or No answer")
                
                elif question.question_type in [SurveyQuestionType.TEXT, SurveyQuestionType.TEXTAREA]:
                    if isinstance(response_value, str) and len(response_value.strip()) > 1000:
                        errors.append(f"Response too long for question '{question.question_text}'")
            
            return {
                'valid': len(errors) == 0,
                'errors': errors
            }
            
        except Exception as e:
            current_app.logger.error(f"Error validating survey responses: {str(e)}")
            return {
                'valid': False,
                'errors': [f'Validation error: {str(e)}']
            }
    
    def _get_eligible_contacts(self, campaign: SurveyCampaign) -> List[Dict[str, Any]]:
        """Get eligible contact list based on campaign targeting"""
        query = db.session.query(
            Student.id.label('student_id'),
            Student.name.label('student_name'),
            Student.contact_email.label('email'),
            ProgrammePlayers.id.label('programme_player_id')
        ).join(
            ProgrammePlayers, Student.id == ProgrammePlayers.student_id
        ).filter(
            Student.tennis_club_id == campaign.tennis_club_id,
            Student.contact_email.isnot(None),
            Student.contact_email != ''
        )
        
        # Apply campaign targeting filters
        if campaign.teaching_period_id:
            query = query.filter(ProgrammePlayers.teaching_period_id == campaign.teaching_period_id)
        
        if campaign.group_id:
            query = query.filter(ProgrammePlayers.group_id == campaign.group_id)
        
        if campaign.coach_id:
            query = query.filter(ProgrammePlayers.coach_id == campaign.coach_id)
        
        # Get results and format
        results = query.distinct().all()
        
        contacts = []
        for result in results:
            # Extract first name for personalization
            name_parts = result.student_name.split()
            recipient_name = name_parts[0] if name_parts else 'Parent/Guardian'
            
            contacts.append({
                'email': result.email,
                'student_id': result.student_id,
                'student_name': result.student_name,
                'recipient_name': recipient_name,
                'programme_player_id': result.programme_player_id
            })
        
        return contacts
    
    def _get_opted_out_emails(self, tennis_club_id: int) -> set:
        """Get set of opted-out email addresses for a club"""
        opted_out = SurveyOptOut.query.filter_by(
            tennis_club_id=tennis_club_id
        ).filter(SurveyOptOut.opted_back_in_at.is_(None)).all()
        
        return {opt_out.email.lower() for opt_out in opted_out}
    
    def _apply_frequency_limits(self, contacts: List[Dict[str, Any]], 
                              tennis_club_id: int, max_frequency_days: int) -> List[Dict[str, Any]]:
        """Apply frequency limits to contact list"""
        if max_frequency_days <= 0:
            return contacts
        
        # Get recent survey sends for frequency checking
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=max_frequency_days)
        
        recent_sends = db.session.query(SurveyRecipient.email).filter(
            SurveyRecipient.tennis_club_id == tennis_club_id,
            SurveyRecipient.email_sent_at >= cutoff_date
        ).distinct().all()
        
        recent_emails = {email[0].lower() for email in recent_sends}
        
        # Filter out contacts who received surveys recently
        filtered_contacts = [
            contact for contact in contacts
            if contact['email'].lower() not in recent_emails
        ]
        
        return filtered_contacts
    
    def calculate_campaign_analytics(self, campaign_id: int) -> Dict[str, Any]:
        """Calculate analytics for a survey campaign"""
        try:
            campaign = SurveyCampaign.query.get(campaign_id)
            if not campaign:
                return {'error': 'Campaign not found'}
            
            # Get response statistics
            responses = SurveyResponse.query.filter_by(
                campaign_id=campaign_id,
                is_complete=True
            ).all()
            
            analytics = {
                'campaign_id': campaign_id,
                'campaign_name': campaign.name,
                'total_recipients': campaign.total_recipients,
                'emails_sent': campaign.emails_sent,
                'emails_delivered': campaign.emails_delivered,
                'responses_received': len(responses),
                'response_rate': campaign.response_rate,
                'completion_stats': self._calculate_completion_stats(responses),
                'question_analytics': self._calculate_question_analytics(campaign.template_id, responses),
                'time_to_complete': self._calculate_completion_times(responses)
            }
            
            return analytics
            
        except Exception as e:
            current_app.logger.error(f"Error calculating campaign analytics: {str(e)}")
            return {'error': str(e)}
    
    def _calculate_completion_stats(self, responses: List[SurveyResponse]) -> Dict[str, Any]:
        """Calculate completion statistics"""
        if not responses:
            return {
                'avg_completion_time': 0,
                'fastest_completion': 0,
                'slowest_completion': 0
            }
        
        completion_times = [
            r.completion_time_seconds for r in responses 
            if r.completion_time_seconds is not None
        ]
        
        if not completion_times:
            return {
                'avg_completion_time': 0,
                'fastest_completion': 0,
                'slowest_completion': 0
            }
        
        return {
            'avg_completion_time': sum(completion_times) / len(completion_times),
            'fastest_completion': min(completion_times),
            'slowest_completion': max(completion_times)
        }
    
    def _calculate_question_analytics(self, template_id: int, responses: List[SurveyResponse]) -> List[Dict[str, Any]]:
        """Calculate per-question analytics"""
        template = SurveyTemplate.query.get(template_id)
        if not template:
            return []
        
        question_analytics = []
        
        for question in template.questions:
            question_id = str(question.id)
            question_responses = []
            
            for response in responses:
                if question_id in response.responses:
                    answer = response.responses[question_id]
                    if answer is not None and answer != '':
                        question_responses.append(answer)
            
            analytics = {
                'question_id': question.id,
                'question_text': question.question_text,
                'question_type': question.question_type.value,
                'total_responses': len(question_responses),
                'response_rate': len(question_responses) / len(responses) if responses else 0
            }
            
            # Type-specific analytics
            if question.question_type == SurveyQuestionType.RATING:
                if question_responses:
                    numeric_responses = [int(r) for r in question_responses if str(r).isdigit()]
                    if numeric_responses:
                        analytics.update({
                            'average_rating': sum(numeric_responses) / len(numeric_responses),
                            'rating_distribution': self._get_rating_distribution(numeric_responses)
                        })
            
            elif question.question_type == SurveyQuestionType.NPS:
                if question_responses:
                    nps_scores = [int(r) for r in question_responses if str(r).isdigit()]
                    if nps_scores:
                        analytics.update({
                            'nps_score': self._calculate_nps_score(nps_scores),
                            'score_distribution': self._get_nps_distribution(nps_scores)
                        })
            
            elif question.question_type == SurveyQuestionType.MULTIPLE_CHOICE:
                analytics.update({
                    'option_distribution': self._get_option_distribution(question_responses)
                })
            
            question_analytics.append(analytics)
        
        return question_analytics
    
    def _calculate_completion_times(self, responses: List[SurveyResponse]) -> Dict[str, Any]:
        """Calculate completion time statistics"""
        completion_times = [
            r.completion_time_seconds for r in responses 
            if r.completion_time_seconds is not None and r.completion_time_seconds > 0
        ]
        
        if not completion_times:
            return {
                'avg_seconds': 0,
                'median_seconds': 0,
                'min_seconds': 0,
                'max_seconds': 0
            }
        
        completion_times.sort()
        n = len(completion_times)
        
        return {
            'avg_seconds': sum(completion_times) / n,
            'median_seconds': completion_times[n // 2],
            'min_seconds': min(completion_times),
            'max_seconds': max(completion_times)
        }
    
    def _get_rating_distribution(self, ratings: List[int]) -> Dict[str, int]:
        """Get distribution of rating responses"""
        distribution = {}
        for rating in ratings:
            distribution[str(rating)] = distribution.get(str(rating), 0) + 1
        return distribution
    
    def _calculate_nps_score(self, scores: List[int]) -> float:
        """Calculate Net Promoter Score"""
        if not scores:
            return 0
        
        promoters = len([s for s in scores if s >= 9])
        detractors = len([s for s in scores if s <= 6])
        total = len(scores)
        
        return ((promoters - detractors) / total) * 100
    
    def _get_nps_distribution(self, scores: List[int]) -> Dict[str, int]:
        """Get NPS score distribution"""
        promoters = len([s for s in scores if s >= 9])
        passives = len([s for s in scores if 7 <= s <= 8])
        detractors = len([s for s in scores if s <= 6])
        
        return {
            'promoters': promoters,
            'passives': passives,
            'detractors': detractors
        }
    
    def _get_option_distribution(self, responses: List[str]) -> Dict[str, int]:
        """Get distribution of multiple choice responses"""
        distribution = {}
        for response in responses:
            response_str = str(response)
            distribution[response_str] = distribution.get(response_str, 0) + 1
        return distribution
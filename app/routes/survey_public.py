from flask import Blueprint, request, jsonify, render_template, redirect, url_for, current_app
from app.models import SurveyRecipient, SurveyTemplate, SurveyResponse, SurveyOptOut, SurveyCampaign
from app import db
from app.utils.survey_tokens import SurveyTokenManager
from app.services.survey_service import SurveyService
from datetime import datetime, timezone, timedelta
import traceback

# Public routes - no authentication required
survey_public_routes = Blueprint('survey_public', __name__, url_prefix='/survey')

@survey_public_routes.route('/respond/<token>')
def survey_response_page(token):
    """Public survey response page"""
    try:
        # Validate and decode token
        token_manager = SurveyTokenManager()
        token_data = token_manager.validate_survey_token(token)
        
        if not token_data or token_data.get('expired'):
            return render_template('survey/expired.html'), 410
        
        # Get recipient and template
        recipient = SurveyRecipient.query.filter_by(
            survey_token=token
        ).first()
        
        if not recipient or recipient.is_expired():
            return render_template('survey/expired.html'), 410
        
        # Check if survey is closed
        campaign = recipient.campaign
        if campaign.close_date and datetime.now(timezone.utc) > campaign.close_date:
            return render_template('survey/closed.html'), 410
        
        # Check if already completed
        existing_response = SurveyResponse.query.filter_by(
            recipient_id=recipient.id,
            is_complete=True
        ).first()
        
        if existing_response:
            return render_template('survey/already_completed.html'), 200
        
        # Track survey opened
        if not recipient.survey_opened_at:
            recipient.survey_opened_at = datetime.now(timezone.utc)
            db.session.commit()
        
        template = campaign.template
        club = campaign.tennis_club
        
        # Prepare template data for frontend
        template_data = {
            'id': template.id,
            'name': template.name,
            'description': template.description,
            'questions': []
        }
        
        for question in template.questions:
            question_data = {
                'id': question.id,
                'question_text': question.question_text,
                'question_type': question.question_type.value,
                'is_required': question.is_required,
                'order_index': question.order_index,
                'options': question.options or question.default_options,
                'help_text': question.help_text
            }
            template_data['questions'].append(question_data)
        
        context_data = {
            'recipient_name': recipient.recipient_name,
            'student_name': recipient.student_name,
            'club_name': club.name
        }
        
        return render_template('survey/respond.html', 
                             template=template_data,
                             context=context_data,
                             token=token)
        
    except Exception as e:
        current_app.logger.error(f"Error loading survey: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return render_template('survey/error.html'), 500

@survey_public_routes.route('/api/submit/<token>', methods=['POST'])
def submit_survey_response(token):
    """Submit survey response via API"""
    try:
        # Validate token
        recipient = SurveyRecipient.query.filter_by(
            survey_token=token
        ).first()
        
        if not recipient or recipient.is_expired():
            return jsonify({'error': 'Survey link has expired'}), 410
        
        # Check if survey is closed
        campaign = recipient.campaign
        if campaign.close_date and datetime.now(timezone.utc) > campaign.close_date:
            return jsonify({'error': 'Survey is no longer accepting responses'}), 410
        
        # Check if already completed
        existing_response = SurveyResponse.query.filter_by(
            recipient_id=recipient.id,
            is_complete=True
        ).first()
        
        if existing_response:
            return jsonify({'error': 'Survey has already been completed'}), 400
        
        data = request.get_json()
        responses = data.get('responses', {})
        
        if not responses:
            return jsonify({'error': 'No responses provided'}), 400
        
        # Validate responses against template
        template = campaign.template
        survey_service = SurveyService()
        validation_result = survey_service.validate_survey_responses(template.id, responses)
        
        if not validation_result['valid']:
            return jsonify({
                'error': 'Invalid responses',
                'details': validation_result['errors']
            }), 400
        
        # Calculate completion time
        completion_time = None
        if recipient.survey_opened_at:
            completion_time = int((datetime.now(timezone.utc) - recipient.survey_opened_at).total_seconds())
        
        # Create response record
        survey_response = SurveyResponse(
            campaign_id=campaign.id,
            template_id=template.id,
            tennis_club_id=campaign.tennis_club_id,
            recipient_id=recipient.id,
            responses=responses,
            is_complete=True,
            completion_time_seconds=completion_time,
            ip_address=request.remote_addr,
            user_agent=request.headers.get('User-Agent', '')[:200],
            started_at=recipient.survey_opened_at,
            retention_expires_at=datetime.now(timezone.utc) + timedelta(days=template.retention_days)
        )
        
        # Extract optional demographic data
        if 'respondent_type' in data:
            survey_response.respondent_type = data['respondent_type']
        if 'student_age_group' in data:
            survey_response.student_age_group = data['student_age_group']
        
        db.session.add(survey_response)
        
        # Update recipient
        recipient.survey_completed_at = datetime.now(timezone.utc)
        
        # Update campaign statistics
        campaign.responses_received = (campaign.responses_received or 0) + 1
        
        db.session.commit()
        
        return jsonify({
            'message': 'Survey submitted successfully',
            'thank_you_url': url_for('survey_public.thank_you_page')
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error submitting survey response: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': 'Failed to submit survey'}), 500

@survey_public_routes.route('/opt-out/<token>')
def opt_out_page(token):
    """Public opt-out page"""
    try:
        # Validate opt-out token
        recipient = SurveyRecipient.query.filter_by(
            opt_out_token=token
        ).first()
        
        if not recipient:
            return render_template('survey/invalid_opt_out.html'), 400
        
        return render_template('survey/opt_out.html', 
                             recipient=recipient,
                             club_name=recipient.tennis_club.name,
                             token=token)
        
    except Exception as e:
        current_app.logger.error(f"Error loading opt-out page: {str(e)}")
        return render_template('survey/error.html'), 500

@survey_public_routes.route('/api/opt-out/<token>', methods=['POST'])
def process_opt_out(token):
    """Process opt-out request"""
    try:
        recipient = SurveyRecipient.query.filter_by(
            opt_out_token=token
        ).first()
        
        if not recipient:
            return jsonify({'error': 'Invalid opt-out token'}), 400
        
        data = request.get_json()
        reason = data.get('reason', '')
        
        # Check if already opted out
        existing_opt_out = SurveyOptOut.query.filter_by(
            tennis_club_id=recipient.tennis_club_id,
            email=recipient.email
        ).first()
        
        if not existing_opt_out:
            opt_out = SurveyOptOut(
                tennis_club_id=recipient.tennis_club_id,
                email=recipient.email,
                source='survey_link',
                campaign_id=recipient.campaign_id,
                reason=reason
            )
            db.session.add(opt_out)
            db.session.commit()
        
        return jsonify({
            'message': 'You have been successfully removed from our survey list',
            'success_url': url_for('survey_public.opt_out_success_page')
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error processing opt-out: {str(e)}")
        return jsonify({'error': 'Failed to process opt-out request'}), 500

@survey_public_routes.route('/thank-you')
def thank_you_page():
    """Thank you page after survey submission"""
    return render_template('survey/thank_you.html')

@survey_public_routes.route('/opt-out-success')
def opt_out_success_page():
    """Success page after opt-out"""
    return render_template('survey/opt_out_success.html')

@survey_public_routes.route('/expired')
def expired_page():
    """Expired survey page"""
    return render_template('survey/expired.html')

@survey_public_routes.route('/closed')
def closed_page():
    """Closed survey page"""
    return render_template('survey/closed.html')

@survey_public_routes.route('/error')
def error_page():
    """Generic error page"""
    return render_template('survey/error.html')

# Health check endpoint for survey system
@survey_public_routes.route('/health')
def health_check():
    """Health check for survey system"""
    try:
        # Basic database connectivity check - use text() for raw SQL
        db.session.execute(text('SELECT 1'))
        return jsonify({
            'status': 'healthy',
            'timestamp': datetime.now(timezone.utc).isoformat()
        })
    except Exception as e:
        current_app.logger.error(f"Survey system health check failed: {str(e)}")
        return jsonify({
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': datetime.now(timezone.utc).isoformat()
        }), 500

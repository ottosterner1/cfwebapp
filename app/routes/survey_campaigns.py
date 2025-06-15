from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from app.models import (
    SurveyCampaign, SurveyTemplate, SurveyRecipient, SurveyOptOut,
    SurveyStatus, SurveyTriggerType, Student, ProgrammePlayers, 
    TeachingPeriod, TennisGroup, User, ClubComplianceStatus, SurveyResponse
)
from app import db
from app.utils.auth import admin_required
from app.clubs.middleware import verify_club_access
from app.services.survey_service import SurveyService
from datetime import datetime, timezone, timedelta
import traceback
from sqlalchemy import func, desc

survey_campaign_routes = Blueprint('survey_campaigns', __name__, url_prefix='/api')

def check_surveys_enabled(club_id):
    """Check if surveys are enabled for the club"""
    compliance = ClubComplianceStatus.query.filter_by(
        tennis_club_id=club_id
    ).first()
    return compliance and compliance.surveys_enabled

@survey_campaign_routes.route('/clubs/<int:club_id>/survey-campaigns', methods=['GET'])
@login_required
@admin_required
@verify_club_access()
def get_survey_campaigns(club_id):
    """Get all survey campaigns for a club"""
    try:
        if not check_surveys_enabled(club_id):
            return jsonify({'error': 'Surveys not enabled for this club'}), 403
        
        # Get query parameters
        status_filter = request.args.get('status')
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        
        # Build query
        query = SurveyCampaign.query.filter_by(tennis_club_id=club_id)
        
        if status_filter:
            try:
                status_enum = SurveyStatus[status_filter.upper()]
                query = query.filter_by(status=status_enum)
            except KeyError:
                return jsonify({'error': f'Invalid status: {status_filter}'}), 400
        
        # Order by creation date (newest first)
        query = query.order_by(SurveyCampaign.created_at.desc())
        
        # Paginate
        campaigns = query.paginate(
            page=page, per_page=per_page, error_out=False
        )
        
        campaign_data = []
        for campaign in campaigns.items:
            campaign_data.append({
                'id': campaign.id,
                'name': campaign.name,
                'template_name': campaign.template.name,
                'status': campaign.status.value,
                'trigger_type': campaign.trigger_type.value,
                'total_recipients': campaign.total_recipients,
                'emails_sent': campaign.emails_sent,
                'emails_delivered': campaign.emails_delivered,
                'responses_received': campaign.responses_received,
                'response_rate': campaign.response_rate,
                'scheduled_send_date': campaign.scheduled_send_date.isoformat() if campaign.scheduled_send_date else None,
                'actual_send_date': campaign.actual_send_date.isoformat() if campaign.actual_send_date else None,
                'created_at': campaign.created_at.isoformat(),
                'created_by': campaign.created_by.name,
                'teaching_period': campaign.teaching_period.name if campaign.teaching_period else None,
                'group': campaign.group.name if campaign.group else None
            })
        
        return jsonify({
            'campaigns': campaign_data,
            'pagination': {
                'page': campaigns.page,
                'pages': campaigns.pages,
                'per_page': campaigns.per_page,
                'total': campaigns.total,
                'has_next': campaigns.has_next,
                'has_prev': campaigns.has_prev
            }
        })
        
    except Exception as e:
        current_app.logger.error(f"Error fetching survey campaigns: {str(e)}")
        return jsonify({'error': str(e)}), 500

@survey_campaign_routes.route('/clubs/<int:club_id>/survey-campaigns', methods=['POST'])
@login_required
@admin_required
@verify_club_access()
def create_survey_campaign(club_id):
    """Create a new survey campaign"""
    try:
        if not check_surveys_enabled(club_id):
            return jsonify({'error': 'Surveys not enabled for this club'}), 403
        
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['name', 'template_id']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Validate template belongs to club
        template = SurveyTemplate.query.filter_by(
            id=data['template_id'],
            tennis_club_id=club_id,
            is_active=True
        ).first()
        
        if not template:
            return jsonify({'error': 'Invalid template ID'}), 400
        
        # Convert empty strings to None for optional foreign keys
        def clean_optional_id(value):
            """Convert empty string or None to None, otherwise convert to int"""
            if value is None or value == '' or value == 'null':
                return None
            try:
                return int(value)
            except (ValueError, TypeError):
                return None
        
        teaching_period_id = clean_optional_id(data.get('teaching_period_id'))
        group_id = clean_optional_id(data.get('group_id'))
        coach_id = clean_optional_id(data.get('coach_id'))
        
        # Validate optional foreign keys only if they're not None
        if teaching_period_id:
            period = TeachingPeriod.query.filter_by(
                id=teaching_period_id,
                tennis_club_id=club_id
            ).first()
            if not period:
                return jsonify({'error': 'Invalid teaching period ID'}), 400
        
        if group_id:
            group = TennisGroup.query.filter_by(
                id=group_id,
                tennis_club_id=club_id
            ).first()
            if not group:
                return jsonify({'error': 'Invalid group ID'}), 400
        
        if coach_id:
            coach = User.query.filter_by(
                id=coach_id,
                tennis_club_id=club_id
            ).first()
            if not coach:
                return jsonify({'error': 'Invalid coach ID'}), 400
        
        # Create campaign
        campaign = SurveyCampaign(
            tennis_club_id=club_id,
            template_id=data['template_id'],
            name=data['name'],
            trigger_type=SurveyTriggerType[data.get('trigger_type', 'MANUAL').upper()],
            teaching_period_id=teaching_period_id,
            group_id=group_id,
            coach_id=coach_id,
            created_by_id=current_user.id
        )
        
        # Set send date
        if 'scheduled_send_date' in data:
            try:
                campaign.scheduled_send_date = datetime.fromisoformat(
                    data['scheduled_send_date'].replace('Z', '+00:00')
                )
            except ValueError:
                return jsonify({'error': 'Invalid scheduled_send_date format'}), 400
        
        # Set close date
        if 'close_date' in data:
            try:
                campaign.close_date = datetime.fromisoformat(
                    data['close_date'].replace('Z', '+00:00')
                )
            except ValueError:
                return jsonify({'error': 'Invalid close_date format'}), 400
        
        db.session.add(campaign)
        db.session.flush()
        
        # Generate recipient list if requested
        if data.get('generate_recipients', False):
            survey_service = SurveyService()
            recipients_result = survey_service.generate_campaign_recipients(campaign.id)
            
            campaign.total_recipients = recipients_result['total_recipients']
        
        db.session.commit()
        
        return jsonify({
            'message': 'Survey campaign created successfully',
            'campaign_id': campaign.id,
            'name': campaign.name,
            'total_recipients': campaign.total_recipients
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating survey campaign: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@survey_campaign_routes.route('/survey-campaigns/<int:campaign_id>', methods=['GET'])
@login_required
@admin_required
@verify_club_access()
def get_survey_campaign(campaign_id):
    """Get detailed survey campaign information"""
    try:
        campaign = SurveyCampaign.query.get_or_404(campaign_id)
        
        if current_user.tennis_club_id != campaign.tennis_club_id and not current_user.is_super_admin:
            return jsonify({'error': 'Unauthorized access'}), 403
        
        # Get recent recipients (sample)
        recent_recipients = SurveyRecipient.query.filter_by(
            campaign_id=campaign_id
        ).order_by(SurveyRecipient.created_at.desc()).limit(10).all()
        
        recipients_data = []
        for recipient in recent_recipients:
            recipients_data.append({
                'id': recipient.id,
                'email': recipient.email,
                'recipient_name': recipient.recipient_name,
                'student_name': recipient.student_name,
                'email_sent_at': recipient.email_sent_at.isoformat() if recipient.email_sent_at else None,
                'email_delivered_at': recipient.email_delivered_at.isoformat() if recipient.email_delivered_at else None,
                'survey_opened_at': recipient.survey_opened_at.isoformat() if recipient.survey_opened_at else None,
                'survey_completed_at': recipient.survey_completed_at.isoformat() if recipient.survey_completed_at else None,
                'is_expired': recipient.is_expired()
            })
        
        campaign_data = {
            'id': campaign.id,
            'name': campaign.name,
            'status': campaign.status.value,
            'trigger_type': campaign.trigger_type.value,
            'template': {
                'id': campaign.template.id,
                'name': campaign.template.name,
                'question_count': len(campaign.template.questions)
            },
            'targeting': {
                'teaching_period': campaign.teaching_period.name if campaign.teaching_period else None,
                'group': campaign.group.name if campaign.group else None,
                'coach': campaign.coach.name if campaign.coach else None
            },
            'statistics': {
                'total_recipients': campaign.total_recipients,
                'emails_sent': campaign.emails_sent,
                'emails_delivered': campaign.emails_delivered,
                'emails_bounced': campaign.emails_bounced,
                'responses_received': campaign.responses_received,
                'response_rate': campaign.response_rate
            },
            'schedule': {
                'scheduled_send_date': campaign.scheduled_send_date.isoformat() if campaign.scheduled_send_date else None,
                'actual_send_date': campaign.actual_send_date.isoformat() if campaign.actual_send_date else None,
                'reminder_send_date': campaign.reminder_send_date.isoformat() if campaign.reminder_send_date else None,
                'close_date': campaign.close_date.isoformat() if campaign.close_date else None
            },
            'recent_recipients': recipients_data,
            'created_at': campaign.created_at.isoformat(),
            'created_by': campaign.created_by.name
        }
        
        return jsonify({'campaign': campaign_data})
        
    except Exception as e:
        current_app.logger.error(f"Error fetching survey campaign: {str(e)}")
        return jsonify({'error': str(e)}), 500

@survey_campaign_routes.route('/survey-campaigns/<int:campaign_id>/send', methods=['POST'])
@login_required
@admin_required
@verify_club_access()
def send_survey_campaign(campaign_id):
    """Send survey campaign immediately or schedule for later"""
    try:
        campaign = SurveyCampaign.query.get_or_404(campaign_id)
        
        if current_user.tennis_club_id != campaign.tennis_club_id and not current_user.is_super_admin:
            return jsonify({'error': 'Unauthorized access'}), 403
        
        if campaign.status not in [SurveyStatus.DRAFT, SurveyStatus.PAUSED]:
            return jsonify({'error': f'Cannot send campaign with status: {campaign.status.value}'}), 400
        
        data = request.get_json()
        send_immediately = data.get('send_immediately', False)
        
        survey_service = SurveyService()
        
        if send_immediately:
            # Send immediately
            result = survey_service.send_campaign_immediately(campaign_id)
            
            if result['success']:
                return jsonify({
                    'message': 'Campaign sent successfully',
                    'emails_sent': result['emails_sent'],
                    'emails_failed': result['emails_failed']
                })
            else:
                return jsonify({
                    'error': 'Failed to send campaign',
                    'details': result['error']
                }), 500
        else:
            # Schedule for later
            if not campaign.scheduled_send_date:
                return jsonify({'error': 'No scheduled send date set'}), 400
            
            campaign.status = SurveyStatus.ACTIVE
            db.session.commit()
            
            return jsonify({
                'message': 'Campaign scheduled successfully',
                'scheduled_for': campaign.scheduled_send_date.isoformat()
            })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error sending survey campaign: {str(e)}")
        return jsonify({'error': str(e)}), 500

@survey_campaign_routes.route('/survey-campaigns/<int:campaign_id>/recipients', methods=['GET'])
@login_required
@admin_required
@verify_club_access()
def get_campaign_recipients(campaign_id):
    """Get campaign recipients with pagination"""
    try:
        campaign = SurveyCampaign.query.get_or_404(campaign_id)
        
        if current_user.tennis_club_id != campaign.tennis_club_id and not current_user.is_super_admin:
            return jsonify({'error': 'Unauthorized access'}), 403
        
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        status_filter = request.args.get('status')  # 'sent', 'delivered', 'opened', 'completed'
        
        query = SurveyRecipient.query.filter_by(campaign_id=campaign_id)
        
        # Apply status filter
        if status_filter == 'sent':
            query = query.filter(SurveyRecipient.email_sent_at.isnot(None))
        elif status_filter == 'delivered':
            query = query.filter(SurveyRecipient.email_delivered_at.isnot(None))
        elif status_filter == 'opened':
            query = query.filter(SurveyRecipient.survey_opened_at.isnot(None))
        elif status_filter == 'completed':
            query = query.filter(SurveyRecipient.survey_completed_at.isnot(None))
        
        recipients = query.order_by(SurveyRecipient.created_at.desc()).paginate(
            page=page, per_page=per_page, error_out=False
        )
        
        recipients_data = []
        for recipient in recipients.items:
            recipients_data.append({
                'id': recipient.id,
                'email': recipient.email,
                'recipient_name': recipient.recipient_name,
                'student_name': recipient.student_name,
                'email_sent_at': recipient.email_sent_at.isoformat() if recipient.email_sent_at else None,
                'email_delivered_at': recipient.email_delivered_at.isoformat() if recipient.email_delivered_at else None,
                'email_bounced_at': recipient.email_bounced_at.isoformat() if recipient.email_bounced_at else None,
                'survey_opened_at': recipient.survey_opened_at.isoformat() if recipient.survey_opened_at else None,
                'survey_completed_at': recipient.survey_completed_at.isoformat() if recipient.survey_completed_at else None,
                'reminder_sent_at': recipient.reminder_sent_at.isoformat() if recipient.reminder_sent_at else None,
                'expires_at': recipient.expires_at.isoformat(),
                'is_expired': recipient.is_expired()
            })
        
        return jsonify({
            'recipients': recipients_data,
            'pagination': {
                'page': recipients.page,
                'pages': recipients.pages,
                'per_page': recipients.per_page,
                'total': recipients.total,
                'has_next': recipients.has_next,
                'has_prev': recipients.has_prev
            }
        })
        
    except Exception as e:
        current_app.logger.error(f"Error fetching campaign recipients: {str(e)}")
        return jsonify({'error': str(e)}), 500

@survey_campaign_routes.route('/survey-campaigns/<int:campaign_id>/preview-recipients', methods=['POST'])
@login_required
@admin_required
@verify_club_access()
def preview_campaign_recipients(campaign_id):
    """Preview who would receive the survey campaign"""
    try:
        campaign = SurveyCampaign.query.get_or_404(campaign_id)
        
        if current_user.tennis_club_id != campaign.tennis_club_id and not current_user.is_super_admin:
            return jsonify({'error': 'Unauthorized access'}), 403
        
        survey_service = SurveyService()
        preview_result = survey_service.preview_campaign_recipients(campaign_id)
        
        return jsonify({
            'total_eligible': preview_result['total_eligible'],
            'after_opt_outs': preview_result['after_opt_outs'],
            'after_frequency_limits': preview_result['after_frequency_limits'],
            'final_recipients': preview_result['final_recipients'],
            'sample_recipients': preview_result['sample_recipients'][:10],  # First 10 for preview
            'opt_out_count': preview_result['opt_out_count'],
            'frequency_blocked_count': preview_result['frequency_blocked_count']
        })
        
    except Exception as e:
        current_app.logger.error(f"Error previewing campaign recipients: {str(e)}")
        return jsonify({'error': str(e)}), 500

@survey_campaign_routes.route('/survey-campaigns/<int:campaign_id>', methods=['PUT'])
@login_required
@admin_required
@verify_club_access()
def update_survey_campaign(campaign_id):
    """Update survey campaign"""
    try:
        campaign = SurveyCampaign.query.get_or_404(campaign_id)
        
        if current_user.tennis_club_id != campaign.tennis_club_id and not current_user.is_super_admin:
            return jsonify({'error': 'Unauthorized access'}), 403
        
        if campaign.status not in [SurveyStatus.DRAFT, SurveyStatus.PAUSED]:
            return jsonify({'error': 'Cannot edit campaign that has been sent'}), 400
        
        data = request.get_json()
        
        # Update allowed fields
        if 'name' in data:
            campaign.name = data['name']
        
        if 'scheduled_send_date' in data:
            if data['scheduled_send_date']:
                try:
                    campaign.scheduled_send_date = datetime.fromisoformat(
                        data['scheduled_send_date'].replace('Z', '+00:00')
                    )
                except ValueError:
                    return jsonify({'error': 'Invalid scheduled_send_date format'}), 400
            else:
                campaign.scheduled_send_date = None
        
        if 'close_date' in data:
            if data['close_date']:
                try:
                    campaign.close_date = datetime.fromisoformat(
                        data['close_date'].replace('Z', '+00:00')
                    )
                except ValueError:
                    return jsonify({'error': 'Invalid close_date format'}), 400
            else:
                campaign.close_date = None
        
        if 'status' in data:
            try:
                new_status = SurveyStatus[data['status'].upper()]
                campaign.status = new_status
            except KeyError:
                return jsonify({'error': f'Invalid status: {data["status"]}'}), 400
        
        campaign.updated_at = datetime.now(timezone.utc)
        db.session.commit()
        
        return jsonify({
            'message': 'Campaign updated successfully',
            'campaign_id': campaign.id
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating survey campaign: {str(e)}")
        return jsonify({'error': str(e)}), 500

@survey_campaign_routes.route('/survey-campaigns/<int:campaign_id>', methods=['DELETE'])
@login_required
@admin_required
@verify_club_access()
def delete_survey_campaign(campaign_id):
    """Delete survey campaign (only if not sent)"""
    try:
        campaign = SurveyCampaign.query.get_or_404(campaign_id)
        
        if current_user.tennis_club_id != campaign.tennis_club_id and not current_user.is_super_admin:
            return jsonify({'error': 'Unauthorized access'}), 403
        
        if campaign.status not in [SurveyStatus.DRAFT]:
            return jsonify({'error': 'Cannot delete campaign that has been sent'}), 400
        
        # Delete associated recipients
        SurveyRecipient.query.filter_by(campaign_id=campaign_id).delete()
        
        # Delete campaign
        db.session.delete(campaign)
        db.session.commit()
        
        return jsonify({
            'message': 'Campaign deleted successfully'
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error deleting survey campaign: {str(e)}")
        return jsonify({'error': str(e)}), 500
    
@survey_campaign_routes.route('/clubs/<int:club_id>/survey-analytics', methods=['GET'])
@login_required
@admin_required
@verify_club_access()
def get_survey_analytics(club_id):
    """Get aggregated survey analytics for the club"""
    try:
        # Check if surveys are enabled
        compliance = ClubComplianceStatus.query.filter_by(
            tennis_club_id=club_id
        ).first()
        
        if not compliance or not compliance.surveys_enabled:
            return jsonify({'error': 'Surveys not enabled for this club'}), 403

        # Get date range from query params
        days = request.args.get('days', 90, type=int)  # Default to 90 days
        start_date = datetime.now(timezone.utc) - timedelta(days=days)

        # Response trends over time
        response_trends = db.session.query(
            func.date(SurveyResponse.submitted_at).label('date'),
            func.count(SurveyResponse.id).label('count')
        ).filter(
            SurveyResponse.tennis_club_id == club_id,
            SurveyResponse.submitted_at >= start_date
        ).group_by(
            func.date(SurveyResponse.submitted_at)
        ).order_by('date').all()

        # Campaign performance
        campaign_performance = db.session.query(
            SurveyCampaign.id,
            SurveyCampaign.name,
            SurveyCampaign.total_recipients,
            SurveyCampaign.responses_received,
            SurveyCampaign.response_rate
        ).filter(
            SurveyCampaign.tennis_club_id == club_id,
            SurveyCampaign.actual_send_date >= start_date
        ).order_by(desc(SurveyCampaign.response_rate)).limit(10).all()

        # Template usage
        template_usage = db.session.query(
            SurveyTemplate.name,
            func.count(SurveyCampaign.id).label('campaign_count'),
            func.count(SurveyResponse.id).label('response_count')
        ).outerjoin(SurveyCampaign).outerjoin(SurveyResponse).filter(
            SurveyTemplate.tennis_club_id == club_id,
            SurveyTemplate.is_active == True
        ).group_by(SurveyTemplate.id, SurveyTemplate.name).all()

        return jsonify({
            'date_range_days': days,
            'response_trends': [
                {'date': trend.date.isoformat(), 'responses': trend.count}
                for trend in response_trends
            ],
            'campaign_performance': [
                {
                    'id': perf[0],
                    'name': perf[1],
                    'total_recipients': perf[2],
                    'responses_received': perf[3],
                    'response_rate': perf[4]
                }
                for perf in campaign_performance
            ],
            'template_usage': [
                {
                    'template_name': usage[0],
                    'campaign_count': usage[1],
                    'response_count': usage[2]
                }
                for usage in template_usage
            ]
        })

    except Exception as e:
        current_app.logger.error(f"Error fetching survey analytics: {str(e)}")
        return jsonify({'error': str(e)}), 500

@survey_campaign_routes.route('/clubs/<int:club_id>/survey-quick-stats', methods=['GET'])
@login_required
@verify_club_access()
def get_survey_quick_stats(club_id):
    """Get quick survey stats for dashboard widget (available to all authenticated users)"""
    try:
        # Check if surveys are enabled
        compliance = ClubComplianceStatus.query.filter_by(
            tennis_club_id=club_id
        ).first()
        
        if not compliance or not compliance.surveys_enabled:
            return jsonify({
                'surveys_enabled': False,
                'pending_compliance': True
            })

        # Quick stats for dashboard widget
        active_campaigns = SurveyCampaign.query.filter_by(
            tennis_club_id=club_id,
            status=SurveyStatus.ACTIVE
        ).count()

        # Recent responses (last 7 days)
        week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        recent_responses = SurveyResponse.query.filter(
            SurveyResponse.tennis_club_id == club_id,
            SurveyResponse.submitted_at >= week_ago
        ).count()

        return jsonify({
            'surveys_enabled': True,
            'active_campaigns': active_campaigns,
            'recent_responses': recent_responses
        })

    except Exception as e:
        current_app.logger.error(f"Error fetching survey quick stats: {str(e)}")
        return jsonify({'error': str(e)}), 500

@survey_campaign_routes.route('/clubs/<int:club_id>/survey-export', methods=['POST'])
@login_required
@admin_required
@verify_club_access()
def export_survey_data(club_id):
    """Export survey data for the club"""
    try:
        data = request.get_json()
        export_type = data.get('type', 'responses')  # 'responses', 'campaigns', 'analytics'
        
        # Check if surveys are enabled
        compliance = ClubComplianceStatus.query.filter_by(
            tennis_club_id=club_id
        ).first()
        
        if not compliance or not compliance.surveys_enabled:
            return jsonify({'error': 'Surveys not enabled for this club'}), 403

        if export_type == 'responses':
            # Export response data
            campaign_ids = data.get('campaign_ids', [])
            
            query = SurveyResponse.query.filter_by(tennis_club_id=club_id)
            if campaign_ids:
                query = query.filter(SurveyResponse.campaign_id.in_(campaign_ids))
            
            responses = query.order_by(desc(SurveyResponse.submitted_at)).all()
            
            export_data = []
            for response in responses:
                export_data.append({
                    'response_id': response.id,
                    'campaign_name': response.campaign.name,
                    'template_name': response.template.name,
                    'submitted_at': response.submitted_at.isoformat(),
                    'completion_time_seconds': response.completion_time_seconds,
                    'responses': response.responses,
                    'respondent_type': response.respondent_type,
                    'student_age_group': response.student_age_group
                })
            
            return jsonify({
                'export_type': 'responses',
                'data': export_data,
                'total_records': len(export_data)
            })

        elif export_type == 'campaigns':
            # Export campaign data
            campaigns = SurveyCampaign.query.filter_by(
                tennis_club_id=club_id
            ).order_by(desc(SurveyCampaign.created_at)).all()
            
            export_data = []
            for campaign in campaigns:
                export_data.append({
                    'campaign_id': campaign.id,
                    'name': campaign.name,
                    'template_name': campaign.template.name,
                    'status': campaign.status.value,
                    'trigger_type': campaign.trigger_type.value,
                    'total_recipients': campaign.total_recipients,
                    'emails_sent': campaign.emails_sent,
                    'emails_delivered': campaign.emails_delivered,
                    'responses_received': campaign.responses_received,
                    'response_rate': campaign.response_rate,
                    'created_at': campaign.created_at.isoformat(),
                    'actual_send_date': campaign.actual_send_date.isoformat() if campaign.actual_send_date else None
                })
            
            return jsonify({
                'export_type': 'campaigns',
                'data': export_data,
                'total_records': len(export_data)
            })

        else:
            return jsonify({'error': 'Invalid export type'}), 400

    except Exception as e:
        current_app.logger.error(f"Error exporting survey data: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Also add this helper function for checking survey permissions
def check_surveys_enabled(club_id):
    """Helper function to check if surveys are enabled for the club"""
    compliance = ClubComplianceStatus.query.filter_by(
        tennis_club_id=club_id
    ).first()
    return compliance and compliance.surveys_enabled

@survey_campaign_routes.route('/clubs/<int:club_id>/survey-dashboard', methods=['GET'])
@login_required
@admin_required
@verify_club_access()
def get_survey_dashboard(club_id):
    """Get survey dashboard overview data for club admins"""
    try:
        # Check if surveys are enabled
        compliance = ClubComplianceStatus.query.filter_by(
            tennis_club_id=club_id
        ).first()
        
        if not compliance or not compliance.surveys_enabled:
            return jsonify({
                'surveys_enabled': False,
                'compliance_status': compliance.compliance_percentage if compliance else 0
            })

        # Get basic stats
        total_templates = SurveyTemplate.query.filter_by(
            tennis_club_id=club_id,
            is_active=True
        ).count()

        total_campaigns = SurveyCampaign.query.filter_by(
            tennis_club_id=club_id
        ).count()

        # Active campaigns
        active_campaigns = SurveyCampaign.query.filter_by(
            tennis_club_id=club_id,
            status=SurveyStatus.ACTIVE
        ).count()

        # Recent responses (last 30 days)
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        recent_responses = SurveyResponse.query.filter(
            SurveyResponse.tennis_club_id == club_id,
            SurveyResponse.submitted_at >= thirty_days_ago
        ).count()

        # Total responses ever
        total_responses = SurveyResponse.query.filter_by(
            tennis_club_id=club_id
        ).count()

        # Opt-out count
        opt_out_count = SurveyOptOut.query.filter_by(
            tennis_club_id=club_id,
            opted_back_in_at=None
        ).count()

        # Recent campaigns with stats
        recent_campaigns = SurveyCampaign.query.filter_by(
            tennis_club_id=club_id
        ).order_by(desc(SurveyCampaign.created_at)).limit(5).all()

        campaigns_data = []
        for campaign in recent_campaigns:
            campaigns_data.append({
                'id': campaign.id,
                'name': campaign.name,
                'status': campaign.status.value,
                'template_name': campaign.template.name,
                'total_recipients': campaign.total_recipients,
                'responses_received': campaign.responses_received,
                'response_rate': campaign.response_rate,
                'created_at': campaign.created_at.isoformat(),
                'actual_send_date': campaign.actual_send_date.isoformat() if campaign.actual_send_date else None
            })

        return jsonify({
            'surveys_enabled': True,
            'compliance_status': compliance.compliance_percentage,
            'stats': {
                'total_templates': total_templates,
                'total_campaigns': total_campaigns,
                'active_campaigns': active_campaigns,
                'recent_responses': recent_responses,
                'total_responses': total_responses,
                'opt_out_count': opt_out_count
            },
            'recent_campaigns': campaigns_data
        })

    except Exception as e:
        current_app.logger.error(f"Error fetching survey dashboard: {str(e)}")
        return jsonify({'error': str(e)}), 500

@survey_campaign_routes.route('/clubs/<int:club_id>/survey-settings', methods=['GET', 'PUT'])
@login_required
@admin_required
@verify_club_access()
def survey_settings(club_id):
    """Get or update club-level survey settings"""
    try:
        compliance = ClubComplianceStatus.query.filter_by(
            tennis_club_id=club_id
        ).first()

        if not compliance:
            compliance = ClubComplianceStatus(tennis_club_id=club_id)
            db.session.add(compliance)
            db.session.commit()

        if request.method == 'GET':
            return jsonify({
                'default_retention_days': compliance.default_retention_days,
                'privacy_policy_url': compliance.privacy_policy_url,
                'data_retention_policy_url': compliance.data_retention_policy_url,
                'surveys_enabled': compliance.surveys_enabled,
                'requires_review': compliance.requires_review,
                'compliance_notes': compliance.compliance_notes
            })

        elif request.method == 'PUT':
            data = request.get_json()
            
            if 'default_retention_days' in data:
                compliance.default_retention_days = data['default_retention_days']
            if 'privacy_policy_url' in data:
                compliance.privacy_policy_url = data['privacy_policy_url']
            if 'data_retention_policy_url' in data:
                compliance.data_retention_policy_url = data['data_retention_policy_url']
            if 'compliance_notes' in data:
                compliance.compliance_notes = data['compliance_notes']

            compliance.updated_at = datetime.now(timezone.utc)
            db.session.commit()

            return jsonify({'message': 'Survey settings updated successfully'})

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error managing survey settings: {str(e)}")
        return jsonify({'error': str(e)}), 500


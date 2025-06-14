from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from app.models import SurveyTemplate, SurveyQuestion, SurveyQuestionType, ClubComplianceStatus
from app import db
from app.utils.auth import admin_required
from app.clubs.middleware import verify_club_access
from datetime import datetime, timezone
import traceback

survey_template_routes = Blueprint('survey_templates', __name__, url_prefix='/api')

def check_surveys_enabled(club_id):
    """Check if surveys are enabled for the club"""
    compliance = ClubComplianceStatus.query.filter_by(
        tennis_club_id=club_id
    ).first()
    return compliance and compliance.surveys_enabled

@survey_template_routes.route('/clubs/<int:club_id>/survey-templates', methods=['GET'])
@login_required
@admin_required
@verify_club_access()
def get_survey_templates(club_id):
    """Get all survey templates for a club"""
    try:
        if not check_surveys_enabled(club_id):
            return jsonify({'error': 'Surveys not enabled for this club'}), 403
        
        templates = SurveyTemplate.query.filter_by(
            tennis_club_id=club_id,
            is_active=True
        ).order_by(SurveyTemplate.created_at.desc()).all()
        
        template_data = []
        for template in templates:
            template_data.append({
                'id': template.id,
                'name': template.name,
                'description': template.description,
                'purpose_statement': template.purpose_statement,
                'question_count': len(template.questions),
                'retention_days': template.retention_days,
                'max_frequency_days': template.max_frequency_days,
                'allow_anonymous': template.allow_anonymous,
                'created_at': template.created_at.isoformat(),
                'created_by': template.created_by.name
            })
        
        return jsonify({
            'templates': template_data,
            'total': len(template_data)
        })
        
    except Exception as e:
        current_app.logger.error(f"Error fetching survey templates: {str(e)}")
        return jsonify({'error': str(e)}), 500

@survey_template_routes.route('/clubs/<int:club_id>/survey-templates', methods=['POST'])
@login_required
@admin_required
@verify_club_access()
def create_survey_template(club_id):
    """Create a new survey template"""
    try:
        if not check_surveys_enabled(club_id):
            return jsonify({'error': 'Surveys not enabled for this club'}), 403
        
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['name', 'purpose_statement']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Create template
        template = SurveyTemplate(
            tennis_club_id=club_id,
            name=data['name'],
            description=data.get('description'),
            purpose_statement=data['purpose_statement'],
            retention_days=data.get('retention_days', 730),
            max_frequency_days=data.get('max_frequency_days', 90),
            allow_anonymous=data.get('allow_anonymous', True),
            collect_contact_info=data.get('collect_contact_info', False),
            send_reminder=data.get('send_reminder', True),
            reminder_days=data.get('reminder_days', 7),
            created_by_id=current_user.id
        )
        
        db.session.add(template)
        db.session.flush()  # Get template ID
        
        # Add questions if provided
        if 'questions' in data:
            for question_data in data['questions']:
                question = SurveyQuestion(
                    template_id=template.id,
                    question_text=question_data['question_text'],
                    question_type=SurveyQuestionType[question_data['question_type'].upper()],
                    is_required=question_data.get('is_required', False),
                    order_index=question_data['order_index'],
                    options=question_data.get('options'),
                    help_text=question_data.get('help_text')
                )
                db.session.add(question)
        
        db.session.commit()
        
        return jsonify({
            'message': 'Survey template created successfully',
            'template_id': template.id,
            'name': template.name
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating survey template: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@survey_template_routes.route('/survey-templates/<int:template_id>', methods=['GET'])
@login_required
@admin_required
@verify_club_access()
def get_survey_template(template_id):
    """Get detailed survey template with questions"""
    try:
        template = SurveyTemplate.query.get_or_404(template_id)
        
        if current_user.tennis_club_id != template.tennis_club_id and not current_user.is_super_admin:
            return jsonify({'error': 'Unauthorized access'}), 403
        
        # Build questions data
        questions_data = []
        for question in template.questions:
            questions_data.append({
                'id': question.id,
                'question_text': question.question_text,
                'question_type': question.question_type.value,
                'is_required': question.is_required,
                'order_index': question.order_index,
                'options': question.options,
                'help_text': question.help_text,
                'default_options': question.default_options
            })
        
        template_data = {
            'id': template.id,
            'name': template.name,
            'description': template.description,
            'purpose_statement': template.purpose_statement,
            'retention_days': template.retention_days,
            'max_frequency_days': template.max_frequency_days,
            'allow_anonymous': template.allow_anonymous,
            'collect_contact_info': template.collect_contact_info,
            'send_reminder': template.send_reminder,
            'reminder_days': template.reminder_days,
            'questions': questions_data,
            'created_at': template.created_at.isoformat(),
            'created_by': template.created_by.name
        }
        
        return jsonify({'template': template_data})
        
    except Exception as e:
        current_app.logger.error(f"Error fetching survey template: {str(e)}")
        return jsonify({'error': str(e)}), 500

@survey_template_routes.route('/survey-templates/<int:template_id>', methods=['PUT'])
@login_required
@admin_required
@verify_club_access()
def update_survey_template(template_id):
    """Update survey template"""
    try:
        template = SurveyTemplate.query.get_or_404(template_id)
        
        if current_user.tennis_club_id != template.tennis_club_id and not current_user.is_super_admin:
            return jsonify({'error': 'Unauthorized access'}), 403
        
        data = request.get_json()
        
        # Update template fields
        if 'name' in data:
            template.name = data['name']
        if 'description' in data:
            template.description = data['description']
        if 'purpose_statement' in data:
            template.purpose_statement = data['purpose_statement']
        if 'retention_days' in data:
            template.retention_days = data['retention_days']
        if 'max_frequency_days' in data:
            template.max_frequency_days = data['max_frequency_days']
        if 'allow_anonymous' in data:
            template.allow_anonymous = data['allow_anonymous']
        if 'collect_contact_info' in data:
            template.collect_contact_info = data['collect_contact_info']
        if 'send_reminder' in data:
            template.send_reminder = data['send_reminder']
        if 'reminder_days' in data:
            template.reminder_days = data['reminder_days']
        
        template.updated_at = datetime.now(timezone.utc)
        
        # Update questions if provided
        if 'questions' in data:
            # Delete existing questions
            SurveyQuestion.query.filter_by(template_id=template.id).delete()
            
            # Add new questions
            for question_data in data['questions']:
                question = SurveyQuestion(
                    template_id=template.id,
                    question_text=question_data['question_text'],
                    question_type=SurveyQuestionType[question_data['question_type'].upper()],
                    is_required=question_data.get('is_required', False),
                    order_index=question_data['order_index'],
                    options=question_data.get('options'),
                    help_text=question_data.get('help_text')
                )
                db.session.add(question)
        
        db.session.commit()
        
        return jsonify({
            'message': 'Survey template updated successfully',
            'template_id': template.id
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating survey template: {str(e)}")
        return jsonify({'error': str(e)}), 500

@survey_template_routes.route('/survey-templates/<int:template_id>', methods=['DELETE'])
@login_required
@admin_required
@verify_club_access()
def delete_survey_template(template_id):
    """Delete (deactivate) survey template"""
    try:
        template = SurveyTemplate.query.get_or_404(template_id)
        
        if current_user.tennis_club_id != template.tennis_club_id and not current_user.is_super_admin:
            return jsonify({'error': 'Unauthorized access'}), 403
        
        # Check if template is being used in active campaigns
        from app.models import SurveyCampaign, SurveyStatus
        active_campaigns = SurveyCampaign.query.filter_by(
            template_id=template_id
        ).filter(SurveyCampaign.status.in_([
            SurveyStatus.DRAFT, SurveyStatus.ACTIVE
        ])).count()
        
        if active_campaigns > 0:
            return jsonify({
                'error': f'Cannot delete template with {active_campaigns} active campaigns'
            }), 400
        
        # Soft delete
        template.is_active = False
        template.updated_at = datetime.now(timezone.utc)
        
        db.session.commit()
        
        return jsonify({
            'message': 'Survey template deleted successfully'
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error deleting survey template: {str(e)}")
        return jsonify({'error': str(e)}), 500

@survey_template_routes.route('/survey-question-types', methods=['GET'])
@login_required
@verify_club_access()
def get_question_types():
    """Get available question types and their configurations"""
    try:
        question_types = []
        
        for qtype in SurveyQuestionType:
            type_info = {
                'value': qtype.value,
                'name': qtype.name,
                'display_name': qtype.value.replace('_', ' ').title(),
                'description': get_question_type_description(qtype),
                'default_options': get_question_type_defaults(qtype)
            }
            question_types.append(type_info)
        
        return jsonify({'question_types': question_types})
        
    except Exception as e:
        current_app.logger.error(f"Error fetching question types: {str(e)}")
        return jsonify({'error': str(e)}), 500

def get_question_type_description(qtype):
    """Get description for question type"""
    descriptions = {
        SurveyQuestionType.TEXT: 'Short text input (single line)',
        SurveyQuestionType.TEXTAREA: 'Long text input (multiple lines)',
        SurveyQuestionType.RATING: 'Rating scale (1-5 stars)',
        SurveyQuestionType.MULTIPLE_CHOICE: 'Multiple choice selection',
        SurveyQuestionType.YES_NO: 'Simple Yes/No question',
        SurveyQuestionType.NPS: 'Net Promoter Score (0-10 scale)'
    }
    return descriptions.get(qtype, '')

def get_question_type_defaults(qtype):
    """Get default options for question type"""
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
        },
        SurveyQuestionType.MULTIPLE_CHOICE: {
            'options': [],
            'allow_other': False
        }
    }
    return defaults.get(qtype, {})

@survey_template_routes.route('/clubs/<int:club_id>/survey-templates/library', methods=['GET'])
@login_required
@admin_required
@verify_club_access()
def get_template_library(club_id):
    """Get pre-built survey templates"""
    try:
        club = current_user.tennis_club
        
        templates = [
            {
                'name': 'End of Term Feedback',
                'description': 'Collect feedback about coaching quality and student progress',
                'purpose_statement': f'To improve tennis coaching quality at {club.name} by collecting feedback about student progress and coaching effectiveness.',
                'questions': [
                    {
                        'question_text': 'How would you rate the overall quality of coaching this term?',
                        'question_type': 'rating',
                        'is_required': True,
                        'order_index': 1
                    },
                    {
                        'question_text': 'How much progress has your child made this term?',
                        'question_type': 'rating',
                        'is_required': True,
                        'order_index': 2
                    },
                    {
                        'question_text': 'What did your child enjoy most about their tennis sessions?',
                        'question_type': 'textarea',
                        'is_required': False,
                        'order_index': 3
                    },
                    {
                        'question_text': 'How can we improve our coaching for next term?',
                        'question_type': 'textarea',
                        'is_required': False,
                        'order_index': 4
                    },
                    {
                        'question_text': 'Would you recommend our tennis coaching to other families?',
                        'question_type': 'nps',
                        'is_required': True,
                        'order_index': 5
                    }
                ]
            },
            {
                'name': 'Facility Feedback',
                'description': 'Gather feedback about tennis facilities and equipment',
                'purpose_statement': f'To improve tennis facilities and equipment at {club.name} based on user feedback.',
                'questions': [
                    {
                        'question_text': 'How would you rate the condition of our tennis courts?',
                        'question_type': 'rating',
                        'is_required': True,
                        'order_index': 1
                    },
                    {
                        'question_text': 'Are the changing facilities adequate?',
                        'question_type': 'yes_no',
                        'is_required': True,
                        'order_index': 2
                    },
                    {
                        'question_text': 'What facility improvements would you like to see?',
                        'question_type': 'textarea',
                        'is_required': False,
                        'order_index': 3
                    }
                ]
            },
            {
                'name': 'New Student Welcome',
                'description': 'Check in with new students after their first few sessions',
                'purpose_statement': f'To ensure new students at {club.name} are settling in well and receiving appropriate support.',
                'questions': [
                    {
                        'question_text': 'How is your child finding their tennis sessions so far?',
                        'question_type': 'multiple_choice',
                        'is_required': True,
                        'order_index': 1,
                        'options': {
                            'options': ['Really enjoying them', 'Quite enjoying them', 'Finding them okay', 'Not enjoying them much', 'Really struggling']
                        }
                    },
                    {
                        'question_text': 'Does your child feel supported by their coach?',
                        'question_type': 'yes_no',
                        'is_required': True,
                        'order_index': 2
                    },
                    {
                        'question_text': 'Is there anything we can do to help your child settle in better?',
                        'question_type': 'textarea',
                        'is_required': False,
                        'order_index': 3
                    }
                ]
            }
        ]
        
        return jsonify({'templates': templates})
        
    except Exception as e:
        current_app.logger.error(f"Error fetching template library: {str(e)}")
        return jsonify({'error': str(e)}), 500
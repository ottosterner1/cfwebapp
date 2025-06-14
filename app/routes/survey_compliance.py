from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from app.models import ClubComplianceStatus, TennisClub
from app import db
from app.utils.auth import admin_required
from app.clubs.middleware import verify_club_access
from datetime import datetime, timezone
import traceback

survey_compliance_routes = Blueprint('survey_compliance', __name__, url_prefix='/api')

@survey_compliance_routes.route('/clubs/<int:club_id>/compliance/status', methods=['GET'])
@login_required
@admin_required
@verify_club_access()
def get_compliance_status(club_id):
    """Get current GDPR compliance status for survey feature"""
    try:
        club = TennisClub.query.get_or_404(club_id)
        
        if current_user.tennis_club_id != club_id and not current_user.is_super_admin:
            return jsonify({'error': 'Unauthorized access'}), 403
        
        compliance = ClubComplianceStatus.query.filter_by(
            tennis_club_id=club_id
        ).first()
        
        if not compliance:
            # Create default compliance record
            compliance = ClubComplianceStatus(
                tennis_club_id=club_id,
                lia_completed=False,
                privacy_policy_updated=False,
                surveys_enabled=False
            )
            db.session.add(compliance)
            db.session.commit()
        
        return jsonify({
            'club_id': club_id,
            'club_name': club.name,
            'compliance': {
                'lia_completed': compliance.lia_completed,
                'lia_completed_at': compliance.lia_completed_at.isoformat() if compliance.lia_completed_at else None,
                'privacy_policy_updated': compliance.privacy_policy_updated,
                'privacy_policy_updated_at': compliance.privacy_policy_updated_at.isoformat() if compliance.privacy_policy_updated_at else None,
                'surveys_enabled': compliance.surveys_enabled,
                'surveys_enabled_at': compliance.surveys_enabled_at.isoformat() if compliance.surveys_enabled_at else None,
                'is_compliant': compliance.is_compliant,
                'compliance_percentage': compliance.compliance_percentage,
                'requires_review': compliance.requires_review
            }
        })
        
    except Exception as e:
        current_app.logger.error(f"Error fetching compliance status: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@survey_compliance_routes.route('/clubs/<int:club_id>/compliance/lia', methods=['POST'])
@login_required
@admin_required
@verify_club_access()
def complete_lia(club_id):
    """Complete Legitimate Interest Assessment"""
    try:
        if current_user.tennis_club_id != club_id and not current_user.is_super_admin:
            return jsonify({'error': 'Unauthorized access'}), 403
        
        data = request.get_json()
        
        # Validate required fields
        required_fields = [
            'purpose_statement',
            'balancing_assessment', 
            'safeguards',
            'admin_confirmation'
        ]
        
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        if not data['admin_confirmation']:
            return jsonify({'error': 'Admin confirmation is required'}), 400
        
        # Get or create compliance record
        compliance = ClubComplianceStatus.query.filter_by(
            tennis_club_id=club_id
        ).first()
        
        if not compliance:
            compliance = ClubComplianceStatus(tennis_club_id=club_id)
            db.session.add(compliance)
        
        # Update LIA fields
        compliance.lia_completed = True
        compliance.lia_completed_at = datetime.now(timezone.utc)
        compliance.lia_completed_by_id = current_user.id
        compliance.lia_purpose_statement = data['purpose_statement']
        compliance.lia_balancing_assessment = data['balancing_assessment']
        compliance.lia_safeguards = data['safeguards']
        
        db.session.commit()
        
        return jsonify({
            'message': 'LIA completed successfully',
            'compliance_percentage': compliance.compliance_percentage,
            'next_step': 'privacy_policy_update' if not compliance.privacy_policy_updated else 'enable_surveys'
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error completing LIA: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@survey_compliance_routes.route('/clubs/<int:club_id>/compliance/privacy-policy', methods=['PUT'])
@login_required
@admin_required
@verify_club_access()
def update_privacy_policy_status(club_id):
    """Update privacy policy compliance status"""
    try:
        if current_user.tennis_club_id != club_id and not current_user.is_super_admin:
            return jsonify({'error': 'Unauthorized access'}), 403
        
        data = request.get_json()
        
        if not data.get('privacy_policy_updated'):
            return jsonify({'error': 'Privacy policy update confirmation is required'}), 400
        
        compliance = ClubComplianceStatus.query.filter_by(
            tennis_club_id=club_id
        ).first()
        
        if not compliance:
            return jsonify({'error': 'Complete LIA first'}), 400
        
        compliance.privacy_policy_updated = True
        compliance.privacy_policy_updated_at = datetime.now(timezone.utc)
        compliance.privacy_policy_url = data.get('privacy_policy_url')
        
        db.session.commit()
        
        return jsonify({
            'message': 'Privacy policy status updated successfully',
            'compliance_percentage': compliance.compliance_percentage,
            'can_enable_surveys': compliance.lia_completed and compliance.privacy_policy_updated
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating privacy policy status: {str(e)}")
        return jsonify({'error': str(e)}), 500

@survey_compliance_routes.route('/clubs/<int:club_id>/compliance/enable-surveys', methods=['POST'])
@login_required
@admin_required
@verify_club_access()
def enable_surveys(club_id):
    """Enable survey feature after compliance completion"""
    try:
        if current_user.tennis_club_id != club_id and not current_user.is_super_admin:
            return jsonify({'error': 'Unauthorized access'}), 403
        
        compliance = ClubComplianceStatus.query.filter_by(
            tennis_club_id=club_id
        ).first()
        
        if not compliance or not compliance.lia_completed or not compliance.privacy_policy_updated:
            return jsonify({
                'error': 'Must complete LIA and update privacy policy before enabling surveys'
            }), 400
        
        if compliance.surveys_enabled:
            return jsonify({'message': 'Surveys are already enabled'}), 200
        
        compliance.surveys_enabled = True
        compliance.surveys_enabled_at = datetime.now(timezone.utc)
        compliance.surveys_enabled_by_id = current_user.id
        
        # Enable survey features for the club
        from app.models.club_feature import ClubFeature
        survey_features = ['surveys_basic', 'surveys_automated']
        
        for feature_name in survey_features:
            feature = ClubFeature.query.filter_by(
                tennis_club_id=club_id,
                feature_name=feature_name
            ).first()
            
            if not feature:
                feature = ClubFeature(
                    tennis_club_id=club_id,
                    feature_name=feature_name,
                    is_enabled=True
                )
                db.session.add(feature)
            else:
                feature.is_enabled = True
        
        db.session.commit()
        
        return jsonify({
            'message': 'Surveys enabled successfully',
            'compliance_status': 'complete',
            'surveys_enabled': True
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error enabling surveys: {str(e)}")
        return jsonify({'error': str(e)}), 500

@survey_compliance_routes.route('/clubs/<int:club_id>/compliance/lia-template', methods=['GET'])
@login_required
@admin_required
@verify_club_access()
def get_lia_template(club_id):
    """Get LIA template with guidance"""
    try:
        club = TennisClub.query.get_or_404(club_id)
        
        template = {
            'purpose_statement': {
                'label': 'Purpose Statement',
                'help_text': 'Explain why you want to collect customer feedback',
                'example': f'To improve the quality of tennis coaching and facilities at {club.name} by collecting feedback from parents and students about their experience.',
                'required': True
            },
            'balancing_assessment': {
                'label': 'Balancing Assessment',
                'help_text': 'Explain how you balance your business interest against individual privacy',
                'example': 'Our interest in service improvement is balanced against minimal privacy impact. Surveys are brief, optional, and responses can be anonymous. The benefit to all families (improved coaching) outweighs the minimal privacy intrusion.',
                'required': True
            },
            'safeguards': {
                'label': 'Safeguards Implemented',
                'help_text': 'Select the safeguards you will implement',
                'options': [
                    'Easy opt-out mechanism provided',
                    'Anonymous response option available',
                    'Limited frequency (maximum quarterly)',
                    'Clear purpose statement in all communications',
                    'Automatic data deletion after retention period',
                    'No sharing of individual responses',
                    'Secure data storage and transmission'
                ],
                'required': True
            }
        }
        
        return jsonify({
            'club_name': club.name,
            'template': template
        })
        
    except Exception as e:
        current_app.logger.error(f"Error fetching LIA template: {str(e)}")
        return jsonify({'error': str(e)}), 500
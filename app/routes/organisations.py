from flask import Blueprint, jsonify, request, current_app
from flask_login import login_required, current_user
from app.models import Organisation, TennisClub, User, UserRole, ReportTemplate
from app import db
from app.utils.auth import admin_required
from app.services.email_service import EmailService
import traceback
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func

organisation_routes = Blueprint('organisations', __name__, url_prefix='/api/organisations')

@organisation_routes.before_request
def verify_permissions():
    """Ensure only super admins can access organisation routes"""
    if not current_user.is_super_admin:
        return jsonify({'error': 'Super admin privileges required'}), 403

@organisation_routes.route('/', methods=['GET'])
@login_required
def list_organisations():
    """Get all organisations with their clubs and stats"""
    try:
        organisations = Organisation.query.order_by(Organisation.name).all()
        
        result = []
        for org in organisations:
            # Get admin users across all clubs in the organisation
            admin_users = org.get_admin_users()
            
            # Get email verification status if configured
            email_status = None
            if org.sender_email:
                email_service = EmailService()
                email_status = email_service.get_verification_status(org.sender_email)
            
            org_data = {
                'id': org.id,
                'name': org.name,
                'slug': org.slug,
                'created_at': org.created_at.isoformat() if org.created_at else None,
                'sender_email': org.sender_email,
                'email_verified': email_status['is_verified'] if email_status else False,
                'club_count': len(org.clubs),
                'admin_count': len(admin_users),
                'template_count': len(org.report_templates),
                'clubs': [{
                    'id': club.id,
                    'name': club.name,
                    'subdomain': club.subdomain,
                    'created_at': club.created_at.isoformat() if club.created_at else None,
                    'user_count': club.users.count()
                } for club in org.clubs]
            }
            result.append(org_data)
            
        return jsonify(result)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching organisations: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@organisation_routes.route('/', methods=['POST'])
@login_required
def create_organisation():
    """Create a new organisation"""
    try:
        data = request.get_json()
        if not data or 'name' not in data or 'slug' not in data:
            return jsonify({'error': 'Name and slug are required'}), 400
        
        # Validate slug format (letters, numbers, hyphens only)
        slug = data['slug'].lower().strip()
        if not slug.replace('-', '').replace('_', '').isalnum():
            return jsonify({'error': 'Slug can only contain letters, numbers, hyphens, and underscores'}), 400
        
        # Check if slug already exists
        existing = Organisation.query.filter_by(slug=slug).first()
        if existing:
            return jsonify({'error': 'organisation slug already exists'}), 400
        
        organisation = Organisation(
            name=data['name'].strip(),
            slug=slug,
            sender_email=data.get('sender_email', '').strip() or None
        )
        
        db.session.add(organisation)
        db.session.commit()
        
        current_app.logger.info(f"Created organisation: {organisation.name} (ID: {organisation.id})")
        
        return jsonify({
            'id': organisation.id,
            'name': organisation.name,
            'slug': organisation.slug,
            'sender_email': organisation.sender_email,
            'message': 'organisation created successfully'
        }), 201
        
    except IntegrityError:
        db.session.rollback()
        return jsonify({'error': 'organisation slug must be unique'}), 400
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating organisation: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@organisation_routes.route('/<int:org_id>', methods=['GET'])
@login_required
def get_organisation(org_id):
    """Get a specific organisation with detailed information"""
    try:
        organisation = Organisation.query.get_or_404(org_id)
        
        # Get admin users across all clubs
        admin_users = organisation.get_admin_users()
        
        # Get template statistics
        templates = ReportTemplate.query.filter_by(
            organisation_id=org_id,
            is_active=True
        ).all()
        
        # Get email verification status if configured
        email_status = None
        if organisation.sender_email:
            email_service = EmailService()
            email_status = email_service.get_verification_status(organisation.sender_email)
        
        return jsonify({
            'id': organisation.id,
            'name': organisation.name,
            'slug': organisation.slug,
            'sender_email': organisation.sender_email,
            'email_status': email_status,
            'created_at': organisation.created_at.isoformat() if organisation.created_at else None,
            'clubs': [{
                'id': club.id,
                'name': club.name,
                'subdomain': club.subdomain,
                'created_at': club.created_at.isoformat() if club.created_at else None,
                'user_count': club.users.count(),
                'group_count': len(club.groups)
            } for club in organisation.clubs],
            'templates': [{
                'id': template.id,
                'name': template.name,
                'description': template.description,
                'is_active': template.is_active,
                'created_by': template.created_by.name if template.created_by else None
            } for template in templates],
            'admin_users': [{
                'id': user.id,
                'name': user.name,
                'email': user.email,
                'role': user.role.value,
                'club_name': user.tennis_club.name
            } for user in admin_users],
            'stats': {
                'total_clubs': len(organisation.clubs),
                'total_admins': len(admin_users),
                'total_templates': len(templates),
                'total_users': sum(club.users.count() for club in organisation.clubs)
            }
        })
        
    except Exception as e:
        current_app.logger.error(f"Error fetching organisation {org_id}: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@organisation_routes.route('/<int:org_id>', methods=['PUT'])
@login_required
def update_organisation(org_id):
    """Update an organisation"""
    try:
        organisation = Organisation.query.get_or_404(org_id)
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Update name if provided
        if 'name' in data:
            organisation.name = data['name'].strip()
        
        # Update slug if provided
        if 'slug' in data:
            new_slug = data['slug'].lower().strip()
            
            # Validate slug format
            if not new_slug.replace('-', '').replace('_', '').isalnum():
                return jsonify({'error': 'Slug can only contain letters, numbers, hyphens, and underscores'}), 400
            
            # Check if slug already exists (excluding current organisation)
            existing = Organisation.query.filter(
                Organisation.slug == new_slug,
                Organisation.id != org_id
            ).first()
            
            if existing:
                return jsonify({'error': 'organisation slug already exists'}), 400
            
            organisation.slug = new_slug
        
        # Update sender email if provided
        if 'sender_email' in data:
            sender_email = data['sender_email'].strip() if data['sender_email'] else None
            
            # Validate email format if provided
            if sender_email and '@' not in sender_email:
                return jsonify({'error': 'Please enter a valid email address'}), 400
            
            organisation.sender_email = sender_email
        
        db.session.commit()
        
        current_app.logger.info(f"Updated organisation: {organisation.name} (ID: {organisation.id})")
        
        # Get verification status if email was updated
        email_status = None
        if organisation.sender_email:
            email_service = EmailService()
            email_status = email_service.get_verification_status(organisation.sender_email)
        
        return jsonify({
            'id': organisation.id,
            'name': organisation.name,
            'slug': organisation.slug,
            'sender_email': organisation.sender_email,
            'email_status': email_status,
            'message': 'organisation updated successfully'
        })
        
    except IntegrityError:
        db.session.rollback()
        return jsonify({'error': 'organisation slug must be unique'}), 400
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating organisation {org_id}: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@organisation_routes.route('/<int:org_id>', methods=['DELETE'])
@login_required
def delete_organisation(org_id):
    """Delete an organisation (only if it has no clubs)"""
    try:
        organisation = Organisation.query.get_or_404(org_id)
        
        # Check if organisation has clubs
        if organisation.clubs:
            return jsonify({
                'error': 'Cannot delete organisation with associated clubs. Please move or delete clubs first.'
            }), 400
        
        # Check if organisation has templates
        if organisation.report_templates:
            return jsonify({
                'error': 'Cannot delete organisation with associated report templates. Please delete templates first.'
            }), 400
        
        org_name = organisation.name
        db.session.delete(organisation)
        db.session.commit()
        
        current_app.logger.info(f"Deleted organisation: {org_name} (ID: {org_id})")
        
        return jsonify({'message': f'organisation "{org_name}" deleted successfully'})
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error deleting organisation {org_id}: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

# EMAIL CONFIGURATION ROUTES

@organisation_routes.route('/<int:org_id>/email-config', methods=['GET'])
@login_required
def get_email_config(org_id):
    """Get organisation email configuration and verification status"""
    try:
        organisation = Organisation.query.get_or_404(org_id)
        
        result = {
            'organisation_id': organisation.id,
            'organisation_name': organisation.name,
            'sender_email': organisation.sender_email,
            'verification_status': None
        }
        
        # Check verification status if sender email is configured
        if organisation.sender_email:
            email_service = EmailService()
            verification_info = email_service.get_verification_status(organisation.sender_email)
            result['verification_status'] = verification_info
        
        return jsonify(result)
        
    except Exception as e:
        current_app.logger.error(f"Error getting email config for org {org_id}: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@organisation_routes.route('/<int:org_id>/email-config', methods=['PUT'])
@login_required
def update_email_config(org_id):
    """Update organisation sender email configuration"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        organisation = Organisation.query.get_or_404(org_id)
        
        sender_email = data.get('sender_email', '').strip()
        
        # Validate email format if provided
        if sender_email and '@' not in sender_email:
            return jsonify({'error': 'Please enter a valid email address'}), 400
        
        # Update organisation
        organisation.sender_email = sender_email if sender_email else None
        db.session.commit()
        
        # Get verification status if email was set
        verification_status = None
        if sender_email:
            email_service = EmailService()
            verification_status = email_service.get_verification_status(sender_email)
        
        current_app.logger.info(f"Updated sender email for organisation {organisation.name}: {sender_email}")
        
        return jsonify({
            'message': 'Email configuration updated successfully',
            'sender_email': organisation.sender_email,
            'verification_status': verification_status
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating email config for org {org_id}: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@organisation_routes.route('/<int:org_id>/send-verification', methods=['POST'])
@login_required
def send_verification(org_id):
    """Send verification email for organisation sender email"""
    try:
        organisation = Organisation.query.get_or_404(org_id)
        
        if not organisation.sender_email:
            return jsonify({'error': 'No sender email configured'}), 400
        
        email_service = EmailService()
        success, message = email_service.send_verification_email(organisation.sender_email)
        
        if success:
            current_app.logger.info(f"Verification email sent for organisation {organisation.name}: {organisation.sender_email}")
            return jsonify({
                'message': f'Verification email sent to {organisation.sender_email}. Please check your inbox and click the verification link.',
                'success': True
            })
        else:
            return jsonify({
                'error': f'Failed to send verification email: {message}',
                'success': False
            }), 400
        
    except Exception as e:
        current_app.logger.error(f"Error sending verification for org {org_id}: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@organisation_routes.route('/<int:org_id>/verification-status', methods=['GET'])
@login_required
def check_verification_status(org_id):
    """Check verification status of organisation sender email"""
    try:
        organisation = Organisation.query.get_or_404(org_id)
        
        if not organisation.sender_email:
            return jsonify({'error': 'No sender email configured'}), 400
        
        email_service = EmailService()
        verification_status = email_service.get_verification_status(organisation.sender_email)
        
        return jsonify(verification_status)
        
    except Exception as e:
        current_app.logger.error(f"Error checking verification status for org {org_id}: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

# CLUB MANAGEMENT ROUTES

@organisation_routes.route('/<int:org_id>/clubs', methods=['POST'])
@login_required
def add_club_to_organisation(org_id):
    """Move an existing club to this organisation"""
    try:
        organisation = Organisation.query.get_or_404(org_id)
        data = request.get_json()
        
        if not data or 'club_id' not in data:
            return jsonify({'error': 'Club ID is required'}), 400
        
        club = TennisClub.query.get_or_404(data['club_id'])
        
        # Update club's organisation
        old_org_id = club.organisation_id
        club.organisation_id = org_id
        
        db.session.commit()
        
        current_app.logger.info(f"Moved club {club.name} from organisation {old_org_id} to {org_id}")
        
        return jsonify({
            'message': f'Club "{club.name}" added to organisation "{organisation.name}"',
            'club': {
                'id': club.id,
                'name': club.name,
                'subdomain': club.subdomain
            }
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error adding club to organisation {org_id}: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@organisation_routes.route('/<int:org_id>/clubs/<int:club_id>', methods=['DELETE'])
@login_required
def remove_club_from_organisation(org_id, club_id):
    """Remove a club from this organisation (requires target organisation)"""
    try:
        organisation = Organisation.query.get_or_404(org_id)
        club = TennisClub.query.get_or_404(club_id)
        
        # Verify club belongs to this organisation
        if club.organisation_id != org_id:
            return jsonify({'error': 'Club does not belong to this organisation'}), 400
        
        data = request.get_json()
        target_org_id = data.get('target_organisation_id') if data else None
        
        if not target_org_id:
            return jsonify({'error': 'Target organisation ID is required'}), 400
        
        # Verify target organisation exists
        target_organisation = Organisation.query.get_or_404(target_org_id)
        
        # Move club to target organisation
        club.organisation_id = target_org_id
        db.session.commit()
        
        current_app.logger.info(f"Moved club {club.name} from {organisation.name} to {target_organisation.name}")
        
        return jsonify({
            'message': f'Club "{club.name}" moved from "{organisation.name}" to "{target_organisation.name}"'
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error removing club {club_id} from organisation {org_id}: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@organisation_routes.route('/<int:org_id>/templates', methods=['GET'])
@login_required
def get_organisation_templates(org_id):
    """Get all report templates for an organisation"""
    try:
        organisation = Organisation.query.get_or_404(org_id)
        
        templates = ReportTemplate.query.filter_by(
            organisation_id=org_id,
            is_active=True
        ).order_by(ReportTemplate.name).all()
        
        return jsonify([{
            'id': template.id,
            'name': template.name,
            'description': template.description,
            'created_by': template.created_by.name if template.created_by else None,
            'created_at': template.created_at.isoformat() if template.created_at else None,
            'sections_count': len(template.sections),
            'groups_assigned': len(template.groups)
        } for template in templates])
        
    except Exception as e:
        current_app.logger.error(f"Error fetching templates for organisation {org_id}: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@organisation_routes.route('/clubs-without-organisation', methods=['GET'])
@login_required
def get_clubs_without_organisation():
    """Get all clubs that are not assigned to any organisation"""
    try:
        clubs = TennisClub.query.filter_by(organisation_id=None).all()
        
        return jsonify([{
            'id': club.id,
            'name': club.name,
            'subdomain': club.subdomain,
            'created_at': club.created_at.isoformat() if club.created_at else None,
            'user_count': club.users.count()
        } for club in clubs])
        
    except Exception as e:
        current_app.logger.error(f"Error fetching clubs without organisation: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


# ADDITIONAL ROUTES FOR ADMIN ACCESS TO EMAIL CONFIG

# Create a separate blueprint for admin access to their own organisation's email config
admin_org_routes = Blueprint('admin_organisations', __name__, url_prefix='/api/admin/organisation')

@admin_org_routes.route('/email-config', methods=['GET'])
@login_required
@admin_required
def get_admin_email_config():
    """Get email configuration for current user's organisation (admin access)"""
    try:
        organisation = current_user.tennis_club.organisation
        
        if not organisation:
            return jsonify({'error': 'No organisation found'}), 404
        
        result = {
            'organisation_id': organisation.id,
            'organisation_name': organisation.name,
            'sender_email': organisation.sender_email,
            'verification_status': None
        }
        
        # Check verification status if sender email is configured
        if organisation.sender_email:
            email_service = EmailService()
            verification_info = email_service.get_verification_status(organisation.sender_email)
            result['verification_status'] = verification_info
        
        return jsonify(result)
        
    except Exception as e:
        current_app.logger.error(f"Error getting admin email config: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@admin_org_routes.route('/email-config', methods=['PUT'])
@login_required
@admin_required
def update_admin_email_config():
    """Update email configuration for current user's organisation (admin access)"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        organisation = current_user.tennis_club.organisation
        
        if not organisation:
            return jsonify({'error': 'No organisation found'}), 404
        
        sender_email = data.get('sender_email', '').strip()
        
        # Validate email format if provided
        if sender_email and '@' not in sender_email:
            return jsonify({'error': 'Please enter a valid email address'}), 400
        
        # Update organisation
        organisation.sender_email = sender_email if sender_email else None
        db.session.commit()
        
        # Get verification status if email was set
        verification_status = None
        if sender_email:
            email_service = EmailService()
            verification_status = email_service.get_verification_status(sender_email)
        
        current_app.logger.info(f"Admin updated sender email for organisation {organisation.name}: {sender_email}")
        
        return jsonify({
            'message': 'Email configuration updated successfully',
            'sender_email': organisation.sender_email,
            'verification_status': verification_status
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating admin email config: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@admin_org_routes.route('/send-verification', methods=['POST'])
@login_required
@admin_required
def send_admin_verification():
    """Send verification email for current user's organisation (admin access)"""
    try:
        organisation = current_user.tennis_club.organisation
        
        if not organisation:
            return jsonify({'error': 'No organisation found'}), 404
        
        if not organisation.sender_email:
            return jsonify({'error': 'No sender email configured'}), 400
        
        email_service = EmailService()
        success, message = email_service.send_verification_email(organisation.sender_email)
        
        if success:
            current_app.logger.info(f"Admin verification email sent for organisation {organisation.name}: {organisation.sender_email}")
            return jsonify({
                'message': f'Verification email sent to {organisation.sender_email}. Please check your inbox and click the verification link.',
                'success': True
            })
        else:
            return jsonify({
                'error': f'Failed to send verification email: {message}',
                'success': False
            }), 400
        
    except Exception as e:
        current_app.logger.error(f"Error sending admin verification: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
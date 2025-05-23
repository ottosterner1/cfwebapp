from flask import Blueprint, render_template, request, jsonify, flash, redirect, url_for, current_app
from flask_login import login_required, current_user
from app.models import User, CoachDetails, CoachQualification, CoachRole, UserRole
from app import db
from app.utils.auth import admin_required
from datetime import datetime, timezone, timedelta
import traceback
from sqlalchemy import and_, or_
from app.services.email_service import EmailService

admin_routes = Blueprint('admin', __name__, url_prefix='/api')

@admin_routes.route('/coaches/accreditations')
@login_required
def get_coach_accreditations():
    """Get accreditation status for coaches - accessible to all users"""
    club_id = current_user.tennis_club_id
    
    # If user is admin or super_admin, get all coaches
    # Otherwise, only get the current user
    if current_user.is_admin or current_user.is_super_admin:
        coaches = User.query.filter(
            and_(
                User.tennis_club_id == club_id,
                or_(
                    User.role == UserRole.COACH,
                    User.role == UserRole.ADMIN,
                    User.role == UserRole.SUPER_ADMIN
                )
            )
        ).all()
    else:
        coaches = [current_user]  # Only include the current user
    
    def get_accreditation_status(expiry_date):
        """Get status for date-based accreditations"""
        if not expiry_date:
            return {'status': 'expired', 'days_remaining': None}
            
        current_time = datetime.now(timezone.utc)
        if expiry_date.tzinfo != timezone.utc:
            expiry_date = expiry_date.astimezone(timezone.utc)
            
        days_remaining = (expiry_date - current_time).days
        
        if days_remaining < 0:
            return {'status': 'expired', 'days_remaining': days_remaining}
        elif days_remaining <= 90:
            return {'status': 'warning', 'days_remaining': days_remaining}
        else:
            return {'status': 'valid', 'days_remaining': days_remaining}

    
    coach_data = []
    for coach in coaches:
        details = coach.coach_details
        if details:
            accreditations = {
                'dbs': get_accreditation_status(details.dbs_expiry),
                'first_aid': get_accreditation_status(details.first_aid_expiry),
                'safeguarding': get_accreditation_status(details.safeguarding_expiry),
                'pediatric_first_aid': get_accreditation_status(details.pediatric_first_aid_expiry),
                'accreditation': get_accreditation_status(details.accreditation_expiry),
                'bcta_accreditation': get_accreditation_status(details.bcta_accreditation) 
            }
            
            coach_data.append({
                'id': coach.id,
                'name': coach.name,
                'email': coach.email,
                'accreditations': accreditations,
                'is_current_user': coach.id == current_user.id
            })
    
    return jsonify(coach_data)

@admin_routes.route('/coaches/send-accreditation-reminders', methods=['POST'])
@login_required
@admin_required
def send_accreditation_reminders():
    """Send accreditation reminder emails to coaches - admin only"""
    try:
        club_id = current_user.tennis_club_id
        club_name = current_user.tennis_club.name
        
        # Get all coaches with their accreditation details
        coaches = User.query.filter(
            and_(
                User.tennis_club_id == club_id,
                or_(
                    User.role == UserRole.COACH,
                    User.role == UserRole.ADMIN,
                    User.role == UserRole.SUPER_ADMIN
                )
            )
        ).join(CoachDetails, User.id == CoachDetails.user_id).all()
        
        email_service = EmailService()
        emails_sent = 0
        
        # Define accreditation types with their display names
        accreditation_types = {
            'dbs_expiry': ('DBS Check', 'DBS'),
            'first_aid_expiry': ('First Aid', 'First Aid'),
            'safeguarding_expiry': ('Safeguarding', 'Safeguarding'),
            'pediatric_first_aid_expiry': ('Pediatric First Aid', 'Pediatric First Aid'),
            'accreditation_expiry': ('LTA Accreditation', 'LTA Accreditation'),
            'bcta_accreditation': ('BCTA Accreditation', 'BCTA Accreditation')
        }
        
        current_time = datetime.now(timezone.utc)
        
        # Keep track of coaches who need emails
        coaches_with_reminders = {}
        
        # First, gather all accreditation issues for each coach
        for coach in coaches:
            if not coach.coach_details:
                continue
                
            details = coach.coach_details
            coach_accreditation_issues = []
            
            # Check each accreditation type
            for field_name, (display_name, email_name) in accreditation_types.items():
                
                expiry_date = getattr(details, field_name)
                
                # Skip if expiry date is not set
                if not expiry_date:
                    continue
                    
                # Ensure timezone awareness
                if expiry_date.tzinfo != timezone.utc:
                    expiry_date = expiry_date.astimezone(timezone.utc)
                    
                days_remaining = (expiry_date - current_time).days
                
                # Track issue if expiring within 90 days or expired recently
                if days_remaining <= 90:
                    status = 'expired' if days_remaining < 0 else 'warning'
                    coach_accreditation_issues.append({
                        'type': email_name,
                        'days_remaining': days_remaining,
                        'expiry_date': expiry_date,
                        'status': status
                    })
            
            # If coach has issues, add to our tracking dict
            if coach_accreditation_issues:
                coaches_with_reminders[coach.id] = {
                    'coach': coach,
                    'issues': coach_accreditation_issues
                }
        
        # Now send emails - one per coach with all their issues listed
        for coach_id, data in coaches_with_reminders.items():
            coach = data['coach']
            issues = data['issues']
            
            # Skip if no issues
            if not issues:
                continue
                
            # Compose email with all accreditation issues for this coach
            # For testing purposes, send to ottosterner1@gmail.com
            # recipient_email = "ottosterner1@gmail.com"
            recipient_email = coach.email
            coach_name = coach.name
            
            # Determine most urgent issue type (expired takes precedence over warning)
            has_expired = any(issue['status'] == 'expired' for issue in issues)
            email_type = 'NOTICE' if has_expired else 'REMINDER'
            
            # Create subject line
            if len(issues) == 1:
                subject = f"{email_type}: {issues[0]['type']} {issues[0]['status'].capitalize()}"
            else:
                subject = f"{email_type}: Multiple Certifications Require Attention"
            
            # Create HTML email body
            html_body = f"""
            <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h4 style="color: #333;">Hello {coach_name},</h4>
                    
                    <p>The following accreditations require your attention:</p>
                    
                    <ul style="list-style-type: none; padding: 0;">
            """
            
            # Add each issue to the email
            for issue in issues:
                if 'expiry_date' in issue and issue['expiry_date']:
                    formatted_date = issue['expiry_date'].strftime('%d/%m/%Y')
                    status_color = "#dc2626" if issue['status'] == 'expired' else "#eab308"
                    
                    if issue['status'] == 'expired':
                        status_text = f"<span style='color: {status_color};'><strong>EXPIRED</strong></span> on {formatted_date} ({abs(issue['days_remaining'])} days ago)"
                    else:
                        status_text = f"<span style='color: {status_color};'><strong>EXPIRING SOON</strong></span> on {formatted_date} ({issue['days_remaining']} days remaining)"
                else:
                    # Handle non-date fields like BCTA accreditation
                    status_color = "#dc2626"
                    status_text = f"<span style='color: {status_color};'><strong>MISSING</strong></span> - Please update your profile"
                
                html_body += f"""
                    <li style="margin-bottom: 15px; padding: 10px; border-left: 4px solid {status_color}; background-color: #f9fafb;">
                        <strong>{issue['type']}:</strong> {status_text}
                    </li>
                """
            
            # Complete the email
            html_body += f"""
                    </ul>
                    
                    <p>Please take action to renew these certifications as soon as possible. 
                    Remember that you cannot coach at {club_name} with expired accreditations.</p>
                    
                    <p>Once renewed, please send updated certificates to the club administrators.</p>
                    
                    <p style="margin-top: 20px;">Thank you<br></p>
                </div>
            </body>
            </html>
            """
            
            # Send the consolidated email
            plain_text = html_body.replace('<br>', '\n').replace('<strong>', '').replace('</strong>', '')
            for tag in ['<html>', '</html>', '<body>', '</body>', '<div>', '</div>', '<h2>', '</h2>', 
                         '<p>', '</p>', '<ul>', '</ul>', '<li>', '</li>', '<span>', '</span>']:
                plain_text = plain_text.replace(tag, '')
                
            success, message_id = email_service.send_generic_email(
                recipient_email=recipient_email,
                subject=subject,
                html_content=html_body,
                sender_name=club_name
            )
            
            if success:
                current_app.logger.info(f"Reminder email sent to {recipient_email} for {coach_name}'s accreditations")
                emails_sent += 1
            else:
                current_app.logger.error(f"Failed to send reminder email for {coach_name}'s accreditations: {message_id}")
        
        return jsonify({
            'message': f'Reminder process completed successfully',
            'emails_sent': emails_sent
        })
        
    except Exception as e:
        current_app.logger.error(f"Error sending accreditation reminders: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
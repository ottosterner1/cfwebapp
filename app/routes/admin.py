from flask import Blueprint, render_template, request, jsonify, flash, redirect, url_for
from flask_login import login_required, current_user
from app.models import User, CoachDetails, CoachQualification, CoachRole, UserRole
from app import db
from app.utils.auth import admin_required
from datetime import datetime, timezone
import traceback
from sqlalchemy import and_, or_
from app.services.email_service import EmailService

admin_routes = Blueprint('admin', __name__, url_prefix='/api')

@admin_routes.route('/coaches/accreditations')
@login_required
@admin_required
def get_coach_accreditations():
    club_id = current_user.tennis_club_id
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
    
    def get_accreditation_status(expiry_date):
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
                'accreditation': get_accreditation_status(details.accreditation_expiry)
            }
            
            coach_data.append({
                'id': coach.id,
                'name': coach.name,
                'email': coach.email,
                'accreditations': accreditations
            })
    
    return jsonify(coach_data)
from base64 import b64encode
import os
import traceback
from flask import Blueprint, render_template, request, redirect, url_for, flash, session, current_app, jsonify
from flask_login import login_user, login_required, logout_user, current_user
import requests
from werkzeug.security import check_password_hash, generate_password_hash
from app.models import (
    User, TennisGroup, TeachingPeriod, Student, Report, UserRole, 
    TennisClub, ProgrammePlayers, CoachInvitation, CoachDetails,
    GroupTemplate, ReportTemplate, TemplateSection, TemplateField, FieldType, TennisGroupTimes
)
from app import db
from app.auth import oauth
from app.clubs.routes import club_management
import pandas as pd
from sqlalchemy.orm import joinedload
from datetime import datetime, timezone, timedelta
from werkzeug.utils import secure_filename
from flask import session, url_for
from sqlalchemy.exc import SQLAlchemyError
from botocore.exceptions import ClientError
import boto3
import secrets
from authlib.integrations.base_client.errors import MismatchingStateError
from app.utils.report_generator import create_single_report_pdf
from app.utils.auth import admin_required, club_access_required
from app.clubs.middleware import verify_club_access
from flask import send_file, make_response
from io import BytesIO
import zipfile
from app.config.clubs import get_club_from_email, TENNIS_CLUBS
from flask_cors import CORS, cross_origin
from sqlalchemy import func, distinct, and_, or_
from app.services.email_service import EmailService
import shutil

main = Blueprint('main', __name__)

@main.context_processor
def utility_processor():
    return {'UserRole': UserRole}

ALLOWED_EXTENSIONS = {'csv', 'xlsx', 'xls'}
REQUIRED_COLUMNS = ['student_name', 'age', 'performance', 'recommendations']

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@main.route('/')
def index():
    return render_template('pages/index.html')

@main.route('/signup')
def signup():
    try:
        # Generate secure tokens for both state and nonce
        state = secrets.token_urlsafe(32)
        nonce = secrets.token_urlsafe(32)
        
        # Store both in session
        session['oauth_state'] = state
        session['oauth_nonce'] = nonce
        
        redirect_uri = url_for('main.auth_callback', _external=True)
        
        authorize_params = {
            'redirect_uri': redirect_uri,
            'response_type': 'code',
            'state': state,
            'nonce': nonce,
            'scope': 'openid email profile',
            # Add any additional parameters needed for signup vs login
            'identity_provider': 'Google',
        }
        
        # Redirect to Cognito signup endpoint
        return oauth.cognito.authorize_redirect(**authorize_params)
        
    except Exception as e:
        current_app.logger.error(f"Signup error: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return f"Signup error: {str(e)}", 500

@main.route('/login')
def login():
    state = secrets.token_urlsafe(32)
    
    # Store state in session instead of cookie
    session['oauth_state'] = state
    
    redirect_uri = url_for('main.auth_callback', _external=True, _scheme='https')
    
    # Create and return response without setting cookie
    return redirect(
        f"https://{current_app.config['COGNITO_DOMAIN']}/login"
        f"?client_id={current_app.config['AWS_COGNITO_CLIENT_ID']}"
        f"&response_type=code&scope=openid+email+profile"
        f"&redirect_uri={redirect_uri}"
        f"&state={state}"
    )

@main.route('/auth/callback')
def auth_callback():
    try:
        state_in_request = request.args.get('state')
        state_in_session = session.get('oauth_state')
        code = request.args.get('code')
        
        if not state_in_session or state_in_session != state_in_request:
            current_app.logger.error(f"State mismatch: session={state_in_session}, request={state_in_request}")
            session.clear()  # Clear the session on mismatch
            return redirect(url_for('main.login'))

        if not code:
            current_app.logger.error("No authorization code received")
            return redirect(url_for('main.login'))

        # Create basic auth header
        client_id = current_app.config['AWS_COGNITO_CLIENT_ID']
        client_secret = current_app.config['AWS_COGNITO_CLIENT_SECRET']
        auth_string = f"{client_id}:{client_secret}"
        auth_bytes = auth_string.encode('utf-8')
        auth_header = b64encode(auth_bytes).decode('utf-8')

        # Exchange the code for tokens
        token_endpoint = f"https://{current_app.config['COGNITO_DOMAIN']}/oauth2/token"
        redirect_uri = url_for('main.auth_callback', _external=True, _scheme='https')
        
        token_response = requests.post(
            token_endpoint,
            headers={
                'Authorization': f'Basic {auth_header}',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data={
                'grant_type': 'authorization_code',
                'code': code,
                'redirect_uri': redirect_uri
            }
        )
        
        if token_response.status_code != 200:
            current_app.logger.error(f"Token exchange failed: {token_response.text}")
            return redirect(url_for('main.login'))

        token_data = token_response.json()

        # Get user info using the access token
        userinfo_endpoint = f"https://{current_app.config['COGNITO_DOMAIN']}/oauth2/userInfo"
        userinfo_response = requests.get(
            userinfo_endpoint,
            headers={'Authorization': f"Bearer {token_data['access_token']}"}
        )
        
        if userinfo_response.status_code != 200:
            current_app.logger.error(f"Userinfo failed: {userinfo_response.text}")
            return redirect(url_for('main.login'))

        userinfo = userinfo_response.json()
        email = userinfo.get('email')
        name = userinfo.get('name')
        provider_id = userinfo.get('sub')

        if not email:
            current_app.logger.error("No email provided in user info")
            return redirect(url_for('main.login'))

        user = User.query.filter_by(email=email).first()
        
        # Check for pending invitation first
        pending_invitation = session.get('pending_invitation')
        if pending_invitation:
            
            # Get the invitation data
            invitation_token = pending_invitation.get('token')
            tennis_club_id = pending_invitation.get('tennis_club_id')
            invitation_email = pending_invitation.get('email')
            
            # Verify the invitation is valid and matches the authenticated email
            if email.lower() == invitation_email.lower():
                invitation = CoachInvitation.query.filter_by(
                    token=invitation_token, 
                    used=False,
                    tennis_club_id=tennis_club_id,
                    email=invitation_email
                ).first()
                
                if invitation and not invitation.is_expired:
                    # If user doesn't exist yet, create them
                    if not user:
                        # Generate a unique username
                        base_username = f"coach_{email.split('@')[0]}"
                        username = base_username
                        counter = 1
                        
                        # Keep checking until we find a unique username
                        while User.query.filter_by(username=username).first():
                            username = f"{base_username}_{counter}"
                            counter += 1
                        
                        user = User(
                            email=email,
                            username=username,
                            name=name,
                            role=UserRole.COACH,
                            auth_provider='cognito',
                            auth_provider_id=provider_id,
                            is_active=True,
                            tennis_club_id=tennis_club_id
                        )
                        db.session.add(user)
                    else:
                        # Update existing user with tennis club info
                        user.tennis_club_id = tennis_club_id
                        user.auth_provider = 'cognito'
                        user.auth_provider_id = provider_id
                    
                    # Mark invitation as used
                    invitation.used = True
                    db.session.commit()
                    
                    # Login the user
                    login_user(user, remember=True)
                    
                    # Clear the pending invitation
                    session.pop('pending_invitation', None)
                    session.pop('oauth_state', None)
                    
                    flash('You have successfully joined the tennis club!', 'success')
                    return redirect(url_for('main.home'))
                else:
                    # Invalid or expired invitation
                    session.pop('pending_invitation', None)
                    flash('Invalid or expired invitation', 'error')
                    return redirect(url_for('main.login'))
            else:
                # Email mismatch
                current_app.logger.warning(f"Email mismatch: invitation for {invitation_email}, but logged in as {email}")
                session.pop('pending_invitation', None)
                flash('The email you logged in with does not match the invitation', 'error')
                return redirect(url_for('main.login'))

        # Normal flow for non-invitation users
        if user and user.tennis_club_id:
            login_user(user, remember=True)
            response = redirect(url_for('main.home'))
            
            # Set session data
            session.permanent = True
            session['user_id'] = user.id
            session.modified = True  # Ensure session is saved
            
            # Clean up oauth state
            session.pop('oauth_state', None)
            
            # Set response headers
            response.headers.update({
                'Access-Control-Allow-Credentials': 'true',
                'Access-Control-Allow-Origin': request.headers.get('Origin', 'https://cfwebapp.local'),
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie, X-Requested-With',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            })
            
            return response
        else:
            session['temp_user_info'] = {
                'email': email,
                'name': name,
                'provider_id': provider_id,
            }
            session.modified = True  # Ensure session is saved
            return redirect(url_for('club_management.onboard_club'))

    except requests.exceptions.RequestException as e:
        current_app.logger.error(f"Network error during authentication: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return redirect(url_for('main.login'))
    except Exception as e:
        current_app.logger.error(f"Auth callback error: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        
        error_context = {
            'token_response_status': getattr(token_response, 'status_code', None) if 'token_response' in locals() else None,
            'token_response_text': getattr(token_response, 'text', None) if 'token_response' in locals() else None,
            'userinfo_response_status': getattr(userinfo_response, 'status_code', None) if 'userinfo_response' in locals() else None,
            'userinfo_response_text': getattr(userinfo_response, 'text', None) if 'userinfo_response' in locals() else None
        }
        current_app.logger.error(f"Error context: {error_context}")
        
        flash('Authentication failed')
        return redirect(url_for('main.login'))
    
@main.route('/logout')
@login_required
def logout():
    # Clear Flask-Login session
    logout_user()
    
    # Clear all session data
    session.clear()
    
    # Build the Cognito logout URL
    cognito_domain = current_app.config['COGNITO_DOMAIN']
    client_id = current_app.config['AWS_COGNITO_CLIENT_ID']
    logout_uri = url_for('main.index', _external=True)
    
    # Create response
    response = make_response(redirect(
        f"https://{cognito_domain}/logout?"
        f"client_id={client_id}&"
        f"logout_uri={logout_uri}"
    ))
    
    # Clear all cookies
    response.delete_cookie('oauth_state')
    response.delete_cookie('session')
    response.delete_cookie('remember_token')
    
    return response

def serialize_period(period):
    """Helper function to serialize teaching period"""
    return {
        'id': period.id,
        'name': period.name,
        'start_date': period.start_date.isoformat() if period.start_date else None,
        'end_date': period.end_date.isoformat() if period.end_date else None
    }

def serialize_programme_player(player):
    """Helper function to serialize programme player"""
    return {
        'id': player.id,
        'student_id': player.student_id,
        'student_name': player.student.name if player.student else None,
        'tennis_group': {
            'id': player.tennis_group.id,
            'name': player.tennis_group.name
        } if player.tennis_group else None,
        'coach_id': player.coach_id
    }

def serialize_report(report):
    """Helper function to serialize report"""
    return {
        'id': report.id,
        'student_id': report.student_id,
        'coach_id': report.coach_id,
        'submission_date': report.submission_date.isoformat() if report.submission_date else None,
        'group_id': report.group_id,
        'recommended_group': report.tennis_group.name if report.tennis_group else None
    }

def serialize_coach(coach):
    """Helper function to serialize coach"""
    return {
        'id': coach.id,
        'name': coach.name,
        'email': coach.email
    }

@main.route('/dashboard')
@login_required
@verify_club_access()
def dashboard():
    return render_template('pages/dashboard.html')

@main.route('/api/current-user')
@login_required
@verify_club_access()
def current_user_info():
    
    if not current_user.is_authenticated:
        return jsonify({'error': 'Not authenticated'}), 401

    response = jsonify({
        'id': current_user.id,
        'name': current_user.name,
        'tennis_club': {
            'id': current_user.tennis_club_id,
            'name': current_user.tennis_club.name if current_user.tennis_club else None
        },
        'is_admin': current_user.is_admin,
        'is_super_admin': current_user.is_super_admin
    })

    response.headers.update({
        'Access-Control-Allow-Origin': request.headers.get('Origin', 'https://cfwebapp.local'),
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie, X-Requested-With'
    })
    
    return response

# Add OPTIONS handler for the same route
@main.route('/api/current-user', methods=['OPTIONS'])
def current_user_options():
    response = jsonify({'status': 'ok'})
    response.headers['Access-Control-Allow-Origin'] = request.headers.get('Origin', '*')
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Cookie'
    return response

@main.route('/api/dashboard/stats')
@login_required
@verify_club_access()
def dashboard_stats():
    try:
        tennis_club_id = current_user.tennis_club_id
        selected_period_id = request.args.get('period', type=int)
        
        # Get all teaching periods ordered by start date (newest first)
        all_periods = TeachingPeriod.query.filter_by(
            tennis_club_id=tennis_club_id
        ).order_by(TeachingPeriod.start_date.desc()).all()
        
        # Get period IDs that have players
        period_ids_with_players = (db.session.query(ProgrammePlayers.teaching_period_id)
            .filter(ProgrammePlayers.tennis_club_id == tennis_club_id)
            .distinct()
            .all())
        period_ids = [p[0] for p in period_ids_with_players]
        
        # Find the default period (latest with players)
        default_period_id = None
        if period_ids:
            default_period = TeachingPeriod.query.filter(
                TeachingPeriod.id.in_(period_ids),
                TeachingPeriod.tennis_club_id == tennis_club_id
            ).order_by(TeachingPeriod.start_date.desc()).first()
            
            if default_period:
                default_period_id = default_period.id
        
        # If no period is selected, use the default
        if not selected_period_id and default_period_id:
            selected_period_id = default_period_id

        # Rest of your existing query logic...
        base_query = (ProgrammePlayers.query
            .select_from(ProgrammePlayers)
            .join(TennisGroup, ProgrammePlayers.group_id == TennisGroup.id)
            .join(GroupTemplate, and_(
                TennisGroup.id == GroupTemplate.group_id,
                GroupTemplate.is_active == True
            ))
            .join(ReportTemplate, and_(
                ReportTemplate.id == GroupTemplate.template_id,
                ReportTemplate.is_active == True
            ))
            .filter(ProgrammePlayers.tennis_club_id == tennis_club_id))

        if not (current_user.is_admin or current_user.is_super_admin):
            base_query = base_query.filter(ProgrammePlayers.coach_id == current_user.id)
            
        if selected_period_id:
            base_query = base_query.filter(ProgrammePlayers.teaching_period_id == selected_period_id)
            
        total_students = base_query.count()
        
        # Get reports
        reports_query = (Report.query
            .select_from(Report)
            .join(ProgrammePlayers)
            .join(TennisGroup, ProgrammePlayers.group_id == TennisGroup.id)
            .join(GroupTemplate, and_(
                TennisGroup.id == GroupTemplate.group_id,
                GroupTemplate.is_active == True
            ))
            .join(ReportTemplate, and_(
                ReportTemplate.id == GroupTemplate.template_id,
                ReportTemplate.is_active == True
            ))
            .filter(ProgrammePlayers.tennis_club_id == tennis_club_id))

        if not (current_user.is_admin or current_user.is_super_admin):
            reports_query = reports_query.filter(ProgrammePlayers.coach_id == current_user.id)
            
        if selected_period_id:
            reports_query = reports_query.filter(Report.teaching_period_id == selected_period_id)
            
        total_reports = reports_query.count()
        completion_rate = round((total_reports / total_students * 100) if total_students > 0 else 0, 1)
        
        # Get group stats
        group_stats_query = (db.session.query(
            TennisGroup.name,
            func.count(distinct(ProgrammePlayers.id)).label('count'),
            func.count(distinct(Report.id)).label('reports_completed')
        )
        .select_from(TennisGroup)
        .join(GroupTemplate, and_(
            TennisGroup.id == GroupTemplate.group_id,
            GroupTemplate.is_active == True
        ))
        .join(ReportTemplate, and_(
            ReportTemplate.id == GroupTemplate.template_id,
            ReportTemplate.is_active == True
        ))
        .join(ProgrammePlayers, TennisGroup.id == ProgrammePlayers.group_id)
        .outerjoin(Report, ProgrammePlayers.id == Report.programme_player_id)
        .filter(ProgrammePlayers.tennis_club_id == tennis_club_id))
        
        if selected_period_id:
            group_stats_query = group_stats_query.filter(
                ProgrammePlayers.teaching_period_id == selected_period_id
            )
            
        if not (current_user.is_admin or current_user.is_super_admin):
            group_stats_query = group_stats_query.filter(
                ProgrammePlayers.coach_id == current_user.id
            )
            
        group_stats = group_stats_query.group_by(TennisGroup.name).all()
        
        # Get coach summaries only for admin users
        coach_summaries = None
        if current_user.is_admin or current_user.is_super_admin:
            coach_summaries = []
            coaches = User.query.filter_by(
                tennis_club_id=tennis_club_id,
            ).all()
            
            for coach in coaches:
                # Create fresh queries for each coach
                coach_players = base_query.filter(ProgrammePlayers.coach_id == coach.id).count()
                coach_reports = reports_query.filter(ProgrammePlayers.coach_id == coach.id).count()
                
                coach_summaries.append({
                    'id': coach.id,
                    'name': coach.name,
                    'total_assigned': coach_players,
                    'reports_completed': coach_reports
                })

        # Get group recommendations
        recommendations_query = (db.session.query(
            TennisGroup.name.label('from_group'),
            func.count().label('count'),
            Report.recommended_group_id
        )
        .select_from(Report)
        .join(ProgrammePlayers, Report.programme_player_id == ProgrammePlayers.id)
        .join(TennisGroup, ProgrammePlayers.group_id == TennisGroup.id)
        .join(GroupTemplate, and_(
            TennisGroup.id == GroupTemplate.group_id,
            GroupTemplate.is_active == True
        ))
        .join(ReportTemplate, and_(
            ReportTemplate.id == GroupTemplate.template_id,
            ReportTemplate.is_active == True
        ))
        .filter(
            ProgrammePlayers.tennis_club_id == tennis_club_id,
            Report.recommended_group_id.isnot(None)
        ))
        
        if selected_period_id:
            recommendations_query = recommendations_query.filter(
                Report.teaching_period_id == selected_period_id
            )
            
        if not (current_user.is_admin or current_user.is_super_admin):
            recommendations_query = recommendations_query.filter(
                ProgrammePlayers.coach_id == current_user.id
            )
            
        recommendations = recommendations_query.group_by(
            TennisGroup.name,
            Report.recommended_group_id
        ).all()
        
        # Process recommendations
        group_recommendations = []
        for from_group, count, recommended_group_id in recommendations:
            to_group = TennisGroup.query.get(recommended_group_id)
            if to_group:
                group_recommendations.append({
                    'from_group': from_group,
                    'to_group': to_group.name,
                    'count': count
                })
        
        response_data = {
            'periods': [{
                'id': p.id,
                'name': p.name,
                'hasPlayers': p.id in period_ids
            } for p in all_periods],
            'defaultPeriodId': default_period_id,
            'stats': {
                'totalStudents': total_students,
                'totalReports': total_reports,
                'reportCompletion': completion_rate,
                'currentGroups': [{
                    'name': name,
                    'count': count,
                    'reports_completed': completed
                } for name, count, completed in group_stats],
                'coachSummaries': coach_summaries,
                'groupRecommendations': group_recommendations
            }
        }
        return jsonify(response_data)
        
    except Exception as e:
        current_app.logger.error(f"Error in dashboard stats: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({
            'error': f"Server error: {str(e)}",
            'periods': [],
            'stats': {
                'totalStudents': 0,
                'totalReports': 0,
                'reportCompletion': 0,
                'currentGroups': [],
                'coachSummaries': None,
                'groupRecommendations': []
            }
        }), 500

@main.route('/api/programme-players/next/<int:current_player_id>')
@login_required
@verify_club_access()
def get_next_player(current_player_id):
    try:
        # Get current player to find their group and period
        current_player = ProgrammePlayers.query.get_or_404(current_player_id)
        current_group_id = current_player.group_id
        current_period_id = current_player.teaching_period_id

        # Base query - get all programme players for the club
        base_query = (ProgrammePlayers.query
            .join(Student, ProgrammePlayers.student_id == Student.id)  # Explicit join with Student
            .join(TennisGroup, ProgrammePlayers.group_id == TennisGroup.id)  # Explicit join with TennisGroup
            .outerjoin(
                Report, 
                and_(
                    ProgrammePlayers.id == Report.programme_player_id,
                    ProgrammePlayers.teaching_period_id == Report.teaching_period_id
                )
            )
            .filter(
                ProgrammePlayers.tennis_club_id == current_user.tennis_club_id,
                ProgrammePlayers.teaching_period_id == current_period_id
            )
        )

        if not (current_user.is_admin or current_user.is_super_admin):
            base_query = base_query.filter(ProgrammePlayers.coach_id == current_user.id)

        # First try to find the next player in the same group
        next_player = (base_query
            .filter(
                ProgrammePlayers.group_id == current_group_id,
                ProgrammePlayers.id > current_player_id,
                Report.id.is_(None)  # No report submitted
            )
            .order_by(ProgrammePlayers.id)
            .first()
        )

        # If no next player in same group, find first player without report in next group
        if not next_player:
            next_player = (base_query
                .filter(
                    TennisGroup.id > current_group_id,  # Next group
                    Report.id.is_(None)  # No report submitted
                )
                .order_by(
                    TennisGroup.id,
                    Student.name
                )
                .first()
            )

        if next_player:
            return jsonify({
                'id': next_player.id,
                'student_name': next_player.student.name,
                'group_name': next_player.tennis_group.name,
                'group_id': next_player.group_id,
                'found_in_same_group': next_player.group_id == current_group_id
            })
        else:
            return jsonify({'message': 'No more players need reports'}), 404

    except Exception as e:
        current_app.logger.error(f"Error finding next player: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@main.route('/api/programme-players')
@login_required
@verify_club_access()
def programme_players():
    try:
        tennis_club_id = current_user.tennis_club_id
        selected_period_id = request.args.get('period', type=int)
        
        # If no period selected, find the latest period that has players
        if not selected_period_id:
            period_ids_with_players = (db.session.query(ProgrammePlayers.teaching_period_id)
                .filter(ProgrammePlayers.tennis_club_id == tennis_club_id)
                .distinct()
                .all())
            period_ids = [p[0] for p in period_ids_with_players]

            
            if period_ids:
                latest_period = (TeachingPeriod.query
                    .filter(TeachingPeriod.id.in_(period_ids))
                    .order_by(TeachingPeriod.start_date.desc())
                    .first())
                
                if latest_period:
                    selected_period_id = latest_period.id
        
        # Base query - get all programme players for the club
        query = ProgrammePlayers.query.filter_by(
            tennis_club_id=tennis_club_id
        )
        
        if selected_period_id:
            query = query.filter_by(teaching_period_id=selected_period_id)
            
        if not (current_user.is_admin or current_user.is_super_admin):
            query = query.filter_by(coach_id=current_user.id)
        
        players = query.join(
            Student, ProgrammePlayers.student_id == Student.id
        ).join(
            TennisGroup, ProgrammePlayers.group_id == TennisGroup.id
        ).outerjoin(
            TennisGroupTimes, ProgrammePlayers.group_time_id == TennisGroupTimes.id
        ).outerjoin(
            Report, and_(
                ProgrammePlayers.id == Report.programme_player_id,
                ProgrammePlayers.teaching_period_id == Report.teaching_period_id
            )
        ).outerjoin(
            GroupTemplate, and_(
                TennisGroup.id == GroupTemplate.group_id,
                GroupTemplate.is_active == True
            )
        ).with_entities(
            ProgrammePlayers.id,
            Student.name.label('student_name'),
            TennisGroup.name.label('group_name'),
            TennisGroup.id.label('group_id'),
            ProgrammePlayers.teaching_period_id,
            ProgrammePlayers.group_time_id,
            TennisGroupTimes.day_of_week,
            TennisGroupTimes.start_time,
            TennisGroupTimes.end_time,
            TennisGroupTimes.capacity,  # Added capacity
            Report.id.label('report_id'),
            Report.coach_id,
            ProgrammePlayers.coach_id.label('assigned_coach_id'),
            func.count(GroupTemplate.id).label('template_count')
        ).group_by(
            ProgrammePlayers.id,
            Student.name,
            TennisGroup.name,
            TennisGroup.id,
            ProgrammePlayers.teaching_period_id,
            ProgrammePlayers.group_time_id,
            TennisGroupTimes.day_of_week,
            TennisGroupTimes.start_time,
            TennisGroupTimes.end_time,
            TennisGroupTimes.capacity,  # Added capacity to group by
            Report.id,
            Report.coach_id,
            ProgrammePlayers.coach_id
        ).order_by(
            ProgrammePlayers.group_id,
            Student.name
        ).all()
        
        return jsonify([{
            'id': player.id,
            'student_name': player.student_name,
            'group_name': player.group_name,
            'group_id': player.group_id,
            'teaching_period_id': player.teaching_period_id,
            'group_time_id': player.group_time_id,
            'time_slot': {
                'day_of_week': player.day_of_week.value if player.day_of_week else None,
                'start_time': player.start_time.strftime('%H:%M') if player.start_time else None,
                'end_time': player.end_time.strftime('%H:%M') if player.end_time else None,
                'capacity': player.capacity  # Added capacity to time_slot object
            } if player.day_of_week else None,
            'report_submitted': player.report_id is not None,
            'report_id': player.report_id,
            'can_edit': current_user.is_admin or current_user.is_super_admin or 
                       player.coach_id == current_user.id or 
                       player.assigned_coach_id == current_user.id,
            'has_template': player.template_count > 0,
            'assigned_coach_id': player.assigned_coach_id 
        } for player in players])
        
    except Exception as e:
        current_app.logger.error(f"Error fetching programme players: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify([]), 500

@main.route('/upload', methods=['GET', 'POST'])
@login_required
def upload():
    # Get groups and periods specific to the user's tennis club
    groups = TennisGroup.query.filter_by(tennis_club_id=current_user.tennis_club_id).all()
    periods = TeachingPeriod.query.filter_by(tennis_club_id=current_user.tennis_club_id).order_by(TeachingPeriod.start_date.desc()).all()

    if request.method == 'POST':
        if 'file' not in request.files:
            flash('No file uploaded')
            return redirect(request.url)
            
        file = request.files['file']
        group_id = request.form.get('group_id')
        teaching_period_id = request.form.get('teaching_period_id')
        
        if not group_id or not teaching_period_id:
            flash('Please select both group and term')
            return redirect(request.url)
            
        if file.filename == '':
            flash('No file selected')
            return redirect(request.url)
            
        if file and allowed_file(file.filename):
            try:
                df = pd.read_csv(file)
                
                # Simplified expected columns
                expected_columns = [
                    'student_name',
                    'age',
                    'forehand',
                    'backhand',
                    'movement',
                    'overall_rating',
                    'next_group_recommendation',
                    'notes'
                ]
                
                missing_columns = [col for col in expected_columns if col not in df.columns]
                if missing_columns:
                    flash(f'Missing columns: {", ".join(missing_columns)}')
                    return redirect(request.url)
                
                students_created = 0
                reports_created = 0
                
                # Verify group and term belong to user's tennis club
                group = TennisGroup.query.filter_by(id=group_id, tennis_club_id=current_user.tennis_club_id).first()
                term = TeachingPeriod.query.filter_by(id=teaching_period_id, tennis_club_id=current_user.tennis_club_id).first()
                
                if not group or not term:
                    flash('Invalid group or term selected')
                    return redirect(request.url)
                
                for _, row in df.iterrows():
                    try:
                        # Get or create student
                        student_name = row['student_name'].strip()
                        student = Student.query.filter_by(
                            name=student_name,
                            tennis_club_id=current_user.tennis_club_id
                        ).first()
                        
                        if not student:
                            student = Student(
                                name=student_name,
                                age=int(row['age']),
                                tennis_club_id=current_user.tennis_club_id
                            )
                            db.session.add(student)
                            students_created += 1
                        
                        # Create simplified report
                        report = Report(
                            student=student,
                            coach_id=current_user.id,
                            group_id=group_id,
                            teaching_period_id=teaching_period_id,
                            forehand=row['forehand'],
                            backhand=row['backhand'],
                            movement=row['movement'],
                            overall_rating=int(row['overall_rating']),
                            next_group_recommendation=row['next_group_recommendation'],
                            notes=row.get('notes', '')  # Optional field
                        )
                        db.session.add(report)
                        reports_created += 1
                        
                    except Exception as e:
                        db.session.rollback()
                        current_app.logger.error(f"Error processing student: {str(e)}")  # Add logging
                        current_app.logger.error(f'Error processing student {student_name}: {str(e)}')
                        return redirect(request.url)
                
                db.session.commit()
                flash(f'Successfully added {students_created} new students and {reports_created} reports')
                return redirect(url_for('main.dashboard'))
                
            except Exception as e:
                db.session.rollback()
                current_app.logger.error(f"Error processing file: {str(e)}") 
                return redirect(request.url)
                
        else:
            flash('Invalid file type. Please upload a CSV or Excel file')
            return redirect(request.url)
            
    return render_template('pages/upload.html', groups=groups, periods=periods)

@main.route('/home')
@login_required
def home():
    try:
        # Get basic counts without group/term relations for now
        reports = Report.query.filter_by(coach_id=current_user.id).order_by(Report.date.desc()).all()
        students = Student.query.join(Report).filter(Report.coach_id == current_user.id).distinct().all()
        
        return render_template('pages/home.html', 
                            reports=reports,
                            students=students)
    except Exception as e:
        current_app.logger.error(f"Error in home route: {str(e)}")
        flash("Error loading dashboard data", "error")
        return redirect(url_for('main.index'))

# Add this at the top of routes.py
@main.route('/debug/reports')
@login_required
def debug_reports():
    reports = Report.query.all()
    return {
        'count': len(reports),
        'reports': [{
            'id': r.id,
            'student_id': r.student_id,
            'coach_id': r.coach_id
        } for r in reports]
    }

@main.route('/reports/<int:report_id>')
@login_required
@verify_club_access()
def view_report(report_id):
    """Render the view report page"""
    report = Report.query.get_or_404(report_id)
    
    # Check permissions
    if not (current_user.is_admin or current_user.is_super_admin) and report.coach_id != current_user.id:
        flash('You do not have permission to view this report', 'error')
        return redirect(url_for('main.dashboard'))
        
    return render_template('pages/view_report.html', report_id=report_id)

@main.route('/reports/<int:report_id>/edit')
@login_required
@verify_club_access()
def edit_report_page(report_id):
    """Render the edit report page"""
    report = Report.query.get_or_404(report_id)
    
    # Check permissions
    if not current_user.is_admin and report.coach_id != current_user.id:
        flash('You do not have permission to edit this report', 'error')
        return redirect(url_for('main.dashboard'))
        
    return render_template('pages/edit_report.html', report_id=report_id)

@main.route('/api/reports/<int:report_id>', methods=['GET', 'PUT'])
@login_required
@verify_club_access()
def report_operations(report_id):
    report = Report.query.get_or_404(report_id)
    
    # Check permissions
    if not current_user.is_admin and report.coach_id != current_user.id:
        return jsonify({'error': 'Permission denied'}), 403

    if request.method == 'GET':
        
        # Get the template associated with this report
        template = report.template

        # Normalize the report content if needed
        report_content = report.content
        if isinstance(report_content, dict) and 'content' in report_content:
            report_content = report_content['content']

        # Serialize the report data
        report_data = {
            'id': report.id,
            'studentName': report.student.name,
            'groupName': report.tennis_group.name,
            'content': report_content,
            'recommendedGroupId': report.recommended_group_id,
            'submissionDate': report.date.isoformat() if report.date else None,
            'canEdit': current_user.is_admin or report.coach_id == current_user.id
        }

        # Serialize the template data
        template_data = {
            'id': template.id,
            'name': template.name,
            'description': template.description,
            'sections': [{
                'id': s.id,
                'name': s.name,
                'order': s.order,
                'fields': [{
                    'id': field.id,
                    'name': field.name,
                    'description': field.description,
                    'fieldType': field.field_type.value,
                    'isRequired': field.is_required,
                    'order': field.order,
                    'options': field.options
                } for field in sorted(s.fields, key=lambda x: x.order)]
            } for s in sorted(template.sections, key=lambda x: x.order)]
        }

        return jsonify({
            'report': report_data,
            'template': template_data
        })

    elif request.method == 'PUT':
        try:
            data = request.get_json()
            if not data:
                return jsonify({'error': 'No data provided'}), 400

            # Update report content - should just be the section data
            report.content = data.get('content', {})
            
            # Update recommended group
            report.recommended_group_id = data.get('recommendedGroupId')
            
            # Record the update time
            report.date = datetime.utcnow()
            
            db.session.commit()
            
            return jsonify({
                'message': 'Report updated successfully',
                'report_id': report.id
            })
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error updating report: {str(e)}")
            return jsonify({'error': str(e)}), 500

@main.route('/api/reports/download-all/<int:period_id>', methods=['GET'])
@login_required
@admin_required
def download_all_reports(period_id):
    """Download all reports for a teaching period"""
    
    try:
        # Verify period belongs to user's club
        period = TeachingPeriod.query.filter_by(
            id=period_id,
            tennis_club_id=current_user.tennis_club_id
        ).first_or_404()
        
        # Get the club name and set up directories
        club_name = current_user.tennis_club.name
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        instance_dir = os.path.join(base_dir, 'app', 'instance', 'reports')
        
        # Create period-specific directory path
        period_name = period.name.replace(' ', '_').lower()
        period_dir = os.path.join(instance_dir, f'reports-{period_name}')
        
        # Clear existing reports directory if it exists
        if os.path.exists(period_dir):
            shutil.rmtree(period_dir)
        
        # Create fresh directory
        os.makedirs(instance_dir, exist_ok=True)
        
        # Choose generator based on club name
        if 'wilton' in club_name.lower():
            from app.utils.wilton_report_generator import EnhancedWiltonReportGenerator
            
            config_path = os.path.join(base_dir, 'app', 'utils', 'wilton_group_config.json')
            generator = EnhancedWiltonReportGenerator(config_path)
            result = generator.batch_generate_reports(period_id)
            
            # Get the period-specific directory (generated by the report generator)
            reports_dir = period_dir
        else:
            from app.utils.report_generator import batch_generate_reports
            result = batch_generate_reports(period_id)
            reports_dir = result.get('output_directory')
            
            
        if result.get('success', 0) == 0:
            current_app.logger.error(f"No reports generated. Details: {result.get('error_details', [])}")
            return jsonify({
                'error': 'No reports were generated',
                'details': result.get('error_details', [])
            }), 400
            
        # Verify the reports directory exists
        if not os.path.exists(reports_dir):
            current_app.logger.error(f"Reports directory not found at: {reports_dir}")
            return jsonify({'error': f'No reports were found after generation'}), 500
            
        # Create a ZIP file containing all generated reports
        memory_file = BytesIO()
        with zipfile.ZipFile(memory_file, 'w') as zf:
            pdf_count = 0
            
            for root, dirs, files in os.walk(reports_dir):
                
                for file in files:
                    if file.endswith('.pdf'):
                        file_path = os.path.join(root, file)
                        # Preserve directory structure relative to reports_dir
                        rel_path = os.path.relpath(file_path, reports_dir)
                        try:
                            zf.write(file_path, rel_path)
                            pdf_count += 1
                        except Exception as e:
                            current_app.logger.error(f"Error adding file to ZIP {file_path}: {str(e)}")
                            
            if pdf_count == 0:
                current_app.logger.error("No PDF files were found to add to ZIP")
                return jsonify({'error': 'No PDF files were generated'}), 400
                
        memory_file.seek(0)
        
        # Format filename
        formatted_club_name = club_name.lower().replace(' ', '_')
        formatted_term = period.name.lower().replace(' ', '_')
        filename = f"reports_{formatted_club_name}_{formatted_term}.zip"
        
        
        response = send_file(
            memory_file,
            mimetype='application/zip',
            as_attachment=True,
            download_name=filename
        )
        
        response.headers['Access-Control-Allow-Origin'] = '*'
        return response
        
    except Exception as e:
        current_app.logger.error(f"Error generating reports: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@main.route('/download_single_report/<int:report_id>')
@login_required
def download_single_report(report_id):
    """Download a single report as PDF"""
    report = Report.query.get_or_404(report_id)
    
    if report.coach_id != current_user.id:
        flash('You do not have permission to download this report')
        return redirect(url_for('main.dashboard'))
    
    # Create PDF in memory
    pdf_buffer = BytesIO()
    create_single_report_pdf(report, pdf_buffer)
    
    # Generate filename
    filename = f"{report.student.name}_{report.teaching_period.name}_{report.tennis_group.name}.pdf".replace(' ', '_')
    
    return send_file(
        pdf_buffer,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=filename
    )

@main.route('/admin/coaches', methods=['GET', 'POST'])
@login_required
@admin_required
def manage_coaches():
    """Admin route for managing coaches in their tennis club"""
    if request.method == 'POST':
        email = request.form.get('email')
        name = request.form.get('name')
        
        # Create new coach user
        coach = User(
            email=email,
            username=f"coach_{email.split('@')[0]}",
            name=name,
            role=UserRole.COACH,
            tennis_club_id=current_user.tennis_club_id
        )
        db.session.add(coach)
        db.session.commit()
        
        flash('Coach added successfully')
        return redirect(url_for('main.manage_coaches'))
        
    coaches = User.query.filter_by(
        tennis_club_id=current_user.tennis_club_id,
        role=UserRole.COACH
    ).all()
    
    return render_template('admin/coaches.html', coaches=coaches)

@main.route('/reports/delete/<int:report_id>', methods=['POST'])
@login_required
@verify_club_access()
def delete_report(report_id):
    report = Report.query.get_or_404(report_id)
    
    if not (current_user.is_admin or current_user.is_super_admin) and report.coach_id != current_user.id:
        return jsonify({'error': 'Permission denied'}), 403

    try:
        db.session.delete(report)
        db.session.commit()
        return jsonify({'message': 'Report deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500



@main.route('/profile')
@login_required
@verify_club_access()
def profile_page():
    """Serve the profile page"""
    return render_template('pages/profile.html')

@main.route('/api/profile')
@login_required
@verify_club_access()
def get_profile():
    """Get the current user's basic profile information"""
    try:
        user_data = {
            'id': current_user.id,
            'email': current_user.email,
            'name': current_user.name,
            'role': current_user.role.value,
            'tennis_club': {
                'id': current_user.tennis_club_id,
                'name': current_user.tennis_club.name if current_user.tennis_club else None
            }
        }
        
        # Include coach details if they exist
        if current_user.coach_details:
            user_data['coach_details'] = {
                'contact_number': current_user.coach_details.contact_number,
                'emergency_contact_name': current_user.coach_details.emergency_contact_name,
                'emergency_contact_number': current_user.coach_details.emergency_contact_number
            }
            
        return jsonify(user_data)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching profile: {str(e)}")
        return jsonify({'error': 'Failed to fetch profile data'}), 500

@main.route('/api/profile/details', methods=['PUT'])
@login_required
@verify_club_access()
def update_profile_details():
    """Update the current user's coach details"""
    try:
        data = request.get_json()
        
        # Get or create coach details
        coach_details = current_user.coach_details
        if not coach_details:
            coach_details = CoachDetails(
                user_id=current_user.id,
                tennis_club_id=current_user.tennis_club_id
            )
            db.session.add(coach_details)
        
        # Update fields
        coach_details.contact_number = data.get('contact_number')
        coach_details.emergency_contact_name = data.get('emergency_contact_name')
        coach_details.emergency_contact_number = data.get('emergency_contact_number')
        
        db.session.commit()
        
        return jsonify({
            'contact_number': coach_details.contact_number,
            'emergency_contact_name': coach_details.emergency_contact_name,
            'emergency_contact_number': coach_details.emergency_contact_number
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating profile: {str(e)}")
        return jsonify({'error': 'Failed to update profile'}), 500

@main.route('/lta-accreditation')
@login_required
@admin_required
def lta_accreditation():
    return render_template('pages/lta_accreditation.html')    

@main.route('/api/coaches/accreditations')
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

@main.route('/api/coaches/send-reminders', methods=['POST'])
@login_required
@admin_required
def send_accreditation_reminders():
    club_id = current_user.tennis_club_id
    coaches = User.query.filter_by(tennis_club_id=club_id, role=UserRole.COACH).all()
    
    email_service = EmailService()
    sent_count = 0
    errors = []
    
    for coach in coaches:
        if not coach.coach_details:
            continue
            
        expiring_accreditations = []
        details = coach.coach_details
        
        # Check each accreditation
        if details.dbs_expiry:
            days = (details.dbs_expiry - datetime.now(timezone.utc)).days
            if days <= 90:
                expiring_accreditations.append(('DBS Check', days))
                
        # Add similar checks for other accreditations...
        
        if expiring_accreditations:
            try:
                email_service.send_accreditation_reminder(
                    coach.email,
                    coach.name,
                    expiring_accreditations
                )
                sent_count += 1
            except Exception as e:
                errors.append(f"Failed to send reminder to {coach.email}: {str(e)}")
    
    return jsonify({
        'success': True,
        'reminders_sent': sent_count,
        'errors': errors
    })

@main.route('/api/report-templates', methods=['GET', 'POST'])
@login_required
@admin_required
def manage_templates():
    if request.method == 'POST':
        data = request.get_json()
        try:
            template = ReportTemplate(
                name=data['name'],
                description=data.get('description'),
                tennis_club_id=current_user.tennis_club_id,
                created_by_id=current_user.id,
                is_active=True
            )
            
            # Add sections and fields
            for section_data in data['sections']:
                section = TemplateSection(
                    name=section_data['name'],
                    order=section_data['order']
                )
                
                for field_data in section_data['fields']:
                    field = TemplateField(
                        name=field_data['name'],
                        description=field_data.get('description'),
                        field_type=FieldType[field_data['fieldType'].upper()],
                        is_required=field_data['isRequired'],
                        order=field_data['order'],
                        options=field_data.get('options')
                    )
                    section.fields.append(field)
                
                template.sections.append(section)
            
            # Handle group assignments
            if 'assignedGroups' in data:
                for group_data in data['assignedGroups']:
                    group_assoc = GroupTemplate(
                        group_id=group_data['id'],
                        is_active=True
                    )
                    template.group_associations.append(group_assoc)
            
            db.session.add(template)
            db.session.commit()
            
            return jsonify({
                'id': template.id,
                'message': 'Template created successfully'
            })
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error creating template: {str(e)}")
            return jsonify({'error': str(e)}), 400
    
    # GET - Return all templates with their group assignments
    templates = ReportTemplate.query.filter_by(
        tennis_club_id=current_user.tennis_club_id,
        is_active=True
    ).all()
    
    return jsonify([{
        'id': t.id,
        'name': t.name,
        'description': t.description,
        'assignedGroups': [{
            'id': assoc.group.id,
            'name': assoc.group.name
        } for assoc in t.group_associations if assoc.is_active],
        'sections': [{
            'id': s.id,
            'name': s.name,
            'order': s.order,
            'fields': [{
                'id': f.id,
                'name': f.name,
                'description': f.description,
                'fieldType': f.field_type.value,
                'isRequired': f.is_required,
                'order': f.order,
                'options': f.options
            } for f in s.fields]
        } for s in t.sections]
    } for t in templates])

@main.route('/api/report-templates/<int:template_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required
@admin_required
def manage_template(template_id):
    template = ReportTemplate.query.filter_by(
        id=template_id,
        tennis_club_id=current_user.tennis_club_id
    ).first_or_404()
    
    if request.method == 'PUT':
        data = request.get_json()
        try:
            template.name = data['name']
            template.description = data.get('description')
            
            # Update sections and fields
            template.sections = []  # Remove old sections
            
            for section_data in data['sections']:
                section = TemplateSection(
                    name=section_data['name'],
                    order=section_data['order']
                )
                
                for field_data in section_data['fields']:
                    field = TemplateField(
                        name=field_data['name'],
                        description=field_data.get('description'),
                        field_type=FieldType[field_data['fieldType'].upper()],
                        is_required=field_data['isRequired'],
                        order=field_data['order'],
                        options=field_data.get('options')
                    )
                    section.fields.append(field)
                
                template.sections.append(section)
            
            # Update group assignments
            # First deactivate all existing assignments
            for assoc in template.group_associations:
                assoc.is_active = False
            
            # Then create new assignments or reactivate existing ones
            if 'assignedGroups' in data:
                assigned_group_ids = [g['id'] for g in data['assignedGroups']]
                for group_id in assigned_group_ids:
                    existing_assoc = GroupTemplate.query.filter_by(
                        template_id=template.id,
                        group_id=group_id
                    ).first()
                    
                    if existing_assoc:
                        existing_assoc.is_active = True
                    else:
                        new_assoc = GroupTemplate(
                            template_id=template.id,
                            group_id=group_id,
                            is_active=True
                        )
                        db.session.add(new_assoc)
            
            db.session.commit()
            return jsonify({'message': 'Template updated successfully'})
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error updating template: {str(e)}")
            return jsonify({'error': str(e)}), 400
    
    elif request.method == 'DELETE':
        template.is_active = False
        db.session.commit()
        return jsonify({'message': 'Template deactivated successfully'})
    
    # GET - Return single template with group assignments
    return jsonify({
        'id': template.id,
        'name': template.name,
        'description': template.description,
        'assignedGroups': [{
            'id': assoc.group.id,
            'name': assoc.group.name
        } for assoc in template.group_associations if assoc.is_active],
        'sections': [{
            'id': s.id,
            'name': s.name,
            'order': s.order,
            'fields': [{
                'id': f.id,
                'name': f.name,
                'description': f.description,
                'fieldType': f.field_type.value,
                'isRequired': f.is_required,
                'order': f.order,
                'options': f.options
            } for f in s.fields]
        } for s in template.sections]
    })

@main.route('/api/groups')
@login_required
@verify_club_access()
def get_groups():
    """Get all tennis groups for the current user's tennis club"""
    try:
        groups = TennisGroup.query.filter_by(
            tennis_club_id=current_user.tennis_club_id
        ).order_by(TennisGroup.name).all()
        
        return jsonify([{
            'id': group.id,
            'name': group.name,
            'description': group.description,
            'currentTemplate': {
                'id': assoc.template.id,
                'name': assoc.template.name
            } if (assoc := group.template_associations and 
                  group.template_associations[0] if group.template_associations else None) 
            else None
        } for group in groups])
        
    except Exception as e:
        current_app.logger.error(f"Error fetching groups: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': 'Failed to fetch tennis groups'}), 500

@main.route('/clubs/manage/<int:club_id>/report-templates')
@login_required
@admin_required
def manage_report_templates(club_id):
    if club_id != current_user.tennis_club_id:
        flash('Unauthorized access', 'error')
        return redirect(url_for('main.home'))
    return render_template('pages/report_templates.html')

@main.route('/api/templates/group-assignments', methods=['GET', 'POST', 'DELETE'])
@login_required
@verify_club_access()
def manage_group_templates():
    if request.method == 'POST':
        try:
            data = request.get_json()
            template_id = data.get('template_id')
            group_id = data.get('group_id')
            
            if not template_id or not group_id:
                return jsonify({'error': 'Template ID and Group ID are required'}), 400
            
            # Verify group and template belong to user's tennis club
            group = TennisGroup.query.filter_by(
                id=group_id, 
                tennis_club_id=current_user.tennis_club_id
            ).first_or_404()
            
            template = ReportTemplate.query.filter_by(
                id=template_id, 
                tennis_club_id=current_user.tennis_club_id
            ).first_or_404()
            
            # Check if group already has an active template
            existing_assoc = GroupTemplate.query.filter_by(
                group_id=group_id,
                is_active=True
            ).first()
            
            if existing_assoc:
                return jsonify({
                    'error': 'This group already has an active template assigned. Please unassign the current template first.'
                }), 400
            
            # Create new association
            new_assoc = GroupTemplate(
                group_id=group_id,
                template_id=template_id,
                is_active=True
            )
            db.session.add(new_assoc)
            db.session.commit()
            
            # Return updated assignments
            assignments = GroupTemplate.query.join(TennisGroup).filter(
                TennisGroup.tennis_club_id == current_user.tennis_club_id,
                GroupTemplate.is_active == True
            ).all()
            
            return jsonify({
                'message': 'Template assigned successfully',
                'assignments': [{
                    'group_id': a.group_id,
                    'template_id': a.template_id,
                    'group_name': a.group.name,
                    'template_name': a.template.name
                } for a in assignments]
            })
            
        except Exception as e:
            db.session.rollback()
            print(f"Error assigning template to group: {str(e)}")
            print(traceback.format_exc())
            return jsonify({'error': str(e)}), 500
            
    elif request.method == 'DELETE':
        try:
            group_id = request.args.get('group_id')
            if not group_id:
                return jsonify({'error': 'Group ID is required'}), 400
            
            # Verify group belongs to user's tennis club
            group = TennisGroup.query.filter_by(
                id=group_id, 
                tennis_club_id=current_user.tennis_club_id
            ).first_or_404()
            
            # Find and deactivate the assignment
            assignment = GroupTemplate.query.filter_by(
                group_id=group_id,
                is_active=True
            ).first()
            
            if not assignment:
                return jsonify({'error': 'No active template assignment found for this group'}), 404
            
            assignment.is_active = False
            db.session.commit()
            
            return jsonify({
                'message': 'Template unassigned successfully',
                'group_id': group_id
            })
            
        except Exception as e:
            db.session.rollback()
            print(f"Error unassigning template: {str(e)}")
            print(traceback.format_exc())
            return jsonify({'error': str(e)}), 500
    
    # GET - Return all group-template assignments
    try:
        assignments = GroupTemplate.query.join(TennisGroup).filter(
            TennisGroup.tennis_club_id == current_user.tennis_club_id,
            GroupTemplate.is_active == True
        ).all()
        
        return jsonify([{
            'groupId': a.group_id,
            'templateId': a.template_id,
            'group_name': a.group.name,
            'template_name': a.template.name
        } for a in assignments])
        
    except Exception as e:
        current_app.logger.error(f"Error fetching group templates: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@main.route('/report/new/<int:player_id>')
@login_required
def new_report(player_id):
    player = ProgrammePlayers.query.get_or_404(player_id)
    
    if not current_user.is_admin and player.coach_id != current_user.id:
        flash('You do not have permission to create a report for this player', 'error')
        return redirect(url_for('main.dashboard'))

    template = (ReportTemplate.query
        .join(GroupTemplate)
        .filter(
            GroupTemplate.group_id == player.group_id,
            GroupTemplate.is_active == True,
            ReportTemplate.is_active == True
        ).first())
    
    if not template:
        flash('No active template found for this group', 'error')
        return redirect(url_for('main.dashboard'))

    return render_template('pages/create_report.html', 
                         player_id=player_id,
                         student_name=player.student.name,
                         group_name=player.tennis_group.name)

@main.route('/api/reports/create/<int:player_id>', methods=['POST'])
@login_required
def submit_report(player_id):
    """Create a new report"""
    player = ProgrammePlayers.query.get_or_404(player_id)
    
    # Permission check
    if not current_user.is_admin and player.coach_id != current_user.id:
        return jsonify({'error': 'Permission denied'}), 403
        
    try:
        data = request.get_json()
        
        # Extract and validate recommendedGroupId
        recommended_group_id = data.get('recommendedGroupId')
        
        if not recommended_group_id:
            return jsonify({'error': 'Recommended group is required'}), 400

        # Validate that the recommended group exists and belongs to the same club
        recommended_group = TennisGroup.query.filter_by(
            id=recommended_group_id,
            tennis_club_id=player.tennis_club_id
        ).first()
        
        if not recommended_group:
            return jsonify({'error': 'Invalid recommended group'}), 400

        # Create report with simplified content structure
        report = Report(
            student_id=player.student_id,
            coach_id=current_user.id,
            group_id=player.group_id,
            teaching_period_id=player.teaching_period_id,
            programme_player_id=player.id,
            template_id=data['template_id'],
            content=data['content'],  # Just the section data
            recommended_group_id=recommended_group_id,
            date=datetime.utcnow()
        )
        
        player.report_submitted = True
        db.session.add(report)
        db.session.commit()
        
        return jsonify({
            'message': 'Report submitted successfully',
            'report_id': report.id
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error submitting report: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 400


def calculate_age(birth_date):
    """
    Calculate age accurately from date of birth, accounting for leap years and exact dates
    """
    if not birth_date:
        return None
        
    today = datetime.now()
    
    # Calculate age
    age = today.year - birth_date.year
    
    # Adjust age based on month and day
    if (today.month, today.day) < (birth_date.month, birth_date.day):
        age -= 1
        
    return age

@main.route('/api/reports/template/<int:player_id>', methods=['GET'])
@login_required
def get_report_template(player_id):
    player = ProgrammePlayers.query.get_or_404(player_id)
    
    # Permission check
    if not (current_user.is_admin or current_user.is_super_admin) and player.coach_id != current_user.id:
        return jsonify({'error': 'Permission denied'}), 403

    # Get template for the group
    template = (ReportTemplate.query
        .join(GroupTemplate)
        .filter(
            GroupTemplate.group_id == player.group_id,
            GroupTemplate.is_active == True,
            ReportTemplate.is_active == True
        ).first())
    
    if not template:
        return jsonify({'error': 'No template found'}), 404

    # Calculate age from date of birth
    age = calculate_age(player.student.date_of_birth)

    return jsonify({
        'template': {
            'id': template.id,
            'name': template.name,
            'description': template.description,
            'sections': [{
                'id': s.id,
                'name': s.name,
                'order': s.order,
                'fields': [{
                    'id': f.id,
                    'name': f.name,
                    'description': f.description,
                    'fieldType': f.field_type.value,
                    'isRequired': f.is_required,
                    'order': f.order,
                    'options': f.options
                } for f in s.fields]
            } for s in template.sections]
        },
        'player': {
            'id': player.id,
            'studentName': player.student.name,
            'dateOfBirth': player.student.date_of_birth.isoformat() if player.student.date_of_birth else None,
            'age': age,
            'groupName': player.tennis_group.name
        }
    })

@main.route('/api/reports/print-all/<int:period_id>', methods=['GET'])
@login_required
@admin_required
def print_all_reports(period_id):
    """Generate a single PDF containing all reports for a teaching period"""
    try:
        # Verify period belongs to user's tennis club
        period = TeachingPeriod.query.filter_by(
            id=period_id,
            tennis_club_id=current_user.tennis_club_id
        ).first_or_404()
        
        # Get the club name and set up directories
        club_name = current_user.tennis_club.name
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        instance_dir = os.path.join(base_dir, 'app', 'instance', 'reports')
        
        # Create period-specific directory path
        period_name = period.name.replace(' ', '_').lower()
        period_dir = os.path.join(instance_dir, f'reports-{period_name}')
        
        # Clear existing reports directory if it exists
        if os.path.exists(period_dir):
            shutil.rmtree(period_dir)
        
        # Create fresh directory
        os.makedirs(instance_dir, exist_ok=True)
        
        # Choose generator based on club name
        if 'wilton' in club_name.lower():
            from app.utils.wilton_report_generator import EnhancedWiltonReportGenerator
            
            config_path = os.path.join(base_dir, 'app', 'utils', 'wilton_group_config.json')
            generator = EnhancedWiltonReportGenerator(config_path)
            result = generator.batch_generate_reports(period_id)
            
            # Get the period-specific directory
            reports_dir = period_dir
        else:
            from app.utils.report_generator import batch_generate_reports
            result = batch_generate_reports(period_id)
            reports_dir = result.get('output_directory')
        
        if result.get('success', 0) == 0:
            current_app.logger.error(f"No reports generated. Details: {result.get('error_details', [])}")
            return jsonify({
                'error': 'No reports were generated',
                'details': result.get('error_details', [])
            }), 400
        
        # Verify the reports directory exists
        if not os.path.exists(reports_dir):
            current_app.logger.error(f"Reports directory not found at: {reports_dir}")
            return jsonify({'error': 'No reports were found after generation'}), 500
        
        # Get list of PDFs and merge them
        pdf_files = []
        for root, _, files in os.walk(reports_dir):
            for file in sorted(files):
                if file.endswith('.pdf'):
                    file_path = os.path.join(root, file)
                    pdf_files.append(file_path)
        
        if not pdf_files:
            return jsonify({'error': 'No PDF reports were found'}), 404
        
        # Merge PDFs
        from PyPDF2 import PdfMerger
        merger = PdfMerger()
        
        for pdf_file in pdf_files:
            merger.append(pdf_file)
        
        # Create the combined PDF in memory
        output = BytesIO()
        merger.write(output)
        output.seek(0)
        
        # Format filename
        formatted_club = club_name.lower().replace(' ', '_')
        formatted_term = period.name.lower().replace(' ', '_')
        filename = f"combined_reports_{formatted_club}_{formatted_term}.pdf"
        
        response = send_file(
            output,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=filename
        )
        
        # Add cache control headers
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        
        return response
        
    except Exception as e:
        current_app.logger.error(f"Error generating reports: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
    

##########################
## Emailing
##########################

@main.route('/api/reports/email-status/<int:period_id>')
@login_required
@admin_required
def get_email_status(period_id):
    """Get email status for all reports in a teaching period"""
    try:
        from sqlalchemy.orm import aliased

        # Create aliases for TennisGroup
        CurrentGroup = aliased(TennisGroup)
        RecommendedGroup = aliased(TennisGroup)

        # Verify period belongs to user's club
        period = TeachingPeriod.query.filter_by(
            id=period_id,
            tennis_club_id=current_user.tennis_club_id
        ).first_or_404()

        # Get reports with all necessary relationships loaded
        reports = (Report.query
            .join(Student)
            .join(ProgrammePlayers)
            .join(CurrentGroup, ProgrammePlayers.group_id == CurrentGroup.id)
            .join(User, Report.coach_id == User.id)
            .outerjoin(RecommendedGroup, Report.recommended_group_id == RecommendedGroup.id)
            .filter(
                Report.teaching_period_id == period_id,
                ProgrammePlayers.tennis_club_id == current_user.tennis_club_id
            )
            .all())

        report_data = [{
            'student_name': report.student.name,
            'contact_email': report.student.contact_email,
            'report_id': report.id,
            'email_sent': report.email_sent,
            'email_sent_at': report.email_sent_at.isoformat() if report.email_sent_at else None,
            'last_email_status': report.last_email_status,
            'email_attempts': report.email_attempts,
            'group_name': report.tennis_group.name,
            'recommended_group': report.recommended_group.name if report.recommended_group else '',
            'booking_date': period.next_period_start_date.isoformat() if period.next_period_start_date else None,
            'coach_name': report.coach.name,
            'term_name': period.name,
            'tennis_club': report.programme_player.tennis_club.name
        } for report in reports]

        return jsonify({
            'reports': report_data,
            'total_reports': len(reports)
        })

    except Exception as e:
        current_app.logger.error(f"Error getting email status: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
    
@main.route('/api/reports/send-email/<int:report_id>', methods=['POST'])
@login_required
@admin_required
def send_report_email(report_id):
    """Send a single report email"""
    try:
        report = Report.query.get_or_404(report_id)
        
        # Check permissions through student's tennis club
        if report.student.tennis_club_id != current_user.tennis_club_id:
            return jsonify({'error': 'Unauthorized'}), 403

        # Individual email check - only checks for contact email
        can_send, reason = report.can_send_email(is_bulk_send=False)
        if not can_send:
            return jsonify({'error': reason}), 400

        # Get email content from request
        data = request.get_json()
        subject = data.get('subject')
        message = data.get('message')

        # Send email with custom template
        email_service = EmailService()
        success, message, message_id = email_service.send_report(
            report=report,
            subject=subject,
            message=message
        )

        if success:
            return jsonify({
                'message': 'Email sent successfully',
                'message_id': message_id,
                'email_sent_at': report.email_sent_at.isoformat() if report.email_sent_at else None,
                'last_email_status': report.last_email_status,
                'email_attempts': report.email_attempts
            })
        else:
            return jsonify({'error': message}), 500

    except Exception as e:
        current_app.logger.error(f"Error sending email: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

def handle_bulk_email_send(reports, subject, message):
    """Handle bulk email sending with restrictions"""
    try:
        email_service = EmailService()
        results = {
            'success': 0,
            'errors': 0,
            'skipped': 0,
            'details': []
        }

        for report in reports:
            # Check with bulk send restrictions
            can_send, reason = report.can_send_email(is_bulk_send=True)
            if not can_send:
                # Skip if already sent
                if "already been sent" in reason:
                    continue
                
                # Record other issues
                results['skipped'] += 1
                results['details'].append({
                    'student': report.student.name,
                    'error': reason
                })
                continue

            success, msg, _ = email_service.send_report(
                report=report,
                subject=subject,
                message=message
            )

            if success:
                results['success'] += 1
            else:
                if 'not verified' in msg.lower():
                    results['skipped'] += 1
                else:
                    results['errors'] += 1
                results['details'].append({
                    'student': report.student.name,
                    'error': msg
                })

        return results

    except Exception as e:
        current_app.logger.error(f"Error in bulk email send: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        raise
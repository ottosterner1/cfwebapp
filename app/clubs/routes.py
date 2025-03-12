import os
import boto3
from flask import Blueprint, app, jsonify, request, render_template, flash, redirect, url_for, session, make_response, current_app
from sqlalchemy import case
from app import db
from app.models import TennisClub, User, TennisGroup, TeachingPeriod, UserRole, Student, ProgrammePlayers, CoachDetails, CoachQualification, CoachRole, CoachInvitation, DayOfWeek, TennisGroupTimes
from datetime import datetime, timedelta
from flask_login import login_required, current_user, login_user
import traceback
import pandas as pd 
from werkzeug.utils import secure_filename 
from datetime import datetime 
from app.utils.auth import admin_required
from sqlalchemy.exc import SQLAlchemyError
from datetime import datetime, timezone
import pytz
import json

from app.services.email_service import EmailService
import secrets 
from app.utils.s3 import upload_file_to_s3, allowed_file

# Get UK timezone
uk_timezone = pytz.timezone('Europe/London')

club_management = Blueprint('club_management', __name__, url_prefix='/clubs') 

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'csv'}

# Add this helper function
def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@club_management.context_processor
def utility_processor():
   from app.models import UserRole
   return {'UserRole': UserRole}

def setup_default_groups(club_id):
   groups = [
       {"name": "Beginners", "description": "New players learning basics"},
       {"name": "Intermediate", "description": "Players developing core skills"},
       {"name": "Advanced", "description": "Competitive players"}
   ]
   for group in groups:
       db.session.add(TennisGroup(tennis_club_id=club_id, **group))

def setup_initial_teaching_period(club_id):
   start_date = datetime.now()
   db.session.add(TeachingPeriod(
       tennis_club_id=club_id,
       name=f"Teaching Period {start_date.strftime('%B %Y')}",
       start_date=start_date, 
       end_date=start_date + timedelta(weeks=12)
   ))
@club_management.route('/onboard', methods=['GET', 'POST'])
def onboard_club():
    # Check if we have temporary user info
    temp_user_info = session.get('temp_user_info')
    if not temp_user_info:
        flash('Please login first', 'error')
        return redirect(url_for('main.login'))

    if request.method == 'GET':
        return render_template('admin/club_onboarding.html', 
                             email=temp_user_info.get('email'),
                             name=temp_user_info.get('name'))

    try:
        # Create new tennis club
        club = TennisClub(
            name=request.form['club_name'],
            subdomain=request.form['subdomain']
        )
        db.session.add(club)
        db.session.flush()  # Get club ID

        # Create admin user using the Google auth info
        admin = User(
            email=temp_user_info['email'],
            username=f"admin_{request.form['subdomain']}",
            name=temp_user_info['name'],
            role=UserRole.ADMIN,
            tennis_club_id=club.id,
            auth_provider='google',
            auth_provider_id=temp_user_info['provider_id'],
            is_active=True
        )
        db.session.add(admin)
        db.session.commit()
        
        # Log the user in and clear session
        login_user(admin)
        session.pop('temp_user_info', None)
        
        flash('Tennis club created successfully! Please set up your teaching periods and groups.', 'success')
        return redirect(url_for('main.home'))
        
    except Exception as e:
        db.session.rollback()
        print(f"Error creating club: {str(e)}")
        print(traceback.format_exc())
        flash(f'Error creating club: {str(e)}', 'error')
        return redirect(url_for('club_management.onboard_club'))

@club_management.route('/manage/<int:club_id>/club', methods=['GET', 'POST'])
@login_required
def manage_club(club_id):
   
   club = TennisClub.query.get_or_404(club_id)
   
   if not current_user.is_admin and not current_user.is_super_admin:
       print(f"Access denied: User {current_user.id} is not an admin")
       flash('You must be an admin to manage club settings', 'error')
       return redirect(url_for('main.home'))
       
   if current_user.tennis_club_id != club.id:
       print(f"Access denied: User's club {current_user.tennis_club_id} doesn't match requested club {club.id}")
       flash('You can only manage your own tennis club', 'error')
       return redirect(url_for('main.home'))
   
   if request.method == 'POST':
       club.name = request.form['name']
       club.subdomain = request.form['subdomain']
       
       try:
           db.session.commit()
           flash('Club details updated successfully', 'success')
           return redirect(url_for('main.home'))
       except Exception as e:
           db.session.rollback()
           flash(f'Error updating club: {str(e)}', 'error')
           
   return render_template('admin/manage_club.html', club=club)

@club_management.route('/manage/<int:club_id>/teaching-periods', methods=['GET', 'POST'])
@login_required
def manage_teaching_periods(club_id):
    
    club = TennisClub.query.get_or_404(club_id)
    
    if not current_user.is_admin and not current_user.is_super_admin:
        flash('You must be an admin to manage teaching periods', 'error')
        return redirect(url_for('main.home'))
        
    if current_user.tennis_club_id != club.id:
        flash('You can only manage teaching periods for your own tennis club', 'error')
        return redirect(url_for('main.home'))
    
    if request.method == 'POST':
        action = request.form.get('action')
        
        try:
            if action == 'add_period':
                # Handle adding new period
                name = request.form['name']
                start_date = datetime.strptime(request.form['start_date'], '%Y-%m-%d')
                end_date = datetime.strptime(request.form['end_date'], '%Y-%m-%d')
                
                # Get optional dates
                next_period_start = request.form.get('next_period_start_date')
                bookings_open = request.form.get('bookings_open_date')
                
                if start_date > end_date:
                    flash('Start date must be before end date', 'error')
                else:
                    period = TeachingPeriod(
                        name=name,
                        start_date=start_date,
                        end_date=end_date,
                        next_period_start_date=datetime.strptime(next_period_start, '%Y-%m-%d') if next_period_start else None,
                        bookings_open_date=datetime.strptime(bookings_open, '%Y-%m-%d') if bookings_open else None,
                        tennis_club_id=club.id
                    )
                    db.session.add(period)
                    db.session.commit()
                    flash('Teaching period created successfully', 'success')

            elif action == 'edit_period':
                # Handle editing period
                period_id = request.form.get('period_id')
                period = TeachingPeriod.query.get_or_404(period_id)
                
                period.name = request.form['name']
                period.start_date = datetime.strptime(request.form['start_date'], '%Y-%m-%d')
                period.end_date = datetime.strptime(request.form['end_date'], '%Y-%m-%d')
                
                # Handle optional dates
                next_period_start = request.form.get('next_period_start_date')
                bookings_open = request.form.get('bookings_open_date')
                
                period.next_period_start_date = (
                    datetime.strptime(next_period_start, '%Y-%m-%d') 
                    if next_period_start else None
                )
                period.bookings_open_date = (
                    datetime.strptime(bookings_open, '%Y-%m-%d')
                    if bookings_open else None
                )
                
                if period.start_date > period.end_date:
                    flash('Start date must be before end date', 'error')
                else:
                    db.session.commit()
                    flash('Teaching period updated successfully', 'success')

            elif action == 'delete_period':
                # Handle deleting period
                period_id = request.form.get('period_id')
                period = TeachingPeriod.query.get_or_404(period_id)
                
                if period.reports.count() > 0:
                    flash('Cannot delete teaching period with existing reports', 'error')
                else:
                    db.session.delete(period)
                    db.session.commit()
                    flash('Teaching period deleted successfully', 'success')
                    
        except Exception as e:
            db.session.rollback()
            print(traceback.format_exc())
            flash(f'Error managing teaching period: {str(e)}', 'error')

        return redirect(url_for('club_management.manage_teaching_periods', club_id=club.id))
    
    teaching_periods = TeachingPeriod.query.filter_by(
        tennis_club_id=club.id
    ).order_by(TeachingPeriod.start_date.desc()).all()
    
    return render_template('admin/manage_teaching_periods.html', 
                         club=club, 
                         teaching_periods=teaching_periods)

@club_management.route('/onboard-coach', methods=['GET', 'POST'])
def onboard_coach():
    temp_user_info = session.get('temp_user_info')
   
    if request.method == 'POST':
        club_id = request.form.get('club_id')
       
        if not club_id:
            flash('Please select a tennis club', 'error')
            return redirect(url_for('club_management.onboard_coach'))
           
        club = TennisClub.query.get(club_id)
       
        if not club:
            flash('Invalid tennis club selected', 'error')
            return redirect(url_for('club_management.onboard_coach'))
       
        try:
            if temp_user_info:
                user = User.query.filter_by(email=temp_user_info['email']).first()
                if not user:
                    # Generate a unique username
                    base_username = f"coach_{temp_user_info['email'].split('@')[0]}"
                    username = base_username
                    counter = 1
                    
                    # Keep checking until we find a unique username
                    while User.query.filter_by(username=username).first():
                        username = f"{base_username}_{counter}"
                        counter += 1
                    
                    user = User(
                        email=temp_user_info['email'],
                        username=username,  # Use the unique username
                        name=temp_user_info['name'],
                        role=UserRole.COACH,
                        auth_provider='google',
                        auth_provider_id=temp_user_info['provider_id'],
                        is_active=True,
                        tennis_club_id=club.id
                    )
                    db.session.add(user)
                else:
                    user.tennis_club_id = club.id
                    user.auth_provider = 'google'
                    user.auth_provider_id = temp_user_info['provider_id']
               
                db.session.commit()
                login_user(user)
                session.pop('temp_user_info', None)
               
                flash('Welcome to your tennis club!', 'success')
                return redirect(url_for('main.home'))
            else:
                flash('User information not found. Please try logging in again.', 'error')
                return redirect(url_for('main.login'))
               
        except Exception as e:
            db.session.rollback()
            print(f"Error in onboarding: {str(e)}")
            flash('An error occurred during onboarding', 'error')
            return redirect(url_for('club_management.onboard_coach'))
   
    clubs = TennisClub.query.all()
    return render_template('admin/coach_onboarding.html', clubs=clubs)

def parse_date(date_str):
    """Parse date from either YYYY-MM-DD or DD-MMM-YYYY format"""
    print(f"Attempting to parse date: '{date_str}'")
    print(date_str)
    
    # Return None for empty strings or None values
    if not date_str or date_str.strip() == '':
        return None

    try:
        # First try YYYY-MM-DD format (HTML5 date input)
        try:
            parsed_date = datetime.strptime(date_str.strip(), '%Y-%m-%d').date()
            print(f"Successfully parsed date (YYYY-MM-DD): {parsed_date}")
            return parsed_date
        except ValueError:
            # If that fails, try DD-MMM-YYYY format
            date_str = date_str.strip()
            day, month, year = date_str.split('-')
            
            # Ensure month is properly capitalized
            month = month.capitalize()
            
            # Reconstruct date string in proper format
            formatted_date_str = f"{day}-{month}-{year}"
            
            # Parse using strptime
            parsed_date = datetime.strptime(formatted_date_str, '%d-%b-%Y').date()
            print(f"Successfully parsed date (DD-MMM-YYYY): {parsed_date}")
            return parsed_date
            
    except ValueError as e:
        print(f"Date parsing failed: {str(e)}")
        raise ValueError(f"Invalid date format for '{date_str}'. Use either YYYY-MM-DD or DD-MMM-YYYY format (e.g., 2024-12-25 or 25-Dec-2024)")

@club_management.route('/manage/<int:club_id>/groups', methods=['GET', 'POST'])
@login_required
@admin_required
def manage_groups(club_id):
    try:
        club = TennisClub.query.get_or_404(club_id)

        if current_user.tennis_club_id != club.id:
            flash('You can only manage groups in your own tennis club', 'error')
            return redirect(url_for('main.home'))

        if request.method == 'POST':
            action = request.form.get('action')
            
            if action == 'add_group':
                group_name = request.form.get('group_name', '').strip()
                group_description = request.form.get('group_description', '').strip()
                
                if not group_name:
                    flash('Group name is required', 'error')
                    return redirect(url_for('club_management.manage_groups', club_id=club_id))

                existing_group = TennisGroup.query.filter_by(
                    tennis_club_id=club.id, 
                    name=group_name
                ).first()
                
                if existing_group:
                    flash('A group with this name already exists', 'error')
                else:
                    try:
                        new_group = TennisGroup(
                            name=group_name,
                            description=group_description,
                            tennis_club_id=club.id
                        )
                        db.session.add(new_group)
                        db.session.commit()
                        flash('New group added successfully', 'success')
                    except SQLAlchemyError as e:
                        db.session.rollback()
                        flash(f'Error adding group: {str(e)}', 'error')
                    
            elif action == 'edit_group':
                group_id = request.form.get('group_id')
                group_name = request.form.get('group_name', '').strip()
                group_description = request.form.get('group_description', '').strip()

                if not group_name:
                    flash('Group name is required', 'error')
                    return redirect(url_for('club_management.manage_groups', club_id=club_id))

                group = TennisGroup.query.get_or_404(group_id)
                
                # Check if the group belongs to this club
                if group.tennis_club_id != club.id:
                    flash('You do not have permission to edit this group', 'error')
                    return redirect(url_for('club_management.manage_groups', club_id=club_id))

                # Check if name already exists for another group
                existing_group = TennisGroup.query.filter(
                    TennisGroup.tennis_club_id == club.id,
                    TennisGroup.name == group_name,
                    TennisGroup.id != group_id
                ).first()

                if existing_group:
                    flash('A group with this name already exists', 'error')
                else:
                    try:
                        group.name = group_name
                        group.description = group_description
                        db.session.commit()
                        flash('Group updated successfully', 'success')
                    except SQLAlchemyError as e:
                        db.session.rollback()
                        flash(f'Error updating group: {str(e)}', 'error')

            elif action == 'delete_group':
                group_id = request.form.get('group_id')
                group = TennisGroup.query.get_or_404(group_id)

                # Check if the group belongs to this club
                if group.tennis_club_id != club.id:
                    flash('You do not have permission to delete this group', 'error')
                    return redirect(url_for('club_management.manage_groups', club_id=club_id))

                # Check if the group has any players assigned to it
                if group.programme_players.count() > 0:
                    flash('Cannot delete group with players assigned to it', 'error')
                else:
                    try:
                        db.session.delete(group)
                        db.session.commit()
                        flash('Group deleted successfully', 'success')
                    except SQLAlchemyError as e:
                        db.session.rollback()
                        flash(f'Error deleting group: {str(e)}', 'error')

            elif action == 'add_time':
                group_id = request.form.get('group_id')
                day = request.form.get('day_of_week')
                start_time = request.form.get('start_time')
                end_time = request.form.get('end_time')
                capacity = request.form.get('capacity', type=int)  # Will be None if not provided

                if not all([group_id, day, start_time, end_time]):
                    flash('All time fields are required', 'error')
                    return redirect(url_for('club_management.manage_groups', club_id=club_id))

                try:
                    # Parse times
                    start_time = datetime.strptime(start_time, '%H:%M').time()
                    end_time = datetime.strptime(end_time, '%H:%M').time()

                    # Validate end time is after start time
                    if start_time >= end_time:
                        flash('End time must be after start time', 'error')
                        return redirect(url_for('club_management.manage_groups', club_id=club_id))

                    # Validate capacity if provided
                    if capacity is not None and capacity < 1:
                        flash('Capacity must be at least 1 if specified', 'error')
                        return redirect(url_for('club_management.manage_groups', club_id=club_id))

                    # Create new time slot
                    time_slot = TennisGroupTimes(
                        group_id=group_id,
                        day_of_week=DayOfWeek[day.upper()],
                        start_time=start_time,
                        end_time=end_time,
                        capacity=capacity,  # Can be None
                        tennis_club_id=club.id
                    )
                    db.session.add(time_slot)
                    db.session.commit()
                    flash('Time slot added successfully', 'success')
                except ValueError as e:
                    flash('Invalid time format', 'error')
                except SQLAlchemyError as e:
                    db.session.rollback()
                    flash(f'Error adding time slot: {str(e)}', 'error')
                
                return redirect(url_for('club_management.manage_groups', club_id=club_id))

            elif action == 'edit_time':
                time_id = request.form.get('time_id')
                day = request.form.get('day_of_week')
                start_time = request.form.get('start_time')
                end_time = request.form.get('end_time')
                capacity = request.form.get('capacity', type=int)

                if not all([time_id, day, start_time, end_time]):
                    flash('All time fields are required', 'error')
                    return redirect(url_for('club_management.manage_groups', club_id=club_id))

                time_slot = TennisGroupTimes.query.get_or_404(time_id)

                # Verify club ownership
                if time_slot.tennis_club_id != club.id:
                    flash('You do not have permission to edit this time slot', 'error')
                    return redirect(url_for('club_management.manage_groups', club_id=club_id))

                try:
                    # Parse and validate times
                    start_time = datetime.strptime(start_time, '%H:%M').time()
                    end_time = datetime.strptime(end_time, '%H:%M').time()

                    if start_time >= end_time:
                        flash('End time must be after start time', 'error')
                        return redirect(url_for('club_management.manage_groups', club_id=club_id))

                    # Validate capacity if provided
                    if capacity is not None and capacity < 1:
                        flash('Capacity must be at least 1 if specified', 'error')
                        return redirect(url_for('club_management.manage_groups', club_id=club_id))

                    # Update time slot
                    time_slot.day_of_week = DayOfWeek[day.upper()]
                    time_slot.start_time = start_time
                    time_slot.end_time = end_time
                    time_slot.capacity = capacity  # Can be None

                    db.session.commit()
                    flash('Time slot updated successfully', 'success')
                except ValueError as e:
                    flash('Invalid time format', 'error')
                except SQLAlchemyError as e:
                    db.session.rollback()
                    flash(f'Error updating time slot: {str(e)}', 'error')
                
                return redirect(url_for('club_management.manage_groups', club_id=club_id))

            elif action == 'delete_time':
                time_id = request.form.get('time_id')
                time_slot = TennisGroupTimes.query.get_or_404(time_id)

                # Verify club ownership
                if time_slot.tennis_club_id != club.id:
                    flash('You do not have permission to delete this time slot', 'error')
                else:
                    try:
                        db.session.delete(time_slot)
                        db.session.commit()
                        flash('Time slot deleted successfully', 'success')
                    except SQLAlchemyError as e:
                        db.session.rollback()
                        flash(f'Error deleting time slot: {str(e)}', 'error')

        # Get all groups for this club with their times
        groups = TennisGroup.query.filter_by(
            tennis_club_id=club.id
        ).order_by(TennisGroup.name).all()

        return render_template('admin/manage_groups.html', 
                             club=club, 
                             groups=groups,
                             days_of_week=DayOfWeek)

    except Exception as e:
        flash(f'An error occurred: {str(e)}', 'error')
        return redirect(url_for('main.home'))

def parse_birth_date(date_str):
    """Parse birth date string to date object."""
    if date_str:
        try:
            return datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return None
    return None

def days_until_expiry(expiry_date):
        """Calculate days until expiry for a given date."""
        if expiry_date is None:
            return None, None
            
        # Convert expiry date to UK timezone if it isn't already
        if hasattr(expiry_date, 'tzinfo') and expiry_date.tzinfo != uk_timezone:
            expiry_date = expiry_date.astimezone(uk_timezone)
        
        current_time = datetime.now(uk_timezone)
        
        # Set both dates to midnight for accurate day calculation
        if hasattr(expiry_date, 'replace'):
            expiry_midnight = expiry_date.replace(hour=0, minute=0, second=0, microsecond=0)
            current_midnight = current_time.replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            # Handle date objects
            expiry_midnight = datetime.combine(expiry_date, datetime.min.time())
            current_midnight = datetime.combine(current_time.date(), datetime.min.time())
            expiry_midnight = uk_timezone.localize(expiry_midnight)
            current_midnight = uk_timezone.localize(current_midnight)
        
        days = (expiry_midnight - current_midnight).days
        
        if days < 0:
            return 'expired', days
        elif days <= 90:
            return 'warning', days
        else:
            return 'valid', days

@club_management.route('/manage/<int:club_id>/coaches', methods=['GET'])
@login_required
@admin_required
def manage_coaches(club_id):
    club = TennisClub.query.get_or_404(club_id)
    
    if current_user.tennis_club_id != club.id:
        flash('You can only manage coaches in your own tennis club', 'error')
        return redirect(url_for('main.dashboard'))

    # Get all coaches for this club
    coaches = User.query.filter_by(
        tennis_club_id=club.id
    ).order_by(User.name).all()
    
    # Get coach details for all coaches
    coach_details = CoachDetails.query.filter_by(
        tennis_club_id=club.id
    ).all()
    
    # Create a dictionary for easy lookup
    coach_details_map = {details.user_id: details for details in coach_details}

    def get_status_data(details, status_type):
        """Helper function to get status data for template"""
        status_map = {
            'accreditation': {
                'field': 'accreditation_expiry',
                'label': 'Accreditation'
            },
            'dbs': {
                'field': 'dbs_expiry',
                'label': 'DBS Check'
            },
            'first_aid': {
                'field': 'first_aid_expiry',
                'label': 'First Aid'
            },
            'safeguarding': {
                'field': 'safeguarding_expiry',
                'label': 'Safeguarding'
            }
        }
        
        if not details:
            return {
                'color_class': 'bg-gray-50 border-gray-200 text-gray-500',
                'message': 'Not Set',
                'label': status_map[status_type]['label']
            }
        
        status_info = status_map[status_type]
        expiry_date = getattr(details, status_info['field'])
        
        if not expiry_date:
            return {
                'color_class': 'bg-gray-50 border-gray-200 text-gray-500',
                'message': 'Not Set',
                'label': status_info['label']
            }
        
        current_time = datetime.now(uk_timezone)
        if expiry_date.tzinfo != uk_timezone:
            expiry_date = expiry_date.astimezone(uk_timezone)
            
        days_until_expiry = (expiry_date - current_time).days
        
        if days_until_expiry < 0:
            color_class = 'bg-red-50 border-red-200 text-red-700'
            message = f'Expired {abs(days_until_expiry)} days ago'
        elif days_until_expiry <= 90:
            color_class = 'bg-yellow-50 border-yellow-200 text-yellow-700'
            message = f'Expires in {days_until_expiry} days'
        else:
            color_class = 'bg-green-50 border-green-200 text-green-700'
            message = f'Valid until {expiry_date.strftime("%d %b %Y")}'
            
        return {
            'color_class': color_class,
            'message': message,
            'label': status_info['label']
        }

    return render_template(
        'admin/manage_coaches.html',
        club=club,
        coaches=coaches,
        coach_details_map=coach_details_map,
        get_status_data=get_status_data,
        CoachQualification=CoachQualification,
        CoachRole=CoachRole
    )

@club_management.route('/manage/<int:club_id>/coaches/<int:coach_id>/edit', methods=['GET', 'POST'])
@login_required
@admin_required
def edit_coach(club_id, coach_id):
    club = TennisClub.query.get_or_404(club_id)
    coach = User.query.get_or_404(coach_id)
    
    if current_user.tennis_club_id != club.id:
        flash('You can only manage coaches in your own tennis club', 'error')
        return redirect(url_for('main.dashboard'))
        
    details = CoachDetails.query.filter_by(user_id=coach_id, tennis_club_id=club_id).first()
    
    if request.method == 'POST':
        try:
            if not details:
                details = CoachDetails(user_id=coach_id, tennis_club_id=club_id)
                db.session.add(details)
            
            # Update fields from form
            details.coach_number = request.form.get('coach_number') or None
            if request.form.get('qualification'):
                details.qualification = CoachQualification[request.form.get('qualification')]
            if request.form.get('coach_role'):
                details.coach_role = CoachRole[request.form.get('coach_role')]
                
            # Parse dates
            details.date_of_birth = parse_birth_date(request.form.get('date_of_birth'))
            details.accreditation_expiry = parse_date(request.form.get('accreditation_expiry'))
            details.dbs_expiry = parse_date(request.form.get('dbs_expiry'))
            details.first_aid_expiry = parse_date(request.form.get('first_aid_expiry'))
            details.safeguarding_expiry = parse_date(request.form.get('safeguarding_expiry'))
            
            # Update other fields
            fields = [
                'contact_number', 'emergency_contact_name', 'emergency_contact_number',
                'address_line1', 'address_line2', 'city', 'postcode',
                'utr_number', 'bcta_accreditation', 'dbs_number', 
                'dbs_update_service_id'
            ]
            
            for field in fields:
                value = request.form.get(field)
                if value:  # Only set if value is not empty
                    setattr(details, field, value)
            
            db.session.commit()
            flash('Coach details updated successfully', 'success')
            return redirect(url_for('club_management.manage_coaches', club_id=club_id))
            
        except Exception as e:
            db.session.rollback()
            flash(f'Error updating coach details: {str(e)}', 'error')
    
    return render_template(
        'admin/edit_coach.html',
        club=club,
        coach=coach,
        details=details,
        coach_qualifications=CoachQualification,
        coach_roles=CoachRole
    )

@club_management.route('/manage/<int:club_id>/coaches/invite', methods=['POST'])
@login_required
@admin_required
def invite_coach(club_id):
    """Invite a new coach to the tennis club"""
    club = TennisClub.query.get_or_404(club_id)
    
    if current_user.tennis_club_id != club.id:
        flash('You can only invite coaches to your own tennis club', 'error')
        return redirect(url_for('main.dashboard'))
    
    email = request.form.get('email')
    if not email:
        flash('Email address is required', 'error')
        return redirect(url_for('club_management.manage_coaches', club_id=club_id))
    
    try:
        # Create new invitation
        invitation = CoachInvitation.create_invitation(
            email=email,
            tennis_club_id=club.id,
            invited_by_id=current_user.id,
            expiry_hours=current_app.config['INVITATION_EXPIRY_HOURS']
        )
        
        # Use the EmailService class to send the invitation
        email_service = EmailService()
        success, message = email_service.send_coach_invitation(invitation, club.name)
        
        if success:
            # Save to database if email was sent successfully
            db.session.add(invitation)
            db.session.commit()
            flash('Invitation sent successfully', 'success')
        else:
            flash(f'Error sending invitation: {message}. Please try again.', 'error')
            
    except Exception as e:
        db.session.rollback()
        flash(f'Error sending invitation: {str(e)}', 'error')
    
    return redirect(url_for('club_management.manage_coaches', club_id=club_id))

@club_management.route('/accept-invitation/<token>')
def accept_invitation(token):
    """Handle coach accepting an invitation"""
    try:
        # Get invitation and validate
        invitation = CoachInvitation.query.filter_by(token=token, used=False).first()
        
        if not invitation:
            flash('Invalid invitation link. This invitation may have already been used.', 'error')
            return redirect(url_for('main.index'))
        
        if invitation.is_expired:
            db.session.delete(invitation)
            db.session.commit()
            flash('This invitation has expired. Please request a new invitation.', 'error')
            return redirect(url_for('main.index'))

        # Generate state and store in session
        state = secrets.token_urlsafe(32)
        nonce = secrets.token_urlsafe(32)
        session['oauth_state'] = state
        session['oauth_nonce'] = nonce
        
        # Store invitation info in session
        session['pending_invitation'] = {
            'token': token,
            'tennis_club_id': invitation.tennis_club_id,
            'email': invitation.email
        }

        authorize_params = {
            'client_id': current_app.config['AWS_COGNITO_CLIENT_ID'],
            'response_type': 'code',
            'scope': 'openid email profile',
            'redirect_uri': url_for('main.auth_callback', _external=True),
            'state': state,
            'nonce': nonce
        }
        
        # Build the authorization URL
        cognito_domain = current_app.config['COGNITO_DOMAIN']
        params = '&'.join(f"{k}={v}" for k, v in authorize_params.items())
        hosted_ui_url = f"https://{cognito_domain}/login?{params}"
        
        print(f"Redirecting to hosted UI with state: {state}")
        return redirect(hosted_ui_url)
        
    except Exception as e:
        print(f"Error processing invitation: {str(e)}")
        print(traceback.format_exc())
        flash('An error occurred while processing the invitation.', 'error')
        return redirect(url_for('main.index'))

##################################################
## Screen: Manage Players
## These are my routes for the programme player management
## Written by Otto Sterner
## Date: 25/12/2024
##################################################

@club_management.route('/manage/<int:club_id>/players', methods=['GET'])
@login_required
@admin_required
def manage_players(club_id):
    club = TennisClub.query.get_or_404(club_id)
    
    # Get all teaching periods
    periods = TeachingPeriod.query.filter_by(
        tennis_club_id=club.id
    ).order_by(TeachingPeriod.start_date.desc()).all()

    # Get selected period from query params
    selected_period_id = request.args.get('period', type=int)

    # If no period selected, find the latest period that has players
    if not selected_period_id and periods:
        # Get all period IDs that have players
        period_ids_with_players = (db.session.query(ProgrammePlayers.teaching_period_id)
            .filter(ProgrammePlayers.tennis_club_id == club.id)
            .distinct()
            .all())
        period_ids = [p[0] for p in period_ids_with_players]
        
        if period_ids:
            # Get the latest period that has players
            latest_period = (TeachingPeriod.query
                .filter(
                    TeachingPeriod.id.in_(period_ids),
                    TeachingPeriod.tennis_club_id == club.id
                )
                .order_by(TeachingPeriod.start_date.desc())
                .first())
            
            if latest_period:
                selected_period_id = latest_period.id
            else:
                current_app.logger.info("No teaching periods found with players")
        else:
            current_app.logger.info("No periods found with any players assigned")
    
    # Get players for selected period
    players = []
    if selected_period_id:
        players = ProgrammePlayers.query.filter_by(
            tennis_club_id=club.id,
            teaching_period_id=selected_period_id
        ).order_by(ProgrammePlayers.created_at.desc()).all()
    
    available_groups = TennisGroup.query.filter_by(tennis_club_id=club.id).all()
    
    return render_template(
        'admin/programme_management.html',
        club=club,
        periods=periods,
        selected_period_id=selected_period_id,
        players=players,
        available_groups=available_groups
    )

@club_management.route('/api/players/bulk-upload', methods=['POST'])
@login_required
@admin_required
def bulk_upload_players():
    """API endpoint for bulk uploading players via CSV"""
    
    students_created = 0
    players_created = 0
    warnings = []
    errors = []
    
    try:
        # Validate request has file
        if 'file' not in request.files:
            current_app.logger.error("No file in request")
            return jsonify({'error': 'No file uploaded'}), 400
            
        file = request.files['file']
        if file.filename == '':
            current_app.logger.error("Empty filename")
            return jsonify({'error': 'No selected file'}), 400
        
        # Validate file type
        if not file.filename.lower().endswith('.csv'):
            current_app.logger.error(f"Invalid file type: {file.filename}")
            return jsonify({'error': 'Only CSV files are allowed'}), 400
            
        # Validate teaching period
        teaching_period_id = request.form.get('teaching_period_id')
        if not teaching_period_id:
            current_app.logger.error("Missing teaching_period_id")
            return jsonify({'error': 'Teaching period is required'}), 400

        # Get current club
        club = TennisClub.query.get_or_404(current_user.tennis_club_id)
        current_app.logger.info(f"Processing upload for club: {club.name} (ID: {club.id})")

        # Read and validate CSV
        try:
            # Save file content for debugging
            file_content = file.read()
            
            # Protect against empty files
            if not file_content:
                current_app.logger.error("Empty CSV file")
                return jsonify({'error': 'The uploaded CSV file is empty'}), 400
                
            current_app.logger.debug(f"CSV content preview: {file_content[:500]}")
            
            # Reset file pointer and parse CSV
            file.seek(0)
            
            # Try different encodings if UTF-8 fails
            try:
                df = pd.read_csv(file, encoding='utf-8')
            except UnicodeDecodeError:
                file.seek(0)
                df = pd.read_csv(file, encoding='latin-1')
            
            # Check if CSV has any rows
            if len(df) == 0:
                current_app.logger.error("CSV has no data rows")
                return jsonify({'error': 'The CSV file contains no data rows'}), 400
            
            # Log DataFrame info
            current_app.logger.info(f"CSV loaded with {len(df)} rows and columns: {', '.join(df.columns)}")
            
            # Clean whitespace and handle missing values
            df = df.apply(lambda x: x.str.strip() if x.dtype == "object" else x)
            
            # Replace empty strings with NaN for better handling
            df = df.replace('', pd.NA)
            
        except pd.errors.ParserError as e:
            current_app.logger.error(f"CSV parsing error: {str(e)}")
            current_app.logger.error(traceback.format_exc())
            return jsonify({'error': f'Error parsing CSV: {str(e)}. Please check file format.'}), 400
        except Exception as e:
            current_app.logger.error(f"Error reading CSV: {str(e)}")
            current_app.logger.error(traceback.format_exc())
            return jsonify({'error': f'Error reading CSV file: {str(e)}'}), 400
        
        # Verify required columns
        required_columns = [
            'student_name', 'date_of_birth', 'contact_email', 
            'coach_email', 'group_name', 'day_of_week',
            'start_time', 'end_time'
        ]
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            current_app.logger.error(f"Missing columns: {', '.join(missing_columns)}")
            return jsonify({
                'error': 'Missing required columns in CSV file', 
                'details': f"The following columns are required: {', '.join(missing_columns)}"
            }), 400
        
        # Get all coaches and groups for the club
        coaches = {coach.email.lower(): coach for coach in 
                 User.query.filter_by(tennis_club_id=club.id).all()}
                 
        if not coaches:
            current_app.logger.error("No coaches found in club")
            return jsonify({'error': 'No coaches found in your club'}), 400
                 
        groups = {group.name.lower(): group for group in 
                 TennisGroup.query.filter_by(tennis_club_id=club.id).all()}
                 
        if not groups:
            current_app.logger.error("No groups found in club")
            return jsonify({'error': 'No groups found in your club'}), 400

        current_app.logger.info(f"Found {len(coaches)} coaches and {len(groups)} groups")
        
        # Verify teaching period
        teaching_period = TeachingPeriod.query.get(teaching_period_id)
        if not teaching_period:
            current_app.logger.error(f"Teaching period not found: {teaching_period_id}")
            return jsonify({'error': 'Teaching period not found'}), 404
            
        if teaching_period.tennis_club_id != club.id:
            current_app.logger.error(f"Teaching period {teaching_period_id} does not belong to club {club.id}")
            return jsonify({'error': 'Teaching period does not belong to your club'}), 403
        
        current_app.logger.info(f"Using teaching period: {teaching_period.name} (ID: {teaching_period.id})")
        
        # Start a new transaction
        db.session.begin_nested()
        
        try:
            # First pass: validate data rows
            valid_rows = []
            for index, row in df.iterrows():
                try:
                    row_number = index + 2  # +2 for header row and 0-indexing
                    row_data = {}
                    
                    # Validate student name
                    if pd.isna(row['student_name']):
                        errors.append(f"Row {row_number}: Missing student name")
                        continue
                    row_data['student_name'] = row['student_name']
                    
                    # Validate contact email
                    if pd.isna(row['contact_email']):
                        errors.append(f"Row {row_number}: Missing contact email for {row['student_name']}")
                        continue
                    row_data['contact_email'] = row['contact_email']
                    
                    # Validate coach
                    if pd.isna(row['coach_email']):
                        errors.append(f"Row {row_number}: Missing coach email for {row['student_name']}")
                        continue
                        
                    coach_email = str(row['coach_email']).lower()
                    if coach_email not in coaches:
                        errors.append(f"Row {row_number}: Coach with email {row['coach_email']} not found")
                        continue
                    row_data['coach'] = coaches[coach_email]
                    
                    # Validate group
                    if pd.isna(row['group_name']):
                        errors.append(f"Row {row_number}: Missing group name for {row['student_name']}")
                        continue
                        
                    group_name = str(row['group_name']).lower()
                    if group_name not in groups:
                        errors.append(f"Row {row_number}: Group '{row['group_name']}' not found")
                        continue
                    row_data['group'] = groups[group_name]
                    
                    # Parse day of week
                    if pd.isna(row['day_of_week']):
                        errors.append(f"Row {row_number}: Missing day of week for {row['student_name']}")
                        continue
                        
                    try:
                        day_of_week = DayOfWeek[str(row['day_of_week']).upper()]
                        row_data['day_of_week'] = day_of_week
                    except KeyError:
                        valid_days = ', '.join([d.name.title() for d in DayOfWeek])
                        errors.append(f"Row {row_number}: Invalid day of week '{row['day_of_week']}'. Must be one of: {valid_days}")
                        continue
                    
                    # Parse time values
                    if pd.isna(row['start_time']) or pd.isna(row['end_time']):
                        errors.append(f"Row {row_number}: Missing start or end time for {row['student_name']}")
                        continue
                        
                    try:
                        start_time = datetime.strptime(str(row['start_time']), '%H:%M').time()
                        end_time = datetime.strptime(str(row['end_time']), '%H:%M').time()
                        
                        if start_time >= end_time:
                            errors.append(f"Row {row_number}: End time must be after start time")
                            continue
                            
                        row_data['start_time'] = start_time
                        row_data['end_time'] = end_time
                    except ValueError as e:
                        errors.append(f"Row {row_number}: Invalid time format. Use HH:MM. Error: {str(e)}")
                        continue
                    
                    # Find group time slot
                    group_time = TennisGroupTimes.query.filter_by(
                        group_id=row_data['group'].id,
                        day_of_week=row_data['day_of_week'],
                        start_time=row_data['start_time'],
                        end_time=row_data['end_time'],
                        tennis_club_id=club.id
                    ).first()

                    if not group_time:
                        # Get available times for more helpful error message
                        available_times = TennisGroupTimes.query.filter_by(
                            group_id=row_data['group'].id,
                            tennis_club_id=club.id
                        ).all()
                        
                        if not available_times:
                            time_info = "No time slots configured for this group"
                        else:
                            time_info = ', '.join([f"{t.day_of_week.value} {t.start_time}-{t.end_time}" for t in available_times])
                            
                        errors.append(f"Row {row_number}: Group time slot not found for {row['group_name']} " +
                                    f"on {row['day_of_week']} at {row['start_time']}-{row['end_time']}. " +
                                    f"Available times: {time_info}")
                        continue
                        
                    row_data['group_time'] = group_time
                    
                    # Parse date of birth (optional)
                    if not pd.isna(row['date_of_birth']):
                        try:
                            row_data['date_of_birth'] = parse_date(str(row['date_of_birth']))
                        except ValueError as e:
                            warnings.append(f"Row {row_number}: Couldn't parse date of birth '{row['date_of_birth']}', will be ignored. Error: {str(e)}")
                    
                    # Add row to valid rows
                    valid_rows.append(row_data)
                    
                except Exception as e:
                    current_app.logger.error(f"Error validating row {index + 2}: {str(e)}")
                    current_app.logger.error(traceback.format_exc())
                    errors.append(f"Row {index + 2}: Unexpected error: {str(e)}")
            
            # If there are errors, return them without processing
            if errors and not valid_rows:
                db.session.rollback()
                current_app.logger.error(f"Upload failed: No valid rows found, {len(errors)} errors")
                return jsonify({
                    'error': 'Upload failed: No valid data rows',
                    'details': errors
                }), 400
            
            # Second pass: process valid rows
            for row_data in valid_rows:
                try:
                    # Get or create student
                    student = Student.query.filter_by(
                        name=row_data['student_name'],
                        tennis_club_id=club.id
                    ).first()

                    if not student:
                        student = Student(
                            name=row_data['student_name'],
                            date_of_birth=row_data.get('date_of_birth'),
                            contact_email=row_data['contact_email'],
                            tennis_club_id=club.id
                        )
                        db.session.add(student)
                        db.session.flush()  # Get student.id
                        students_created += 1

                    # Check if player assignment already exists
                    existing_player = ProgrammePlayers.query.filter_by(
                        student_id=student.id,
                        group_id=row_data['group'].id,
                        group_time_id=row_data['group_time'].id,
                        teaching_period_id=teaching_period.id,
                        tennis_club_id=club.id
                    ).first()

                    if existing_player:
                        warnings.append(f"Student {student.name} is already assigned to {row_data['group'].name} " +
                                      f"at {row_data['day_of_week'].value} {row_data['start_time']}-{row_data['end_time']}")
                        continue

                    # Create new player assignment
                    player = ProgrammePlayers(
                        student_id=student.id,
                        coach_id=row_data['coach'].id,
                        group_id=row_data['group'].id,
                        group_time_id=row_data['group_time'].id,
                        teaching_period_id=teaching_period.id,
                        tennis_club_id=club.id
                    )
                    db.session.add(player)
                    players_created += 1

                except Exception as e:
                    current_app.logger.error(f"Error processing student {row_data['student_name']}: {str(e)}")
                    current_app.logger.error(traceback.format_exc())
                    errors.append(f"Error creating player assignment for {row_data['student_name']}: {str(e)}")
                    raise  # Re-raise to trigger rollback
            
            # Check if we have any successful creations
            if players_created == 0:
                db.session.rollback()
                current_app.logger.warning(f"No players created, {len(errors)} errors, {len(warnings)} warnings")
                
                if errors:
                    return jsonify({
                        'error': 'Upload failed: No players were created',
                        'details': errors,
                        'warnings': warnings
                    }), 400
                elif warnings:
                    return jsonify({
                        'error': 'Upload failed: No new players were created',
                        'details': 'All students already exist in the specified groups',
                        'warnings': warnings
                    }), 400
                else:
                    return jsonify({
                        'error': 'Upload failed: No players were created',
                        'details': 'Unknown error occurred'
                    }), 500
            
            # If we get here, commit the transaction
            db.session.commit()
            current_app.logger.info(f"Upload successful: {students_created} students and {players_created} player assignments created")
            
            # Construct response with warnings if any
            response = {
                'message': 'Upload successful',
                'students_created': students_created,
                'players_created': players_created
            }
            
            if warnings:
                response['warnings'] = warnings
                
            if errors:
                response['errors'] = errors
                response['message'] = 'Upload partially successful with some errors'
                
            return jsonify(response)
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Bulk upload error: {str(e)}")
            current_app.logger.error(traceback.format_exc())
            return jsonify({
                'error': 'Upload failed',
                'details': str(e),
                'errors': errors,
                'warnings': warnings
            }), 500
            
    except Exception as e:
        # Be sure to rollback any active transaction
        if db.session.in_transaction():
            db.session.rollback()
            
        current_app.logger.error(f"Unexpected error in bulk upload: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({
            'error': 'Server error during upload',
            'details': str(e)
        }), 500

@club_management.route('/api/template/download')
@login_required
@admin_required
def download_template():
    """API endpoint for downloading the CSV template"""
    club = TennisClub.query.get_or_404(current_user.tennis_club_id)
    
    csv_content = [
        "student_name,date_of_birth,contact_email,coach_email,group_name,day_of_week,start_time,end_time",
        "John Smith,05-Nov-2013,parent@example.com,coach@example.com,Red 1,Monday,16:00,17:00",
        "Emma Jones,22-Mar-2014,emma.parent@example.com,coach@example.com,Red 2,Tuesday,15:30,16:30"
    ]
    
    # Add format explanation
    csv_content.insert(0, "# Format instructions:")
    csv_content.insert(1, "# - Date format must be DD-MMM-YYYY (e.g., 05-Nov-2013)")
    csv_content.insert(2, "# - Time format must be HH:MM (24-hour format)")
    csv_content.insert(3, "# - Day of week must be: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, or Sunday")
    csv_content.insert(4, "#")
    
    response = make_response("\n".join(csv_content))
    response.headers["Content-Type"] = "text/csv"
    response.headers["Content-Disposition"] = f"attachment; filename=player_template_{club.name.lower().replace(' ', '_')}.csv"
    
    return response

@club_management.route('/manage/<int:club_id>/players/add')
@login_required
@admin_required
def add_player_page(club_id):
    """Serve the React add player page"""
    club = TennisClub.query.get_or_404(club_id)
    if current_user.tennis_club_id != club.id:
        flash('You can only manage players in your own tennis club', 'error')
        return redirect(url_for('main.dashboard'))
    
    return render_template('admin/add_programme_player.html', club=club)

@club_management.route('/manage/<int:club_id>/players/<int:player_id>/edit')
@login_required
@admin_required
def edit_player_page(club_id, player_id):
    """Serve the React edit player page"""

    club = TennisClub.query.get_or_404(club_id)
    if current_user.tennis_club_id != club.id:
        current_app.logger.warning("Club ID mismatch.")
        flash('You can only manage players in your own tennis club', 'error')
        return redirect(url_for('main.home'))

    player = ProgrammePlayers.query.get_or_404(player_id)

    if player.tennis_club_id != club.id:
        current_app.logger.warning(f"Mismatch: Player belongs to {player.tennis_club_id}, not {club.id}.")
        flash('Player not found in your club', 'error')
        return redirect(url_for('main.home'))

    return render_template('admin/edit_programme_player.html', club=club)


@club_management.route('/api/players/<int:player_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required
@admin_required
def player_api(player_id):
    """API endpoint for managing a single player"""
    player = ProgrammePlayers.query.get_or_404(player_id)
    
    if current_user.tennis_club_id != player.tennis_club_id:
        return jsonify({'error': 'Unauthorized access'}), 403

    if request.method == 'GET':
        response_data = {
            'student': {
                'name': player.student.name,
                'date_of_birth': player.student.date_of_birth.strftime('%Y-%m-%d') if player.student.date_of_birth else None,
                'contact_email': player.student.contact_email
            },
            'coach_id': player.coach_id,
            'group_id': player.group_id,
            'group_time_id': player.group_time_id,  # Add group time ID to response
            'teaching_period_id': player.teaching_period_id
        }
        return jsonify(response_data)

    elif request.method == 'PUT':
        try:
            data = request.get_json()
            
            if not data:
                return jsonify({'error': 'No data provided'}), 400

            # Update student details
            player.student.name = data['student_name']
            player.student.contact_email = data['contact_email']
            if data.get('date_of_birth'):
                try:
                    player.student.date_of_birth = datetime.strptime(data['date_of_birth'], '%Y-%m-%d').date()
                except ValueError:
                    return jsonify({'error': 'Invalid date format'}), 400

            # Verify coach belongs to club
            coach = User.query.get(data['coach_id'])
            if not coach or coach.tennis_club_id != current_user.tennis_club_id:
                return jsonify({'error': 'Invalid coach selected'}), 400

            # Verify group belongs to club
            group = TennisGroup.query.get(data['group_id'])
            if not group or group.tennis_club_id != current_user.tennis_club_id:
                return jsonify({'error': 'Invalid group selected'}), 400

            # Verify group time belongs to group and club
            if data.get('group_time_id'):
                group_time = TennisGroupTimes.query.get(data['group_time_id'])
                if not group_time or group_time.tennis_club_id != current_user.tennis_club_id or group_time.group_id != group.id:
                    return jsonify({'error': 'Invalid group time selected'}), 400

            # Update assignments
            player.coach_id = coach.id
            player.group_id = group.id
            player.group_time_id = data.get('group_time_id')  # Update group time ID
            
            db.session.commit()
            return jsonify({'message': 'Player updated successfully'})
            
        except KeyError as e:
            return jsonify({'error': f'Missing required field: {str(e)}'}), 400
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error updating player: {str(e)}")
            current_app.logger.error(traceback.format_exc())
            return jsonify({'error': str(e)}), 400

    elif request.method == 'DELETE':
        try:
            db.session.delete(player)
            db.session.commit()
            return jsonify({'message': 'Player removed successfully'})
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error deleting player: {str(e)}")
            return jsonify({'error': f'Failed to remove player: {str(e)}'}), 400

@club_management.route('/api/players', methods=['POST'])
@login_required
@admin_required
def create_player():
    """API endpoint for creating a new player"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        club_id = current_user.tennis_club_id

        # Validate data
        required_fields = ['student_name', 'contact_email', 'coach_id', 'group_id', 'group_time_id', 'teaching_period_id']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        # Verify coach belongs to club
        coach = User.query.get(data['coach_id'])
        if not coach or coach.tennis_club_id != club_id:
            return jsonify({'error': 'Invalid coach selected'}), 400

        # Verify group belongs to club
        group = TennisGroup.query.get(data['group_id'])
        if not group or group.tennis_club_id != club_id:
            return jsonify({'error': 'Invalid group selected'}), 400

        # Verify group time belongs to group and club
        group_time = TennisGroupTimes.query.get(data['group_time_id'])
        if not group_time or group_time.tennis_club_id != club_id or group_time.group_id != group.id:
            return jsonify({'error': 'Invalid group time selected'}), 400

        # Verify teaching period belongs to club
        period = TeachingPeriod.query.get(data['teaching_period_id'])
        if not period or period.tennis_club_id != club_id:
            return jsonify({'error': 'Invalid teaching period selected'}), 400

        # Create or get student
        student = Student.query.filter_by(
            name=data['student_name'],
            tennis_club_id=club_id
        ).first()

        if not student:
            student = Student(
                name=data['student_name'],
                contact_email=data['contact_email'],
                tennis_club_id=club_id
            )
            if data.get('date_of_birth'):
                try:
                    student.date_of_birth = datetime.strptime(data['date_of_birth'], '%Y-%m-%d').date()
                except ValueError:
                    return jsonify({'error': 'Invalid date format'}), 400
            
            db.session.add(student)
            db.session.flush()

            # Check if player already exists in this specific group and time slot
            existing_player = ProgrammePlayers.query.filter_by(
                student_id=student.id,
                group_id=data['group_id'],
                group_time_id=data['group_time_id'],
                teaching_period_id=data['teaching_period_id'],
                tennis_club_id=club_id
            ).first()

            if existing_player:
                return jsonify({
                    'error': 'Player is already assigned to this specific group and time slot'
                }), 400

        # Create programme player assignment
        assignment = ProgrammePlayers(
            student_id=student.id,
            coach_id=data['coach_id'],
            group_id=data['group_id'],
            group_time_id=data['group_time_id'],  # Add group time ID
            teaching_period_id=data['teaching_period_id'],
            tennis_club_id=club_id
        )

        db.session.add(assignment)
        db.session.commit()

        return jsonify({
            'message': 'Player added successfully',
            'id': assignment.id
        })

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating player: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 400

@club_management.route('/api/coaches')
@login_required
@admin_required
def get_coaches():
    """API endpoint for getting all coaches in the club"""
    
    coaches = User.query.filter(
        User.tennis_club_id == current_user.tennis_club_id,
        User.role.in_([UserRole.COACH, UserRole.ADMIN])  # Include both coaches and admins
    ).order_by(User.name).all()
    
    response_data = [{
        'id': coach.id,
        'name': coach.name,
        'email': coach.email
    } for coach in coaches]
    
    return jsonify(response_data)

@club_management.route('/api/groups')
@login_required
@admin_required
def get_groups():
    """API endpoint for getting all groups in the club"""
    groups = TennisGroup.query.filter_by(
        tennis_club_id=current_user.tennis_club_id
    ).order_by(TennisGroup.name).all()
    
    return jsonify([{
        'id': group.id,
        'name': group.name,
        'description': group.description
    } for group in groups])

@club_management.route('/api/groups/<int:group_id>/times')
@login_required
@admin_required
def get_group_times(group_id):
    """API endpoint for getting all time slots for a specific group"""
    try:
        
        # Verify group belongs to user's club
        group = TennisGroup.query.filter_by(
            id=group_id,
            tennis_club_id=current_user.tennis_club_id
        ).first_or_404()
        
        # Get all time slots for this group - first get them unordered
        times = TennisGroupTimes.query.filter_by(
            group_id=group_id,
            tennis_club_id=current_user.tennis_club_id
        ).all()
        
        # Sort the results in Python instead of SQL
        day_order = {
            'Monday': 0,
            'Tuesday': 1,
            'Wednesday': 2,
            'Thursday': 3,
            'Friday': 4,
            'Saturday': 5,
            'Sunday': 6
        }
        
        # Sort using Python's sorted function
        times = sorted(times, 
                      key=lambda x: (day_order[x.day_of_week.value], x.start_time))
        
        response_data = [{
            'id': time.id,
            'day_of_week': time.day_of_week.value,
            'start_time': time.start_time.strftime('%H:%M'),
            'end_time': time.end_time.strftime('%H:%M')
        } for time in times]

        return jsonify(response_data)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching group times: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@club_management.route('/api/teaching-periods')
@login_required
@admin_required
def get_teaching_periods():
    """API endpoint for getting all teaching periods in the club"""
    periods = TeachingPeriod.query.filter_by(
        tennis_club_id=current_user.tennis_club_id
    ).order_by(TeachingPeriod.start_date.desc()).all()
    
    return jsonify([{
        'id': period.id,
        'name': period.name,
        'start_date': period.start_date.strftime('%Y-%m-%d'),
        'end_date': period.end_date.strftime('%Y-%m-%d')
    } for period in periods])

@club_management.route('/manage/<int:club_id>/upload-logo', methods=['POST'])
@login_required
@admin_required
def upload_logo(club_id):
    """Handle club logo upload"""
    
    if 'logo' not in request.files:
        current_app.logger.warning("No logo file in request")
        flash('No file uploaded', 'error')
        return redirect(url_for('club_management.manage_club', club_id=club_id))
        
    file = request.files['logo']
    if file.filename == '':
        current_app.logger.warning("Empty filename")
        flash('No file selected', 'error')
        return redirect(url_for('club_management.manage_club', club_id=club_id))
        
    if file and allowed_file(file.filename):
        try:
            
            # Get club before upload
            club = TennisClub.query.get_or_404(club_id)
            if not club:
                current_app.logger.error(f"Club {club_id} not found")
                flash('Club not found', 'error')
                return redirect(url_for('main.home'))

            # Upload to S3
            bucket_name = os.environ.get('AWS_S3_BUCKET')
            if not bucket_name:
                current_app.logger.error("AWS_S3_BUCKET not configured")
                flash('Server configuration error', 'error')
                return redirect(url_for('club_management.manage_club', club_id=club_id))

            
            # Store the old logo URL if it exists
            old_logo_url = club.logo_url
            
            # Upload new logo with subdomain
            file_url = upload_file_to_s3(file, bucket_name, club.subdomain)
            
            if file_url:
                
                # Delete old logo from S3 if it exists
                if old_logo_url:
                    try:
                        old_key = old_logo_url.split('.amazonaws.com/')[-1]
                        s3_client = boto3.client(
                            's3',
                            aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
                            aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY'),
                            region_name=os.environ.get('AWS_S3_REGION')
                        )
                        s3_client.delete_object(
                            Bucket=bucket_name,
                            Key=old_key
                        )
                    except Exception as e:
                        current_app.logger.error(f"Error deleting old logo: {str(e)}")
                
                # Update database with new logo URL
                club.logo_url = file_url
                db.session.commit()
                
                flash('Logo uploaded successfully', 'success')
            else:
                current_app.logger.error("File upload failed")
                flash('Error uploading file', 'error')
                
        except Exception as e:
            current_app.logger.error(f"Error during upload: {str(e)}")
            current_app.logger.error(traceback.format_exc())
            flash(f'Error: {str(e)}', 'error')
            db.session.rollback()
    else:
        current_app.logger.warning(f"Invalid file type: {file.filename}")
        flash('Invalid file type. Please use PNG, JPG, or GIF', 'error')
            
    return redirect(url_for('club_management.manage_club', club_id=club_id))

@club_management.route('/api/clubs/<int:club_id>/logo-url')
@login_required
def get_logo_url(club_id):
    """Get a fresh presigned URL for the club logo"""
    try:
        club = TennisClub.query.get_or_404(club_id)
        
        if not club.logo_url:
            return jsonify({'error': 'No logo found'}), 404
            
        # Get fresh presigned URL
        s3_client = boto3.client(
            's3',
            aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY'),
            region_name=os.environ.get('AWS_S3_REGION')
        )
        
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': os.environ.get('AWS_S3_BUCKET'),
                'Key': club.logo_url,
                'ResponseContentType': 'image/*'
            },
            ExpiresIn=3600
        )
        
        return jsonify({'url': url})
        
    except Exception as e:
        current_app.logger.error(f"Error generating logo URL: {str(e)}")
        return jsonify({'error': 'Failed to generate URL'}), 500
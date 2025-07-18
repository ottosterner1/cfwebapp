import os
import boto3
from flask import Blueprint, jsonify, request, render_template, flash, redirect, url_for, session, make_response, current_app
from sqlalchemy import case
from app import db
from app.clubs.middleware import verify_club_access
from app.models import (
    TennisClub, User, TennisGroup, TeachingPeriod, UserRole, Student, 
    ProgrammePlayers, CoachDetails, CoachQualification, CoachRole, CoachInvitation, 
    DayOfWeek, TennisGroupTimes, ClubInvitation, Report, RegisterEntry
)
from datetime import datetime, timedelta, timezone
from flask_login import login_required, current_user, login_user
import traceback
import pandas as pd 
from werkzeug.utils import secure_filename 
from app.utils.auth import admin_required
from sqlalchemy.exc import SQLAlchemyError
import pytz
import json
import uuid
import time
import csv
from io import StringIO
from app.services.email_service import EmailService
import secrets 
from app.utils.s3 import upload_file_to_s3

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


def setup_initial_teaching_period(club_id):
   start_date = datetime.now()
   db.session.add(TeachingPeriod(
       tennis_club_id=club_id,
       name=f"Teaching Period {start_date.strftime('%B %Y')}",
       start_date=start_date, 
       end_date=start_date + timedelta(weeks=12)
   ))


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

def clean_phone_number(phone_str):
    """Clean phone number while preserving leading zeros."""
    if phone_str is None or pd.isna(phone_str):
        return None
        
    # Convert to string if it's not already
    phone_str = str(phone_str).strip()
    
    # Remove leading apostrophe if present
    if phone_str.startswith("'"):
        phone_str = phone_str[1:]
    
    # If it's a number that got converted to float, handle it properly
    if '.' in phone_str and phone_str.replace('.', '').isdigit():
        # Convert back to int to remove decimal, then to string to preserve leading zeros
        phone_str = str(int(float(phone_str))).zfill(len(phone_str.split('.')[0]))
    
    # Ensure UK mobile numbers have proper formatting
    if phone_str.isdigit() and len(phone_str) == 10 and not phone_str.startswith('0'):
        phone_str = '0' + phone_str
    
    return phone_str if phone_str else None

def parse_walk_home(value):
    """Parse walk_home value from Y/N/Blank to True/False/None."""
    if value is None or pd.isna(value):
        return None
        
    value_str = str(value).strip().upper()
    
    if value_str in ('Y', 'YES', 'TRUE', '1'):
        return True
    elif value_str in ('N', 'NO', 'FALSE', '0'):
        return False
    elif value_str in ('', 'BLANK', 'NULL', 'NONE'):
        return None
    else:
        return None  # Default to None for invalid values

def validate_time_format(time_str):
    """Validate time format and return parsed time or raise error."""
    if pd.isna(time_str):
        raise ValueError("Time value is missing")
    
    try:
        # Try parsing as HH:MM
        return datetime.strptime(str(time_str).strip(), '%H:%M').time()
    except ValueError:
        try:
            # Try parsing as H:MM (single digit hour)
            return datetime.strptime(str(time_str).strip(), '%H:%M').time()
        except ValueError:
            raise ValueError(f"Invalid time format '{time_str}'. Use HH:MM format (e.g., 09:30, 15:45)")

def validate_phone_number(phone_str):
    """Validate phone number format."""
    if phone_str is None or pd.isna(phone_str) or str(phone_str).strip() == '':
        return True  # Optional field
    
    cleaned = clean_phone_number(phone_str)
    if not cleaned:
        return False
    
    # UK phone number validation (basic)
    if not cleaned.isdigit():
        return False
    
    # UK numbers should be 11 digits starting with 0, or 10 digits for mobile
    if len(cleaned) not in [10, 11]:
        return False
    
    return True

def pre_validate_csv(df):
    """
    Pre-validate the entire CSV file before processing.
    Returns (is_valid, errors, warnings)
    """
    errors = []
    warnings = []
    
    # Check required columns
    required_columns = [
        'student_name', 'date_of_birth', 'contact_email', 
        'coach_email', 'group_name', 'day_of_week',
        'start_time', 'end_time'
    ]
    
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        errors.append(f"Missing required columns: {', '.join(missing_columns)}")
        return False, errors, warnings
    
    # Validate each row
    for index, row in df.iterrows():
        row_number = index + 2  # +2 for header row and 0-indexing
        
        # Check required fields
        if pd.isna(row['student_name']):
            errors.append(f"Row {row_number}: Missing student name")
        
        if pd.isna(row['contact_email']):
            errors.append(f"Row {row_number}: Missing contact email")
        
        if pd.isna(row['coach_email']):
            errors.append(f"Row {row_number}: Missing coach email")
            
        if pd.isna(row['group_name']):
            errors.append(f"Row {row_number}: Missing group name")
        
        # Validate day of week
        if not pd.isna(row['day_of_week']):
            try:
                DayOfWeek[str(row['day_of_week']).upper()]
            except KeyError:
                valid_days = ', '.join([d.name.title() for d in DayOfWeek])
                errors.append(f"Row {row_number}: Invalid day of week '{row['day_of_week']}'. Must be one of: {valid_days}")
        else:
            errors.append(f"Row {row_number}: Missing day of week")
        
        # Validate time formats
        try:
            validate_time_format(row['start_time'])
        except ValueError as e:
            errors.append(f"Row {row_number}: Start time error - {str(e)}")
        
        try:
            validate_time_format(row['end_time'])
        except ValueError as e:
            errors.append(f"Row {row_number}: End time error - {str(e)}")
        
        # Validate walk_home values if present
        if 'walk_home' in row and not pd.isna(row['walk_home']):
            walk_home_value = str(row['walk_home']).strip().upper()
            valid_walk_home = ['Y', 'N', 'YES', 'NO', 'TRUE', 'FALSE', '1', '0', '', 'BLANK', 'NULL', 'NONE']
            if walk_home_value not in valid_walk_home:
                errors.append(f"Row {row_number}: Invalid walk_home value '{row['walk_home']}'. Use Y, N, or leave blank")
        
        # Validate phone numbers
        if 'contact_number' in row and not validate_phone_number(row['contact_number']):
            errors.append(f"Row {row_number}: Invalid contact number format '{row['contact_number']}'")
        
        if 'emergency_contact_number' in row and not validate_phone_number(row['emergency_contact_number']):
            errors.append(f"Row {row_number}: Invalid emergency contact number format '{row['emergency_contact_number']}'")
        
        # Validate email format (basic)
        if not pd.isna(row['contact_email']):
            email = str(row['contact_email']).strip()
            if '@' not in email or '.' not in email:
                errors.append(f"Row {row_number}: Invalid email format '{email}'")
    
    # Stop processing if there are critical errors
    if errors:
        return False, errors, warnings
    
    return True, [], warnings

def process_batch(batch_df, club_id, teaching_period, coaches, groups, allow_updates=True):
    """
    Process a batch of CSV rows with validation, database updates, and update capability.
    
    Args:
        batch_df: DataFrame containing the batch of rows to process
        club_id: Tennis club ID
        teaching_period: TeachingPeriod object
        coaches: Dictionary of coach email -> coach object
        groups: Dictionary of group name -> group object
        allow_updates: Boolean to allow updating existing player assignments
    """
    
    valid_rows = []
    batch_errors = []
    batch_warnings = []
    
    # Validate all rows first
    for index, row in batch_df.iterrows():
        try:
            row_number = index + 2  # +2 for header row and 0-indexing
            row_data = {}
            
            # Validate student name
            if pd.isna(row['student_name']):
                batch_errors.append(f"Row {row_number}: Missing student name")
                continue
            row_data['student_name'] = str(row['student_name']).strip()
            
            # Validate contact email
            if pd.isna(row['contact_email']):
                batch_errors.append(f"Row {row_number}: Missing contact email for {row['student_name']}")
                continue
            row_data['contact_email'] = str(row['contact_email']).strip()
            
            # Validate coach
            if pd.isna(row['coach_email']):
                batch_errors.append(f"Row {row_number}: Missing coach email for {row['student_name']}")
                continue
                
            coach_email = str(row['coach_email']).lower().strip()
            if coach_email not in coaches:
                batch_errors.append(f"Row {row_number}: Coach with email {row['coach_email']} not found")
                continue
            row_data['coach'] = coaches[coach_email]
            
            # Validate group
            if pd.isna(row['group_name']):
                batch_errors.append(f"Row {row_number}: Missing group name for {row['student_name']}")
                continue
                
            group_name = str(row['group_name']).lower().strip()
            if group_name not in groups:
                batch_errors.append(f"Row {row_number}: Group '{row['group_name']}' not found")
                continue
            row_data['group'] = groups[group_name]
            
            # Parse day of week
            if pd.isna(row['day_of_week']):
                batch_errors.append(f"Row {row_number}: Missing day of week for {row['student_name']}")
                continue
                
            try:
                day_of_week = DayOfWeek[str(row['day_of_week']).upper()]
                row_data['day_of_week'] = day_of_week
            except KeyError:
                valid_days = ', '.join([d.name.title() for d in DayOfWeek])
                batch_errors.append(f"Row {row_number}: Invalid day of week '{row['day_of_week']}'. Must be one of: {valid_days}")
                continue
            
            # Parse time values with improved validation
            if pd.isna(row['start_time']) or pd.isna(row['end_time']):
                batch_errors.append(f"Row {row_number}: Missing start or end time for {row['student_name']}")
                continue
                
            try:
                start_time = validate_time_format(row['start_time'])
                end_time = validate_time_format(row['end_time'])
                
                if start_time >= end_time:
                    batch_errors.append(f"Row {row_number}: End time must be after start time")
                    continue
                    
                row_data['start_time'] = start_time
                row_data['end_time'] = end_time
            except ValueError as e:
                batch_errors.append(f"Row {row_number}: {str(e)}")
                continue
            
            # Find group time slot
            group_time = TennisGroupTimes.query.filter_by(
                group_id=row_data['group'].id,
                day_of_week=row_data['day_of_week'],
                start_time=row_data['start_time'],
                end_time=row_data['end_time'],
                tennis_club_id=club_id
            ).first()

            if not group_time:
                # Get available times for more helpful error message
                available_times = TennisGroupTimes.query.filter_by(
                    group_id=row_data['group'].id,
                    tennis_club_id=club_id
                ).all()
                
                if not available_times:
                    time_info = "No time slots configured for this group"
                else:
                    time_info = ', '.join([f"{t.day_of_week.value} {t.start_time}-{t.end_time}" for t in available_times])
                    
                batch_errors.append(f"Row {row_number}: Group time slot not found for {row['group_name']} " +
                                  f"on {row['day_of_week']} at {row['start_time']}-{row['end_time']}. " +
                                  f"Available times: {time_info}")
                continue
                
            row_data['group_time'] = group_time
            
            # Parse date of birth (optional)
            if not pd.isna(row['date_of_birth']):
                try:
                    row_data['date_of_birth'] = parse_date(str(row['date_of_birth']))
                except ValueError as e:
                    batch_warnings.append(f"Row {row_number}: Couldn't parse date of birth '{row['date_of_birth']}', will be ignored. Error: {str(e)}")
            
            # Extract contact information with improved phone number handling
            if 'contact_number' in row and not pd.isna(row['contact_number']):
                cleaned_number = clean_phone_number(row['contact_number'])
                if cleaned_number and validate_phone_number(row['contact_number']):
                    row_data['contact_number'] = cleaned_number
                else:
                    batch_warnings.append(f"Row {row_number}: Invalid contact number '{row['contact_number']}', will be ignored")
            
            if 'emergency_contact_number' in row and not pd.isna(row['emergency_contact_number']):
                cleaned_emergency = clean_phone_number(row['emergency_contact_number'])
                if cleaned_emergency and validate_phone_number(row['emergency_contact_number']):
                    row_data['emergency_contact_number'] = cleaned_emergency
                else:
                    batch_warnings.append(f"Row {row_number}: Invalid emergency contact number '{row['emergency_contact_number']}', will be ignored")
            
            if 'medical_information' in row and not pd.isna(row['medical_information']):
                row_data['medical_information'] = str(row['medical_information']).strip()
            
            # Handle walk_home field with Y/N/Blank support
            if 'walk_home' in row and not pd.isna(row['walk_home']):
                walk_home_value = parse_walk_home(row['walk_home'])
                row_data['walk_home'] = walk_home_value
                
                # Log if we couldn't parse it
                if walk_home_value is None and str(row['walk_home']).strip():
                    batch_warnings.append(f"Row {row_number}: Couldn't parse walk_home value '{row['walk_home']}', defaulting to blank")

            # Extract notes (optional)
            if 'notes' in row and not pd.isna(row['notes']):
                row_data['notes'] = str(row['notes']).strip()
            
            # Add to valid rows
            valid_rows.append(row_data)
            
        except Exception as e:
            batch_errors.append(f"Row {index + 2}: Unexpected error: {str(e)}")
    
    # Process valid rows in a single transaction
    batch_students_created = 0
    batch_students_updated = 0
    batch_players_created = 0
    batch_players_updated = 0
    
    if valid_rows:
        # Use a fresh transaction for this batch
        try:
            with db.session.begin_nested():
                for row_data in valid_rows:
                    # Get or create student
                    student = Student.query.filter_by(
                        name=row_data['student_name'],
                        tennis_club_id=club_id
                    ).first()

                    if not student:
                        student = Student(
                            name=row_data['student_name'],
                            date_of_birth=row_data.get('date_of_birth'),
                            contact_email=row_data['contact_email'],
                            contact_number=row_data.get('contact_number'),
                            emergency_contact_number=row_data.get('emergency_contact_number'),
                            medical_information=row_data.get('medical_information'),
                            tennis_club_id=club_id
                        )
                        db.session.add(student)
                        db.session.flush()  # Get student.id
                        batch_students_created += 1
                    else:
                        # Update existing student information
                        updated = False
                        
                        if student.contact_email != row_data['contact_email']:
                            student.contact_email = row_data['contact_email']
                            updated = True
                            
                        if 'date_of_birth' in row_data and student.date_of_birth != row_data.get('date_of_birth'):
                            student.date_of_birth = row_data.get('date_of_birth')
                            updated = True
                            
                        if 'contact_number' in row_data and student.contact_number != row_data.get('contact_number'):
                            student.contact_number = row_data.get('contact_number')
                            updated = True
                            
                        if 'emergency_contact_number' in row_data and student.emergency_contact_number != row_data.get('emergency_contact_number'):
                            student.emergency_contact_number = row_data.get('emergency_contact_number')
                            updated = True
                            
                        if 'medical_information' in row_data and student.medical_information != row_data.get('medical_information'):
                            student.medical_information = row_data.get('medical_information')
                            updated = True
                        
                        if updated:
                            batch_students_updated += 1

                    # Check if player assignment already exists
                    existing_player = ProgrammePlayers.query.filter_by(
                        student_id=student.id,
                        group_id=row_data['group'].id,
                        group_time_id=row_data['group_time'].id,
                        teaching_period_id=teaching_period.id,
                        tennis_club_id=club_id
                    ).first()

                    if existing_player:
                        if allow_updates:
                            # Update existing player assignment
                            updated = False
                            
                            if existing_player.coach_id != row_data['coach'].id:
                                existing_player.coach_id = row_data['coach'].id
                                updated = True
                                
                            if existing_player.walk_home != row_data.get('walk_home'):
                                existing_player.walk_home = row_data.get('walk_home')
                                updated = True
                                
                            if existing_player.notes != row_data.get('notes'):
                                existing_player.notes = row_data.get('notes')
                                updated = True
                            
                            if updated:
                                batch_players_updated += 1
                                batch_warnings.append(f"Updated existing player assignment for {student.name} in {row_data['group'].name}")
                        else:
                            batch_warnings.append(f"Student {student.name} is already assigned to {row_data['group'].name} " +
                                              f"at {row_data['day_of_week'].value} {row_data['start_time']}-{row_data['end_time']}")
                        continue

                    # Create new player assignment
                    player = ProgrammePlayers(
                        student_id=student.id,
                        coach_id=row_data['coach'].id,
                        group_id=row_data['group'].id,
                        group_time_id=row_data['group_time'].id,
                        teaching_period_id=teaching_period.id,
                        tennis_club_id=club_id,
                        walk_home=row_data.get('walk_home'),
                        notes=row_data.get('notes') 
                    )
                    db.session.add(player)
                    batch_players_created += 1
                    
            # Commit the outer transaction
            db.session.commit()
            
        except Exception as e:
            # Make sure to rollback
            db.session.rollback()
            batch_errors.append(f"Database error: {str(e)}")
            current_app.logger.error(f"Database error in process_batch: {str(e)}")
            current_app.logger.error(traceback.format_exc())
    
    # Return batch results
    return {
        'students_created': batch_students_created,
        'students_updated': batch_students_updated,
        'players_created': batch_players_created,
        'players_updated': batch_players_updated,
        'warnings': batch_warnings,
        'errors': batch_errors
    }

# Helper function that should already exist but including here for completeness
def parse_date(date_str):
    """Parse date from various formats including YYYY-MM-DD, DD-MMM-YYYY, or DD-MMM-YY"""
    
    # Return None for empty strings or None values
    if not date_str or str(date_str).strip() == '':
        return None

    try:
        # First try YYYY-MM-DD format (HTML5 date input)
        try:
            parsed_date = datetime.strptime(date_str.strip(), '%Y-%m-%d').date()
            return parsed_date
        except ValueError:
            # If that fails, try DD-MMM-YYYY or DD-MMM-YY format
            date_str = date_str.strip()
            
            # Handle different dash/separator types
            if '-' in date_str:
                parts = date_str.split('-')
            elif '/' in date_str:
                parts = date_str.split('/')
            else:
                raise ValueError(f"Cannot parse date format: {date_str}")
                
            if len(parts) != 3:
                raise ValueError(f"Date should have 3 parts (day, month, year): {date_str}")
                
            day, month, year = parts
            
            # Ensure month is properly capitalized if it's a text month
            if not month.isdigit():
                month = month.capitalize()
            
            # Handle 2-digit years by converting to 4-digit (assuming 20xx for recent years)
            if len(year) == 2:
                # Convert 2-digit year to 4-digit
                # Years 00-69 are treated as 2000-2069, years 70-99 as 1970-1999
                year_int = int(year)
                if year_int < 70:
                    year = f"20{year}"
                else:
                    year = f"19{year}"
            
            # Try different date formats based on the type of month (text vs numeric)
            if month.isdigit():
                try:
                    # Try MM/DD/YYYY format (common in US)
                    parsed_date = datetime.strptime(f"{month}/{day}/{year}", '%m/%d/%Y').date()
                except ValueError:
                    # Try DD/MM/YYYY format (common outside US)
                    parsed_date = datetime.strptime(f"{day}/{month}/{year}", '%d/%m/%Y').date()
            else:
                # Month is text like "Jun" - use DD-MMM-YYYY format
                formatted_date_str = f"{day}-{month}-{year}"
                parsed_date = datetime.strptime(formatted_date_str, '%d-%b-%Y').date()
                
            return parsed_date
            
    except Exception as e:
        # Log the error but return None instead of raising to prevent crashes
        current_app.logger.error(f"Date parsing failed for '{date_str}': {str(e)}")
        raise ValueError(f"Invalid date format: '{date_str}'. Please use YYYY-MM-DD or DD-MMM-YYYY format.")

def get_or_create_default_organisation(club_name):
    """Get or create a default organisation for a new club"""
    from app.models import Organisation
    
    # Create a unique organisation slug based on club name
    base_slug = club_name.lower().replace(' ', '-').replace('_', '-')
    
    # Remove non-alphanumeric characters except hyphens
    import re
    base_slug = re.sub(r'[^a-z0-9-]', '', base_slug)
    
    # Ensure slug is unique
    slug = base_slug
    counter = 1
    while Organisation.query.filter_by(slug=slug).first():
        slug = f"{base_slug}-{counter}"
        counter += 1
    
    # Create new organisation
    organisation = Organisation(
        name=f"{club_name} Organisation",
        slug=slug
    )
    
    db.session.add(organisation)
    db.session.flush() 
    
    return organisation

# Routes:

@club_management.route('/api/organisation-clubs', methods=['GET'])
@login_required
@admin_required
@verify_club_access()
def get_organisation_clubs():
    """Get all clubs in the current user's organisation"""
    try:
        organisation_id = current_user.tennis_club.organisation_id
        
        clubs = TennisClub.query.filter_by(
            organisation_id=organisation_id
        ).order_by(TennisClub.name).all()
        
        # FIXED: Get group count from organisation level
        organisation_group_count = 0
        if clubs:
            # All clubs in same organisation share the same groups
            first_club = clubs[0]
            if first_club.organisation:
                organisation_group_count = len(first_club.organisation.groups)
        
        return jsonify([{
            'id': club.id,
            'name': club.name,
            'subdomain': club.subdomain,
            'is_current': club.id == current_user.tennis_club_id,
            'user_count': club.users.count(),
            'group_count': organisation_group_count  # FIXED: Use organisation-level group count
        } for club in clubs])
        
    except Exception as e:
        current_app.logger.error(f"Error fetching organisation clubs: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500



@club_management.route('/onboard', methods=['GET', 'POST'])
def onboard_club():
    """Handle onboarding of a new tennis club"""
    
    # Check available authentication methods
    temp_user_info = session.get('temp_user_info')
    club_invitation = session.get('club_invitation')
    
    # If neither exists, redirect to login
    if not temp_user_info and not club_invitation:
        flash('Please login first or use an invitation link', 'error')
        return redirect(url_for('auth.login'))

    if request.method == 'GET':
        # Determine email and name to pre-fill
        email = ""
        name = ""
        
        if temp_user_info:
            email = temp_user_info.get('email', '')
            name = temp_user_info.get('name', '')
        elif club_invitation:
            email = club_invitation.get('email', '')
        
        return render_template('admin/club_onboarding.html', 
                             email=email,
                             name=name)

    try:
        # Create new tennis club
        club_name = request.form.get('club_name')
        subdomain = request.form.get('subdomain')
        
        if not club_name or not subdomain:
            flash('Club name and subdomain are required', 'error')
            return redirect(url_for('club_management.onboard_club'))
        
        # Check if subdomain already exists
        existing_club = TennisClub.query.filter_by(subdomain=subdomain).first()
        if existing_club:
            flash(f'Subdomain "{subdomain}" is already in use. Please choose another.', 'error')
            return redirect(url_for('club_management.onboard_club'))
        
        # CHANGED: Get or create a default organisation for single-club organisations
        organisation = get_or_create_default_organisation(club_name)
            
        club = TennisClub(
            name=club_name,
            subdomain=subdomain,
            organisation_id=organisation.id  # CHANGED: assign to organisation
        )
        db.session.add(club)
        db.session.flush()  # Get club ID

        # Create admin user based on available info (rest remains the same)
        if temp_user_info:
            # Create admin user using the Google auth info
            admin = User(
                email=temp_user_info['email'],
                username=f"admin_{subdomain}",
                name=temp_user_info['name'],
                role=UserRole.ADMIN,
                tennis_club_id=club.id,
                auth_provider='google',
                auth_provider_id=temp_user_info['provider_id'],
                is_active=True
            )
        elif club_invitation:
            # Use submitted name or default
            admin_name = request.form.get('admin_name')
            if not admin_name:
                flash('Administrator name is required', 'error')
                return redirect(url_for('club_management.onboard_club'))
                
            # Create admin user from invitation
            admin = User(
                email=club_invitation['email'],
                username=f"admin_{subdomain}",
                name=admin_name,
                role=UserRole.ADMIN,
                tennis_club_id=club.id,
                is_active=True
            )
            
            # Mark invitation as used if we have a proper token
            if 'token' in club_invitation:
                invitation = ClubInvitation.query.filter_by(token=club_invitation['token']).first()
                if invitation:
                    invitation.used = True
        
        db.session.add(admin)
        
        setup_initial_teaching_period(club.id)
        
        db.session.commit()
        
        # Log the user in and clear session
        login_user(admin)
        if 'temp_user_info' in session:
            session.pop('temp_user_info', None)
        if 'club_invitation' in session:
            session.pop('club_invitation', None)
        
        flash('Tennis club created successfully! You can now manage your club settings.', 'success')
        return redirect(url_for('main.home'))
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating club: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        flash(f'Error creating club: {str(e)}', 'error')
        return redirect(url_for('club_management.onboard_club'))

@club_management.route('/manage/<int:club_id>/club', methods=['GET', 'POST'])
@login_required
@verify_club_access()
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
   
   # CHANGED: Pass organisation info to template
   organisation_clubs = TennisClub.query.filter_by(
       organisation_id=club.organisation_id
   ).order_by(TennisClub.name).all()
           
   return render_template('admin/manage_club.html', 
                         club=club, 
                         organisation=club.organisation,
                         organisation_clubs=organisation_clubs)

@club_management.route('/manage/<int:club_id>/teaching-periods', methods=['GET', 'POST'])
@login_required
@verify_club_access()
def manage_teaching_periods(club_id):
    
    club = TennisClub.query.get_or_404(club_id)
    
    if not current_user.is_admin and not current_user.is_super_admin:
        flash('You must be an admin to manage teaching periods', 'error')
        return redirect(url_for('main.home'))
        
    if current_user.tennis_club.organisation_id != club.organisation_id:
        flash('You can only manage teaching periods for your own organisation', 'error')
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
                elif period.programme_players.count() > 0:
                    flash('Cannot delete teaching period with assigned players', 'error')
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
                return redirect(url_for('auth.login'))
               
        except Exception as e:
            db.session.rollback()
            print(f"Error in onboarding: {str(e)}")
            flash('An error occurred during onboarding', 'error')
            return redirect(url_for('club_management.onboard_coach'))
   
    clubs = TennisClub.query.all()
    return render_template('admin/coach_onboarding.html', clubs=clubs)

@club_management.route('/manage/<int:club_id>/groups', methods=['GET', 'POST'])
@login_required
@admin_required
@verify_club_access()
def manage_groups(club_id):
    try:
        club = TennisClub.query.get_or_404(club_id)

        if current_user.tennis_club.organisation_id != club.organisation_id:
            flash('You can only manage groups in your own organisation', 'error')
            return redirect(url_for('main.home'))

        if request.method == 'POST':
            action = request.form.get('action')
            
            if action == 'add_group':
                group_name = request.form.get('group_name', '').strip()
                group_description = request.form.get('group_description', '').strip()
                
                if not group_name:
                    flash('Group name is required', 'error')
                    return redirect(url_for('club_management.manage_groups', club_id=club_id))

                # CHANGED: Check for existing group in organization instead of club
                existing_group = TennisGroup.query.filter_by(
                    organisation_id=club.organisation_id, 
                    name=group_name
                ).first()
                
                if existing_group:
                    flash('A group with this name already exists in your organization', 'error')
                else:
                    try:
                        # CHANGED: Use organisation_id instead of tennis_club_id
                        new_group = TennisGroup(
                            name=group_name,
                            description=group_description,
                            organisation_id=club.organisation_id
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
                
                # CHANGED: Check if the group belongs to this organization
                if group.organisation_id != club.organisation_id:
                    flash('You do not have permission to edit this group', 'error')
                    return redirect(url_for('club_management.manage_groups', club_id=club_id))

                # CHANGED: Check if name already exists for another group in organization
                existing_group = TennisGroup.query.filter(
                    TennisGroup.organisation_id == club.organisation_id,
                    TennisGroup.name == group_name,
                    TennisGroup.id != group_id
                ).first()

                if existing_group:
                    flash('A group with this name already exists in your organization', 'error')
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

                # CHANGED: Check if the group belongs to this organization
                if group.organisation_id != club.organisation_id:
                    flash('You do not have permission to delete this group', 'error')
                    return redirect(url_for('club_management.manage_groups', club_id=club_id))

                # Check if the group has any players assigned to it across all clubs in organization
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

                # CHANGED: Validate group belongs to organization
                group = TennisGroup.query.get_or_404(group_id)
                if group.organisation_id != club.organisation_id:
                    flash('You do not have permission to add time slots to this group', 'error')
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

                    # TennisGroupTimes creation remains the same (still club-level)
                    time_slot = TennisGroupTimes(
                        group_id=group_id,
                        day_of_week=DayOfWeek[day.upper()],
                        start_time=start_time,
                        end_time=end_time,
                        capacity=capacity,  # Can be None
                        tennis_club_id=club.id  # Still club-level
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

                # TennisGroupTimes validation remains the same (still club-level)
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

                # TennisGroupTimes validation remains the same (still club-level)
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

        # Get all groups for this organization
        groups = TennisGroup.query.filter_by(
            organisation_id=club.organisation_id
        ).order_by(TennisGroup.name).all()

        # SIMPLE FIX: Query group times for this club only
        club_group_times = TennisGroupTimes.query.filter_by(
            tennis_club_id=club.id
        ).order_by(TennisGroupTimes.group_id, TennisGroupTimes.start_time).all()
        
        # Group the times by group_id for easy template access
        group_times_dict = {}
        for time in club_group_times:
            if time.group_id not in group_times_dict:
                group_times_dict[time.group_id] = []
            group_times_dict[time.group_id].append(time)

        return render_template('admin/manage_groups.html', 
                             club=club, 
                             groups=groups,
                             group_times_dict=group_times_dict, 
                             days_of_week=DayOfWeek)

    except Exception as e:
        flash(f'An error occurred: {str(e)}', 'error')
        return redirect(url_for('main.home'))

@club_management.route('/api/groups')
@login_required
@verify_club_access()
def get_groups():
    """API endpoint for getting all groups in the organisation"""
    groups = TennisGroup.query.filter_by(
        organisation_id=current_user.tennis_club.organisation_id
    ).order_by(TennisGroup.name).all()
    
    return jsonify([{
        'id': group.id,
        'name': group.name,
        'description': group.description
    } for group in groups])

@club_management.route('/manage/<int:club_id>/coaches', methods=['GET'])
@login_required
@admin_required
@verify_club_access()
def manage_coaches(club_id):
    club = TennisClub.query.get_or_404(club_id)
    
    if current_user.tennis_club.organisation_id != club.organisation_id:
        flash('You can only manage coaches in your own organisation', 'error')
        return redirect(url_for('main.dashboard'))

    # Get all coaches for this organisation
    organisation_id = club.organisation_id
    coaches = User.query.join(TennisClub).filter(
        TennisClub.organisation_id == organisation_id,
        User.is_active == True
    ).order_by(TennisClub.name, User.name).all()
    
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
@verify_club_access()
def edit_coach(club_id, coach_id):
    club = TennisClub.query.get_or_404(club_id)
    coach = User.query.get_or_404(coach_id)
    
    if coach.tennis_club.organisation_id != club.organisation_id:
        flash('You can only edit coaches in your own organisation', 'error')
        return redirect(url_for('main.dashboard'))
        
    details = CoachDetails.query.filter_by(user_id=coach_id).first()
    
    if request.method == 'POST':
        try:
            if not details:
                details = CoachDetails(user_id=coach_id, tennis_club_id=coach.tennis_club_id)
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
            details.bcta_accreditation = parse_date(request.form.get('bcta_accreditation'))  # Now parsed as a date
            details.dbs_expiry = parse_date(request.form.get('dbs_expiry'))
            details.first_aid_expiry = parse_date(request.form.get('first_aid_expiry'))
            details.safeguarding_expiry = parse_date(request.form.get('safeguarding_expiry'))
            
            # Handle pediatric first aid fields
            details.pediatric_first_aid = 'pediatric_first_aid' in request.form
            details.pediatric_first_aid_expiry = parse_date(request.form.get('pediatric_first_aid_expiry'))
            
            # Update other fields
            fields = [
                'contact_number', 'emergency_contact_name', 'emergency_contact_number',
                'address_line1', 'address_line2', 'city', 'postcode',
                'utr_number', 'dbs_number', 'dbs_update_service_id'
            ]  # Removed bcta_accreditation from this list since it's now a date field
            
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
@verify_club_access()
def invite_coach(club_id):
    """Invite a new coach to the tennis club"""
    club = TennisClub.query.get_or_404(club_id)
    
    if current_user.tennis_club.organisation_id != club.organisation_id:
        flash('You can only invite coaches to your own organisation', 'error')
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
            'redirect_uri': url_for('auth.auth_callback', _external=True),
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

@club_management.route('/manage/<int:club_id>/players', methods=['GET'])
@login_required
@admin_required
@verify_club_access()
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
    
    available_groups = TennisGroup.query.filter_by(
        organisation_id=current_user.tennis_club.organisation_id
    ).order_by(TennisGroup.name).all()
    
    return render_template(
        'admin/programme_management.html',
        club=club,
        periods=periods,
        selected_period_id=selected_period_id,
        players=players,
        available_groups=available_groups
    )

@club_management.route('/manage/<int:club_id>/players/add')
@login_required
@admin_required
@verify_club_access()
def add_player_page(club_id):
    """Serve the React add player page"""
    club = TennisClub.query.get_or_404(club_id)
    if current_user.tennis_club.organisation_id != club.organisation_id:
        flash('You can only manage players in your own organisation', 'error')
        return redirect(url_for('main.dashboard'))
    
    return render_template('admin/add_programme_player.html', club=club)

@club_management.route('/manage/<int:club_id>/players/<int:player_id>/edit')
@login_required
@admin_required
@verify_club_access()
def edit_player_page(club_id, player_id):
    """Serve the React edit player page"""

    club = TennisClub.query.get_or_404(club_id)
    if current_user.tennis_club.organisation_id != club.organisation_id:
        current_app.logger.warning("Club ID mismatch.")
        flash('You can only manage players in your own organisation', 'error')
        return redirect(url_for('main.home'))

    player = ProgrammePlayers.query.get_or_404(player_id)

    if player.tennis_club_id != club.id:
        current_app.logger.warning(f"Mismatch: Player belongs to {player.tennis_club_id}, not {club.id}.")
        flash('Player not found in your club', 'error')
        return redirect(url_for('main.home'))

    return render_template('admin/edit_programme_player.html', club=club)

@club_management.route('/manage/<int:club_id>/upload-logo', methods=['POST'])
@login_required
@admin_required
@verify_club_access()
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
@verify_club_access()
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

@club_management.route('/super-admin', methods=['GET'])
@login_required
@verify_club_access()
def super_admin_dashboard():
    # Ensure only super admins can access this page
    if not current_user.is_super_admin:
        flash('Access denied. Super admin privileges required.', 'error')
        return redirect(url_for('main.home'))
    
    return render_template('admin/super_admin_dashboard.html')

@club_management.route('/api/clubs', methods=['GET'])
@login_required
@verify_club_access()
def get_all_clubs():
    """API endpoint to get all tennis clubs for super admin with organisation info"""
    
    if not current_user.is_super_admin:
        return jsonify({'error': 'Unauthorized'}), 403
    
    try:
        # CHANGED: Join with Organisation to get organisation info
        from app.models import Organisation
        
        clubs = (TennisClub.query
                .outerjoin(Organisation, TennisClub.organisation_id == Organisation.id)
                .order_by(Organisation.name.nullslast(), TennisClub.name)
                .all())
        
        result = []
        for club in clubs:
            # FIXED: Handle group counting properly for organisation-level groups
            if club.organisation:
                # Count groups in the organisation
                group_count = len(club.organisation.groups)
                organisation_data = {
                    'id': club.organisation.id,
                    'name': club.organisation.name,
                    'slug': club.organisation.slug
                }
            else:
                group_count = 0
                organisation_data = None
            
            result.append({
                'id': club.id,
                'name': club.name,
                'subdomain': club.subdomain,
                'organisation': organisation_data,
                'user_count': club.users.count(),
                'group_count': group_count  # FIXED: Use len() instead of .count()
            })
        
        # Set explicit content type
        response = jsonify(result)
        response.headers['Content-Type'] = 'application/json'
        return response
    except Exception as e:
        current_app.logger.error(f"Error fetching clubs: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@club_management.route('/api/super-admin/switch-club', methods=['POST'])
@login_required
@verify_club_access()
def switch_club_api():
    """API endpoint to switch the current club for super admin"""
    if not current_user.is_super_admin:
        return jsonify({'error': 'Unauthorized'}), 403
    
    data = request.get_json()
    club_id = data.get('club_id')
    
    if not club_id:
        return jsonify({'error': 'Missing club_id parameter'}), 400
    
    try:
        # Verify club exists
        club = TennisClub.query.get(club_id)
        if not club:
            return jsonify({'error': 'Tennis club not found'}), 404
        
        # Update the super admin's tennis_club_id
        current_user.tennis_club_id = club_id
        db.session.commit()
        
        return jsonify({
            'message': f'Now viewing {club.name}',
            'club': {
                'id': club.id,
                'name': club.name,
                'subdomain': club.subdomain
            }
        })
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error switching club: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
    
@club_management.route('/api/switch-club', methods=['POST'])
@login_required
@verify_club_access()
def switch_club_context():
    """Permanently switch user's club assignment"""
    try:
        data = request.get_json()
        club_id = data.get('club_id')
        
        if not club_id:
            return jsonify({'error': 'Club ID is required'}), 400
        
        # Verify user has access to this club
        accessible_clubs = current_user.get_accessible_clubs()
        target_club = None
        
        for club in accessible_clubs:
            if club.id == club_id:
                target_club = club
                break
        
        if not target_club:
            return jsonify({'error': 'Access denied to this club'}), 403
        
        # CHANGED: Permanently update the user's club assignment
        current_user.tennis_club_id = club_id
        db.session.commit()
        
        current_app.logger.info(f"User {current_user.id} permanently switched to club {club_id} ({target_club.name})")
        
        return jsonify({
            'message': f'Successfully switched to {target_club.name}',
            'club': {
                'id': target_club.id,
                'name': target_club.name,
                'subdomain': target_club.subdomain
            }
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error switching club: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


@club_management.route('/api/switch-clubs', methods=['POST'])
@login_required
@admin_required
@verify_club_access()
def cycle_clubs():
    """Permanently cycle to the next available club"""
    try:
        # Get user's accessible clubs
        accessible_clubs = current_user.get_accessible_clubs()
        
        if len(accessible_clubs) <= 1:
            return jsonify({'error': 'No other clubs available to switch to'}), 400
        
        # Get current club ID (user's actual tennis_club_id, not session-based)
        current_club_id = current_user.tennis_club_id
        
        # Find current club index in accessible clubs
        current_index = -1
        for i, club in enumerate(accessible_clubs):
            if club.id == current_club_id:
                current_index = i
                break
        
        # If current club not found in accessible clubs, start from first club
        if current_index == -1:
            next_index = 0
        else:
            # Calculate next club index (cycle to beginning if at end)
            next_index = (current_index + 1) % len(accessible_clubs)
        
        next_club = accessible_clubs[next_index]
        
        # CHANGED: Permanently update the user's club assignment
        current_user.tennis_club_id = next_club.id
        db.session.commit()
        
        current_app.logger.info(f"User {current_user.id} permanently cycled to club {next_club.id} ({next_club.name})")
        
        return jsonify({
            'message': f'Successfully switched to {next_club.name}',
            'club': {
                'id': next_club.id,
                'name': next_club.name,
                'subdomain': next_club.subdomain
            }
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error cycling clubs: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@club_management.route('/api/super-admin/invite-club', methods=['POST'])
@login_required
@verify_club_access()
def invite_club():
    """API endpoint for super admins to invite new tennis clubs"""
    if not current_user.is_super_admin:
        return jsonify({'error': 'Unauthorized. Super admin privileges required.'}), 403
    
    try:
        # Get request data
        data = request.get_json()
        if not data or 'email' not in data:
            return jsonify({'error': 'Email address is required'}), 400
            
        email = data['email'].strip()
        if not email or '@' not in email:
            return jsonify({'error': 'Valid email address is required'}), 400
        
        # Create a new invitation record
        invitation = ClubInvitation.create_invitation(
            email=email,
            invited_by_id=current_user.id,
            expiry_hours=48  # Expire after 48 hours
        )
        
        # Add to database session
        db.session.add(invitation)
        db.session.flush()  # Get the ID without committing yet
        
        # Use the EmailService to send the invitation
        email_service = EmailService()
        
        # Prepare the club name
        club_name = "CourtFlow Tennis Management"
        
        # Create correct URL with proper query parameter format
        invite_url = url_for('club_management.accept_club_invitation', 
                            token=invitation.token,
                            _external=True)
        
        # Create HTML content
        html_content = f"""
        <html>
            <body style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto;">
                    <div style="margin-bottom: 30px;">
                        <h2>Welcome to CourtFlow!</h2>
                        <p>You have been invited to set up a new tennis club on our platform.</p>
                        <p>Click the link below to get started:</p>
                        <p><a href="{invite_url}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Set Up Your Tennis Club</a></p>
                        <p>This invitation is valid for 48 hours. If you have any questions, please contact support.</p>
                    </div>
                    <div style="font-size: 0.9em; color: #666; border-top: 1px solid #eee; padding-top: 15px;">
                        <p>Thank you,<br>CourtFlow Team</p>
                        <p>Please do not reply to this email.</p>
                    </div>
                </div>
            </body>
        </html>
        """
        
        # Send the email using the new generic method
        success, message_id = email_service.send_generic_email(
            recipient_email=email,
            subject="Invitation to set up your Tennis Club on CourtFlow",
            html_content=html_content,
            sender_name=club_name
        )
        
        if success:
            # Commit the invitation to database
            db.session.commit()
            return jsonify({'message': f'Invitation sent successfully to {email}'}), 200
        else:
            # Rollback if email sending fails
            db.session.rollback()
            current_app.logger.error(f"Failed to send email: {message_id}")
            return jsonify({'error': f'Failed to send invitation email: {message_id}'}), 500
            
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error sending club invitation: {str(e)}")
        current_app

@club_management.route('/accept-club-invitation/<token>')
def accept_club_invitation(token):
    """Handle a tennis club admin accepting an invitation"""
    current_app.logger.info(f"Processing club invitation with token: {token}")
    # Print debug info to confirm this route is even being hit
    current_app.logger.info(f"Request URL: {request.url}")
    current_app.logger.info(f"Request args: {request.args}")
    
    try:
        # Get invitation and validate
        invitation = ClubInvitation.query.filter_by(token=token, used=False).first()
        
        if not invitation:
            current_app.logger.warning(f"Invalid invitation token: {token}")
            flash('Invalid invitation link. This invitation may have already been used.', 'error')
            return redirect(url_for('main.index'))
        
        if invitation.is_expired:
            current_app.logger.warning(f"Expired invitation token: {token}")
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
        session['club_invitation'] = {
            'token': token,
            'email': invitation.email
        }
        current_app.logger.info(f"Stored club invitation in session: {session['club_invitation']}")

        # Build the authorization URL with explicit parameters
        cognito_domain = current_app.config['COGNITO_DOMAIN']
        client_id = current_app.config['AWS_COGNITO_CLIENT_ID']
        redirect_uri = url_for('auth.auth_callback', _external=True)
        
        # Use the same direct construction method as in accept_invitation
        auth_url = (
            f"https://{cognito_domain}/login"
            f"?client_id={client_id}"
            f"&response_type=code"
            f"&scope=openid+email+profile"
            f"&redirect_uri={redirect_uri}"
            f"&state={state}"
            f"&nonce={nonce}"
        )
        
        current_app.logger.info(f"Redirecting to Cognito: {auth_url}")
        return redirect(auth_url)
        
    except Exception as e:
        current_app.logger.error(f"Error processing club invitation: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        flash('An error occurred while processing the invitation.', 'error')
        return redirect(url_for('main.index'))

@club_management.route('/api/clubs/<int:club_id>/users', methods=['GET'])
@login_required
@verify_club_access()
def get_club_users(club_id):
    """API endpoint to get all users in a club for super admin"""
    if not current_user.is_super_admin:
        return jsonify({'error': 'Unauthorized'}), 403
    
    try:
        # Verify club exists
        club = TennisClub.query.get(club_id)
        if not club:
            return jsonify({'error': 'Tennis club not found'}), 404
        
        # Get all users in the club
        users = User.query.filter_by(tennis_club_id=club_id).order_by(User.name).all()
        
        result = [{
            'id': user.id,
            'name': user.name,
            'email': user.email,
            'role': user.role.name
        } for user in users]
        
        return jsonify(result)
    except Exception as e:
        current_app.logger.error(f"Error fetching club users: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@club_management.route('/api/super-admin/update-user-role', methods=['POST'])
@login_required
@verify_club_access()
def update_user_role():
    """API endpoint to update a user's role (e.g., promote a coach to admin)"""
    if not current_user.is_super_admin:
        return jsonify({'error': 'Unauthorized. Super admin privileges required.'}), 403
    
    data = request.get_json()
    user_id = data.get('user_id')
    new_role = data.get('role')
    
    if not user_id or not new_role:
        return jsonify({'error': 'Missing required parameters (user_id and role)'}), 400
    
    try:
        # Verify user exists
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # Check if role is valid
        try:
            role = UserRole[new_role.upper()]
        except KeyError:
            valid_roles = [r.name for r in UserRole]
            return jsonify({'error': f'Invalid role. Must be one of: {", ".join(valid_roles)}'}), 400
        
        # Don't allow changing SUPER_ADMIN roles
        if user.role == UserRole.SUPER_ADMIN:
            return jsonify({'error': 'Cannot modify a Super Admin role'}), 400
            
        # Update user role
        user.role = role
        db.session.commit()
        
        current_app.logger.info(f"User {user.id} ({user.email}) role updated to {role.name}")
        
        return jsonify({
            'message': f'User role updated successfully to {role.name}',
            'user': {
                'id': user.id,
                'name': user.name,
                'email': user.email,
                'role': role.name
            }
        })
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating user role: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
    
@club_management.route('/api/coaches')
@login_required
@admin_required
@verify_club_access()
def get_coaches():
    """API endpoint for getting all coaches in the club"""
    
    coaches = User.query.filter(
        User.tennis_club_id == current_user.tennis_club_id
    ).order_by(User.name).all()
    
    response_data = [{
        'id': coach.id,
        'name': coach.name,
        'email': coach.email
    } for coach in coaches]
    
    return jsonify(response_data)

@club_management.route('/api/coaches/organisation')
@login_required
@verify_club_access()
def get_organisation_coaches():
    """Get coaches across the organisation for dropdowns/selection"""
    try:
        organisation_id = current_user.tennis_club.organisation_id
        
        coaches = db.session.query(User).join(TennisClub).filter(
            TennisClub.organisation_id == organisation_id,
            User.is_active == True
        ).order_by(User.name).all()
        
        return jsonify([{
            'id': coach.id, 
            'name': coach.name,
            'club_name': coach.tennis_club.name,
            'is_local': coach.tennis_club_id == current_user.tennis_club_id
        } for coach in coaches])
        
    except Exception as e:
        current_app.logger.error(f"Error fetching organisation coaches: {str(e)}")
        return jsonify({'error': str(e)}), 500

@club_management.route('/api/teaching-periods')
@login_required
@verify_club_access()
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

@club_management.route('/api/players/bulk-upload', methods=['POST'])
@login_required
@admin_required
def bulk_upload_players():
    """API endpoint for uploading and validating a CSV file (validation step only)"""
    
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

        # Create temp directory if it doesn't exist
        temp_dir = os.path.join(current_app.instance_path, 'uploads')
        os.makedirs(temp_dir, exist_ok=True)
        
        # Create a unique session key for this upload
        upload_token = str(uuid.uuid4())
        
        # Save file to temporary location
        temp_file_path = os.path.join(temp_dir, f"upload_{upload_token}.csv")
        file.save(temp_file_path)
        
        # Parse and pre-validate CSV
        try:
            # Try different encodings
            try:
                df = pd.read_csv(temp_file_path, encoding='utf-8', dtype=str)  # Force all columns to string
            except UnicodeDecodeError:
                df = pd.read_csv(temp_file_path, encoding='latin-1', dtype=str)  # Force all columns to string
            
            # Check if CSV has any rows
            if len(df) == 0:
                os.remove(temp_file_path)  # Clean up file
                current_app.logger.error("CSV has no data rows")
                return jsonify({'error': 'The CSV file contains no data rows'}), 400
            
            # Clean whitespace and handle missing values
            df = df.apply(lambda x: x.str.strip() if x.dtype == "object" else x)
            df = df.replace('', pd.NA)
            
            # PRE-VALIDATION: Check the entire file before processing
            is_valid, errors, warnings = pre_validate_csv(df)
            
            # Store file info in session for later processing
            session['upload_validation'] = {
                'token': upload_token,
                'file_path': temp_file_path,
                'total_rows': len(df),
                'teaching_period_id': teaching_period_id,
                'club_id': club.id,
                'filename': file.filename,
                'file_size': os.path.getsize(temp_file_path),
                'created_at': time.time()
            }
            
            # Return validation results
            return jsonify({
                'validation_token': upload_token,
                'total_rows': len(df),
                'filename': file.filename,
                'file_size': os.path.getsize(temp_file_path),
                'status': 'validation_complete',
                'is_valid': is_valid,
                'errors': errors,
                'warnings': warnings,
                'can_proceed': is_valid,  # Can only proceed if no critical errors
                'message': 'File validated successfully' if is_valid else 'Validation found issues'
            })
            
        except Exception as e:
            # Clean up file on error
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
            current_app.logger.error(f"CSV parsing error: {str(e)}")
            current_app.logger.error(traceback.format_exc())
            return jsonify({'error': f'Error parsing CSV: {str(e)}. Please check file format.'}), 400
            
    except Exception as e:
        current_app.logger.error(f"Error in bulk upload: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({
            'error': 'Server error during upload initialization',
            'details': str(e)
        }), 500

@club_management.route('/api/players/bulk-upload/<validation_token>/start', methods=['POST'])
@login_required
@admin_required
@verify_club_access()
def start_bulk_upload_processing(validation_token):
    """Start processing the validated CSV file"""
    
    # Get validation info from session
    validation_info = session.get('upload_validation')
    if not validation_info or validation_info.get('token') != validation_token:
        return jsonify({'error': 'Invalid or expired validation token'}), 404
    
    # Verify club ownership
    if validation_info['club_id'] != current_user.tennis_club_id:
        return jsonify({'error': 'Unauthorized access'}), 403
    
    # Check if file still exists
    if not os.path.exists(validation_info['file_path']):
        session.pop('upload_validation', None)
        return jsonify({'error': 'Upload file not found. Please upload again.'}), 404
    
    try:
        # Move validation info to processing info
        processing_token = str(uuid.uuid4())
        
        session['upload_info'] = {
            'token': processing_token,
            'file_path': validation_info['file_path'],
            'total_rows': validation_info['total_rows'],
            'processed_rows': 0,
            'teaching_period_id': validation_info['teaching_period_id'],
            'club_id': validation_info['club_id'],
            'students_created': 0,
            'students_updated': 0,
            'players_created': 0,
            'players_updated': 0,
            'warnings': [],
            'errors': [],
            'start_time': time.time()
        }
        
        # Clear validation session
        session.pop('upload_validation', None)
        
        # Return processing token
        return jsonify({
            'processing_token': processing_token,
            'status': 'ready_for_processing',
            'message': 'File ready for processing',
            'total_rows': validation_info['total_rows']
        })
        
    except Exception as e:
        current_app.logger.error(f"Error starting processing: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({
            'error': 'Error starting file processing',
            'details': str(e)
        }), 500

@club_management.route('/api/players/bulk-upload/<validation_token>/reject', methods=['POST'])
@login_required
@admin_required
@verify_club_access()
def reject_bulk_upload(validation_token):
    """Reject the validated CSV file and clean up"""
    
    # Get validation info from session
    validation_info = session.get('upload_validation')
    if not validation_info or validation_info.get('token') != validation_token:
        return jsonify({'error': 'Invalid or expired validation token'}), 404
    
    try:
        # Clean up file
        if os.path.exists(validation_info['file_path']):
            os.remove(validation_info['file_path'])
            current_app.logger.info(f"Cleaned up rejected file: {validation_info['file_path']}")
        
        # Clear session
        session.pop('upload_validation', None)
        
        return jsonify({
            'status': 'rejected',
            'message': 'File rejected and cleaned up successfully'
        })
        
    except Exception as e:
        current_app.logger.error(f"Error rejecting upload: {str(e)}")
        return jsonify({
            'error': 'Error cleaning up rejected file',
            'details': str(e)
        }), 500

@club_management.route('/api/players/bulk-upload/<token>/process', methods=['POST'])
@login_required
@admin_required 
@verify_club_access()
def process_csv_chunk(token):
    """Process a chunk of the uploaded CSV file with update capability"""
    
    # Get upload info from session
    upload_info = session.get('upload_info')
    if not upload_info or upload_info.get('token') != token:
        return jsonify({'error': 'Invalid or expired processing token'}), 404
    
    # Verify club ownership
    if upload_info['club_id'] != current_user.tennis_club_id:
        return jsonify({'error': 'Unauthorized access'}), 403
    
    # Check if file exists
    if not os.path.exists(upload_info['file_path']):
        if 'upload_info' in session:
            session.pop('upload_info')
        return jsonify({'error': 'Upload file not found'}), 404
    
    try:
        # Load CSV with string dtype to preserve leading zeros
        try:
            df = pd.read_csv(upload_info['file_path'], encoding='utf-8', dtype=str)
        except UnicodeDecodeError:
            df = pd.read_csv(upload_info['file_path'], encoding='latin-1', dtype=str)
        
        # Clean data
        df = df.apply(lambda x: x.str.strip() if x.dtype == "object" else x)
        df = df.replace('', pd.NA)
        
        # Determine batch size and indices
        BATCH_SIZE = 25  # Process 25 rows at a time
        start_idx = upload_info['processed_rows']
        end_idx = min(start_idx + BATCH_SIZE, upload_info['total_rows'])
        
        # Check if already completed
        if start_idx >= upload_info['total_rows']:
            # Clean up file
            if os.path.exists(upload_info['file_path']):
                os.remove(upload_info['file_path'])
            
            # Get final results
            result = {
                'status': 'completed',
                'processed_rows': upload_info['processed_rows'],
                'total_rows': upload_info['total_rows'],
                'students_created': upload_info['students_created'],
                'students_updated': upload_info['students_updated'],
                'players_created': upload_info['players_created'],
                'players_updated': upload_info['players_updated'],
                'progress_percentage': 100,
                'warnings': upload_info['warnings'][-50:],  # Only keep the last 50 warnings
                'errors': upload_info['errors'][-50:],      # Only keep the last 50 errors
                'has_more': False,
                'total_warnings': len(upload_info['warnings']),
                'total_errors': len(upload_info['errors'])
            }
            
            # Save complete errors and warnings to a file instead of keeping in session
            error_log_file = os.path.join(os.path.dirname(upload_info['file_path']), f"errors_{token}.json")
            with open(error_log_file, 'w') as f:
                json.dump({
                    'warnings': upload_info['warnings'],
                    'errors': upload_info['errors']
                }, f)
            
            # Clear session data
            session.pop('upload_info')
            
            return jsonify(result)
        
        # Process this batch
        batch_df = df.iloc[start_idx:end_idx]
        
        # Get cached data needed for this batch
        club_id = upload_info['club_id']
        teaching_period_id = upload_info['teaching_period_id']
        
        # Get coaches and groups
        coaches = {coach.email.lower(): coach for coach in 
         db.session.query(User).join(TennisClub).filter(
            TennisClub.organisation_id == current_user.tennis_club.organisation_id,
            User.is_active == True
        ).all()}
        
        groups = {group.name.lower(): group for group in 
                 TennisGroup.query.filter_by(
                    organisation_id=current_user.tennis_club.organisation_id
                ).order_by(TennisGroup.name).all()}
        
        # Get teaching period
        teaching_period = TeachingPeriod.query.get(teaching_period_id)
        
        # Process batch with validation and database update (allowing updates)
        batch_results = process_batch(
            batch_df, 
            club_id, 
            teaching_period, 
            coaches, 
            groups,
            allow_updates=True  # Enable updates for existing players
        )
        
        # Update progress
        upload_info['processed_rows'] = end_idx
        upload_info['students_created'] += batch_results['students_created']
        upload_info['students_updated'] += batch_results['students_updated']
        upload_info['players_created'] += batch_results['players_created']
        upload_info['players_updated'] += batch_results['players_updated']
        upload_info['warnings'].extend(batch_results['warnings'])
        upload_info['errors'].extend(batch_results['errors'])
        
        # Calculate progress percentage
        progress = int((end_idx / upload_info['total_rows']) * 100)
        
        # To prevent session overflow, only keep the most recent errors and warnings
        if len(upload_info['warnings']) > 100:
            upload_info['warnings'] = upload_info['warnings'][-100:]
        if len(upload_info['errors']) > 100:
            upload_info['errors'] = upload_info['errors'][-100:]
        
        # Update session
        session['upload_info'] = upload_info
        
        # Return updated status
        return jsonify({
            'status': 'processing',
            'processed_rows': end_idx,
            'total_rows': upload_info['total_rows'],
            'students_created': upload_info['students_created'],
            'students_updated': upload_info['students_updated'],
            'players_created': upload_info['players_created'],
            'players_updated': upload_info['players_updated'],
            'progress_percentage': progress,
            'warnings': batch_results['warnings'],
            'errors': batch_results['errors'],
            'has_more': end_idx < upload_info['total_rows'],
            'elapsed_time': round(time.time() - upload_info['start_time'])
        })
        
    except Exception as e:
        # Log error
        current_app.logger.error(f"Error processing batch: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        
        # Instead of storing in session, log to file
        error_log_file = os.path.join(os.path.dirname(upload_info.get('file_path', '/tmp')), f"error_{token}.log")
        with open(error_log_file, 'a') as f:
            f.write(f"Error processing batch: {str(e)}\n")
            f.write(traceback.format_exc())
        
        # Return error
        return jsonify({
            'status': 'error',
            'error': f'Error processing batch: {str(e)}',
            'has_more': False
        }), 500
    
@club_management.route('/api/players', methods=['POST'])
@login_required
@admin_required
@verify_club_access()
def create_player():
    """API endpoint for creating a new player"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        club_id = current_user.tennis_club_id
        organisation_id = current_user.tennis_club.organisation_id

        # Validate data
        required_fields = ['student_name', 'contact_email', 'coach_id', 'group_id', 'group_time_id', 'teaching_period_id']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        # CHANGED: Verify coach belongs to organisation (not just club)
        coach = User.query.join(TennisClub).filter(
            User.id == data['coach_id'],
            TennisClub.organisation_id == organisation_id
        ).first()
        if not coach:
            return jsonify({'error': 'Invalid coach selected - coach must be from your organisation'}), 400

        # Verify group belongs to organisation
        group = TennisGroup.query.get(data['group_id'])
        if not group or group.organisation_id != organisation_id:
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
                contact_number=data.get('contact_number'),
                emergency_contact_number=data.get('emergency_contact_number'),
                medical_information=data.get('medical_information'),
                tennis_club_id=club_id
            )
            if data.get('date_of_birth'):
                try:
                    student.date_of_birth = datetime.strptime(data['date_of_birth'], '%Y-%m-%d').date()
                except ValueError:
                    return jsonify({'error': 'Invalid date format'}), 400
            
            db.session.add(student)
            db.session.flush()
        else:
            # Update existing student information
            student.contact_email = data['contact_email']
            if 'contact_number' in data:
                student.contact_number = data.get('contact_number')
            if 'emergency_contact_number' in data:
                student.emergency_contact_number = data.get('emergency_contact_number')
            if 'medical_information' in data:
                student.medical_information = data.get('medical_information')
            if data.get('date_of_birth'):
                try:
                    student.date_of_birth = datetime.strptime(data['date_of_birth'], '%Y-%m-%d').date()
                except ValueError:
                    return jsonify({'error': 'Invalid date format'}), 400

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

        # Create programme player assignment with walk_home field
        assignment = ProgrammePlayers(
            student_id=student.id,
            coach_id=data['coach_id'],
            group_id=data['group_id'],
            group_time_id=data['group_time_id'],
            teaching_period_id=data['teaching_period_id'],
            tennis_club_id=club_id,
            walk_home=data.get('walk_home'),
            notes=data.get('notes') 
        )

        db.session.add(assignment)
        db.session.commit()

        # ADDED: Include coach info in response for confirmation
        return jsonify({
            'message': 'Player added successfully',
            'id': assignment.id,
            'coach_info': {
                'name': coach.name,
                'club': coach.tennis_club.name,
                'is_external': coach.tennis_club_id != club_id
            }
        })

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating player: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 400
    
@club_management.route('/api/players/<int:player_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required
@admin_required
@verify_club_access()
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
                'contact_email': player.student.contact_email,
                'contact_number': player.student.contact_number,
                'emergency_contact_number': player.student.emergency_contact_number,
                'medical_information': player.student.medical_information
            },
            'coach_id': player.coach_id,
            'group_id': player.group_id,
            'group_time_id': player.group_time_id,
            'teaching_period_id': player.teaching_period_id,
            'walk_home': player.walk_home,
            'notes': player.notes,
            # ADDED: Include coach details for display
            'coach_info': {
                'name': player.coach.name,
                'club': player.coach.tennis_club.name,
                'is_external': player.coach.tennis_club_id != player.tennis_club_id
            }
        }
        return jsonify(response_data)

    elif request.method == 'PUT':
        try:
            data = request.get_json()
            
            if not data:
                return jsonify({'error': 'No data provided'}), 400

            organisation_id = current_user.tennis_club.organisation_id

            # Update student details
            player.student.name = data['student_name']
            player.student.contact_email = data['contact_email']
            
            # Update the new fields
            if 'contact_number' in data:
                player.student.contact_number = data.get('contact_number')
            if 'emergency_contact_number' in data:
                player.student.emergency_contact_number = data.get('emergency_contact_number')
            if 'medical_information' in data:
                player.student.medical_information = data.get('medical_information')
                
            if data.get('date_of_birth'):
                try:
                    player.student.date_of_birth = datetime.strptime(data['date_of_birth'], '%Y-%m-%d').date()
                except ValueError:
                    return jsonify({'error': 'Invalid date format'}), 400

            # CHANGED: Verify coach belongs to organisation (not just club)
            coach = User.query.join(TennisClub).filter(
                User.id == data['coach_id'],
                TennisClub.organisation_id == organisation_id
            ).first()
            if not coach:
                return jsonify({'error': 'Invalid coach selected - coach must be from your organisation'}), 400

            # Verify group belongs to organisation
            group = TennisGroup.query.get(data['group_id'])
            if not group or group.organisation_id != organisation_id:
                return jsonify({'error': 'Invalid group selected'}), 400

            # Verify group time belongs to group and club
            if data.get('group_time_id'):
                group_time = TennisGroupTimes.query.get(data['group_time_id'])
                if not group_time or group_time.tennis_club_id != current_user.tennis_club_id or group_time.group_id != group.id:
                    return jsonify({'error': 'Invalid group time selected'}), 400

            # Update assignments
            player.coach_id = coach.id
            player.group_id = group.id
            player.group_time_id = data.get('group_time_id')
            
            # Update walk_home field
            if 'walk_home' in data:
                player.walk_home = data.get('walk_home')

            if 'notes' in data:
                player.notes = data.get('notes')
            
            db.session.commit()
            
            # ADDED: Include updated coach info in response
            return jsonify({
                'message': 'Player updated successfully',
                'coach_info': {
                    'name': coach.name,
                    'club': coach.tennis_club.name,
                    'is_external': coach.tennis_club_id != current_user.tennis_club_id
                }
            })
            
        except KeyError as e:
            return jsonify({'error': f'Missing required field: {str(e)}'}), 400
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error updating player: {str(e)}")
            current_app.logger.error(traceback.format_exc())
            return jsonify({'error': str(e)}), 400

    elif request.method == 'DELETE':
        try:
            # First, delete any associated reports
            reports = Report.query.filter_by(programme_player_id=player.id).all()
            for report in reports:
                db.session.delete(report)
            
            # Also need to delete any register entries associated with this player
            register_entries = RegisterEntry.query.filter_by(programme_player_id=player.id).all()
            for entry in register_entries:
                db.session.delete(entry)
            
            # Now delete the player
            db.session.delete(player)
            db.session.commit()
            return jsonify({'message': 'Player and associated data removed successfully'})
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error deleting player: {str(e)}")
            return jsonify({'error': f'Failed to remove player: {str(e)}'}), 400
        
@club_management.route('/api/groups/<int:group_id>/times')
@login_required
@admin_required
@verify_club_access()
def get_group_times(group_id):
    """API endpoint for getting all time slots for a specific group"""
    try:
        
        # Verify group belongs to user's club
        group = TennisGroup.query.filter_by(
            id=group_id,
            organisation_id=current_user.tennis_club.organisation_id 
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
    
@club_management.route('/api/template/download')
@login_required
@admin_required
@verify_club_access()
def download_template():
    """API endpoint for downloading the updated CSV template with Y/N walk_home format"""
    club = TennisClub.query.get_or_404(current_user.tennis_club_id)
    
    csv_content = [
        "student_name,date_of_birth,contact_email,contact_number,emergency_contact_number,medical_information,coach_email,group_name,day_of_week,start_time,end_time,walk_home,notes",
        "John Smith,05-Nov-2013,parent@example.com,07123456789,07987654321,Asthma,coach@example.com,Red 1,Monday,16:00,17:00,Y,Prefers to be called Johnny",
        "Emma Jones,22-Mar-2014,emma.parent@example.com,07111222333,07444555666,,coach@example.com,Red 2,Tuesday,15:30,16:30,N,Left-handed player",
        "Alex Brown,15-Jun-2012,alex.parent@example.com,07999888777,,,coach@example.com,Blue 1,Wednesday,17:00,18:00,,Has older sibling in Yellow group",
    ]
    
    response = make_response("\n".join(csv_content))
    response.headers["Content-Type"] = "text/csv"
    response.headers["Content-Disposition"] = f"attachment; filename=player_template_{club.name.lower().replace(' ', '_')}.csv"
    
    return response

@club_management.route('/api/players/export/<int:teaching_period_id>')
@login_required
@admin_required
@verify_club_access()
def export_players(teaching_period_id):
    """Export all players for a specific teaching period as CSV"""
    
    try:
        # Validate teaching period belongs to user's club
        teaching_period = TeachingPeriod.query.filter_by(
            id=teaching_period_id,
            tennis_club_id=current_user.tennis_club_id
        ).first_or_404()
        
        # Query all programme players for this teaching period
        players = ProgrammePlayers.query.filter_by(
            teaching_period_id=teaching_period_id,
            tennis_club_id=current_user.tennis_club_id
        ).all()
        
        if not players:
            return jsonify({'error': 'No players found for this teaching period'}), 404
        
        # Create CSV data
        output = StringIO()
        writer = csv.writer(output)
        
        # Add CSV header - using same format as the template download
        writer.writerow([
            "student_name", "date_of_birth", "contact_email", "contact_number", 
            "emergency_contact_number", "medical_information", "coach_email", "group_name", 
            "day_of_week", "start_time", "end_time", "walk_home", "notes"
        ])
        
        # Add player data
        for player in players:
            student = player.student
            coach = player.coach
            group = player.tennis_group
            group_time = player.group_time
            
            row = [
                student.name,
                student.date_of_birth.strftime('%Y-%m-%d') if student.date_of_birth else '',
                student.contact_email or '',
                student.contact_number or '',
                student.emergency_contact_number or '',
                student.medical_information or '',
                coach.email,
                group.name,
            ]
            
            # Add time slot info if available
            if group_time:
                row.extend([
                    group_time.day_of_week.value,
                    group_time.start_time.strftime('%H:%M'),
                    group_time.end_time.strftime('%H:%M'),
                ])
            else:
                row.extend(['', '', ''])
                
            # Add walk home status
            walk_home_value = ''
            if player.walk_home is not None:
                walk_home_value = 'true' if player.walk_home else 'false'
            row.append(walk_home_value)
            
            # Add notes
            row.append(player.notes or '')
            
            writer.writerow(row)
        
        # Create response
        club = TennisClub.query.get_or_404(current_user.tennis_club_id)
        safe_club_name = club.name.lower().replace(' ', '_')
        safe_period_name = teaching_period.name.lower().replace(' ', '_')
        filename = f"{safe_club_name}_{safe_period_name}_players.csv"
        
        response = make_response(output.getvalue())
        response.headers["Content-Type"] = "text/csv"
        response.headers["Content-Disposition"] = f"attachment; filename={filename}"
        
        return response
        
    except Exception as e:
        current_app.logger.error(f"Error exporting players: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
    
@club_management.route('/api/super-admin/create-club', methods=['POST'])
@login_required
@verify_club_access()
def create_club():
    """API endpoint for super admins to create new tennis clubs"""
    if not current_user.is_super_admin:
        return jsonify({'error': 'Unauthorized. Super admin privileges required.'}), 403
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        # Validate required fields
        name = data.get('name', '').strip()
        subdomain = data.get('subdomain', '').strip()
        organisation_id = data.get('organisation_id')
        
        if not name:
            return jsonify({'error': 'Club name is required'}), 400
        if not subdomain:
            return jsonify({'error': 'Subdomain is required'}), 400
        if not organisation_id:
            return jsonify({'error': 'Organization is required'}), 400
            
        # Validate subdomain format
        import re
        if not re.match(r'^[a-z0-9-]+$', subdomain):
            return jsonify({'error': 'Subdomain can only contain lowercase letters, numbers, and hyphens'}), 400
        
        # Check if subdomain already exists
        existing_club = TennisClub.query.filter_by(subdomain=subdomain).first()
        if existing_club:
            return jsonify({'error': f'Subdomain "{subdomain}" is already in use'}), 400
        
        # Verify organisation exists
        from app.models import Organisation
        organisation = Organisation.query.get(organisation_id)
        if not organisation:
            return jsonify({'error': 'Invalid organization selected'}), 400
        
        # Create the new club
        club = TennisClub(
            name=name,
            subdomain=subdomain,
            organisation_id=organisation_id
        )
        
        db.session.add(club)
        db.session.flush()  # Get the club ID
        
        # Create initial teaching period
        setup_initial_teaching_period(club.id)
        
        db.session.commit()
        
        current_app.logger.info(f"Created new club: {club.name} (ID: {club.id}) in organization: {organisation.name}")
        
        return jsonify({
            'message': f'Tennis club "{club.name}" created successfully in "{organisation.name}"',
            'club': {
                'id': club.id,
                'name': club.name,
                'subdomain': club.subdomain,
                'organisation': {
                    'id': organisation.id,
                    'name': organisation.name
                }
            }
        }), 201
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating tennis club: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
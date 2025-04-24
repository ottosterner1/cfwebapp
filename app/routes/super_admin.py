from flask import Blueprint, request, jsonify, current_app, abort, make_response
from flask_login import login_required, current_user
from app.models import TennisClub, TennisGroup, TennisGroupTimes, DayOfWeek
from app import db
import pandas as pd
import io
import os
import traceback
from datetime import datetime

super_admin_routes = Blueprint('super_admin', __name__, url_prefix='/clubs/api/super-admin')

@super_admin_routes.before_request
def verify_super_admin():
    """Ensure only super admins can access these routes"""
    if not current_user.is_super_admin:
        abort(403, 'Super admin privileges required')

@super_admin_routes.route('/import-groups', methods=['POST'])
@login_required
def import_groups():
    """
    Import groups and time slots from a CSV file
    Expected CSV format:
    group_name,group_description,day_of_week,start_time,end_time,capacity
    Red 1,Beginners Red Ball,Monday,16:00,17:00,10
    """
    try:
        # Get the club_id from the form data
        club_id = request.form.get('club_id')
        if not club_id:
            return jsonify({'error': 'Missing club ID'}), 400
            
        club_id = int(club_id)
        
        # Verify club exists
        club = TennisClub.query.get(club_id)
        if not club:
            return jsonify({'error': 'Tennis club not found'}), 404
        
        # Get the uploaded file
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
            
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
            
        if not file.filename.lower().endswith('.csv'):
            return jsonify({'error': 'Only CSV files are allowed'}), 400
        
        # Read the CSV file
        try:
            # Try different encodings
            try:
                df = pd.read_csv(file, encoding='utf-8')
            except UnicodeDecodeError:
                file.seek(0)  # Reset file pointer
                df = pd.read_csv(file, encoding='latin-1')
                
            # Clean whitespace and handle missing values
            df = df.apply(lambda x: x.str.strip() if x.dtype == "object" else x)
            df = df.replace('', pd.NA)
            
            # Verify required columns
            required_columns = ['group_name', 'day_of_week', 'start_time', 'end_time']
            missing_columns = [col for col in required_columns if col not in df.columns]
            
            if missing_columns:
                current_app.logger.error(f"Missing columns: {', '.join(missing_columns)}")
                return jsonify({
                    'error': 'Missing required columns in CSV file', 
                    'details': f"The following columns are required: {', '.join(missing_columns)}"
                }), 400
                
            # Check if CSV has any rows
            if len(df) == 0:
                return jsonify({'error': 'The CSV file contains no data rows'}), 400
                
            # Process each row
            groups_created = 0
            time_slots_created = 0
            warnings = []
            errors = []
            
            # Dictionary to track already processed groups
            processed_groups = {}
            
            # Process each row in the dataframe
            for index, row in df.iterrows():
                try:
                    row_num = index + 2  # +2 for header row and 0-indexing
                    
                    # Get group name and description
                    group_name = row['group_name']
                    group_description = row.get('group_description', '')
                    
                    if pd.isna(group_name):
                        errors.append(f"Row {row_num}: Missing group name")
                        continue
                    
                    # Get or create the group
                    if group_name in processed_groups:
                        # Use the already created/found group
                        group = processed_groups[group_name]
                    else:
                        # Check if group already exists
                        group = TennisGroup.query.filter_by(
                            name=group_name,
                            tennis_club_id=club_id
                        ).first()
                        
                        if not group:
                            # Create a new group
                            group = TennisGroup(
                                name=group_name,
                                description=group_description,
                                tennis_club_id=club_id
                            )
                            db.session.add(group)
                            db.session.flush()  # Get group.id without committing
                            groups_created += 1
                        
                        # Store in processed groups
                        processed_groups[group_name] = group
                    
                    # Parse day of week
                    day_of_week_str = row['day_of_week']
                    if pd.isna(day_of_week_str):
                        errors.append(f"Row {row_num}: Missing day of week")
                        continue
                        
                    try:
                        # First try exact enum name match
                        day_enum = DayOfWeek[day_of_week_str.upper()]
                    except KeyError:
                        try:
                            # Try to match by enum value (e.g., Monday, Tuesday)
                            day_enum = next((d for d in DayOfWeek if d.value.upper() == day_of_week_str.upper()), None)
                            
                            if not day_enum:
                                valid_days = ', '.join([d.name for d in DayOfWeek])
                                errors.append(f"Row {row_num}: Invalid day of week '{day_of_week_str}'. Must be one of: {valid_days}")
                                continue
                        except Exception as day_err:
                            errors.append(f"Row {row_num}: Invalid day of week '{day_of_week_str}'")
                            continue
                    
                    # Parse time values
                    start_time_str = row['start_time']
                    end_time_str = row['end_time']
                    
                    if pd.isna(start_time_str) or pd.isna(end_time_str):
                        errors.append(f"Row {row_num}: Missing start or end time")
                        continue
                        
                    try:
                        start_time = datetime.strptime(str(start_time_str), '%H:%M').time()
                        end_time = datetime.strptime(str(end_time_str), '%H:%M').time()
                        
                        if start_time >= end_time:
                            errors.append(f"Row {row_num}: End time must be after start time")
                            continue
                    except ValueError as e:
                        errors.append(f"Row {row_num}: Invalid time format. Use HH:MM format.")
                        continue
                    
                    # Parse capacity (optional)
                    capacity = None
                    if 'capacity' in row and not pd.isna(row['capacity']):
                        try:
                            capacity = int(row['capacity'])
                            if capacity <= 0:
                                warnings.append(f"Row {row_num}: Capacity must be a positive number, got {capacity}")
                                capacity = None
                        except ValueError:
                            warnings.append(f"Row {row_num}: Invalid capacity value '{row['capacity']}', must be a number")
                    
                    # Check if the time slot already exists
                    existing_time_slot = TennisGroupTimes.query.filter_by(
                        group_id=group.id,
                        day_of_week=day_enum,
                        start_time=start_time,
                        end_time=end_time,
                        tennis_club_id=club_id
                    ).first()
                    
                    if existing_time_slot:
                        warnings.append(f"Row {row_num}: Time slot already exists for '{group_name}' on {day_enum.value} at {start_time}-{end_time}")
                        continue
                    
                    # Create the time slot
                    time_slot = TennisGroupTimes(
                        group_id=group.id,
                        day_of_week=day_enum,
                        start_time=start_time,
                        end_time=end_time,
                        capacity=capacity,
                        tennis_club_id=club_id
                    )
                    
                    db.session.add(time_slot)
                    time_slots_created += 1
                    
                except Exception as e:
                    errors.append(f"Row {row_num}: {str(e)}")
            
            # Commit all changes if there were no errors
            if len(errors) == 0 or (groups_created > 0 or time_slots_created > 0):
                db.session.commit()
                
                return jsonify({
                    'message': f'Successfully imported {groups_created} groups and {time_slots_created} time slots',
                    'groups_created': groups_created,
                    'time_slots_created': time_slots_created,
                    'warnings': warnings,
                    'errors': errors
                })
            else:
                db.session.rollback()
                return jsonify({
                    'error': 'Failed to import any groups or time slots',
                    'warnings': warnings,
                    'errors': errors
                }), 400
                
        except pd.errors.ParserError as e:
            current_app.logger.error(f"CSV parsing error: {str(e)}")
            return jsonify({'error': f'Error parsing CSV: {str(e)}. Please check file format.'}), 400
            
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error importing groups: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@super_admin_routes.route('/groups-template', methods=['GET'])
@login_required
def get_groups_template():
    """Get a CSV template for groups and time slots"""
    try:
        csv_content = [
            "group_name,group_description,day_of_week,start_time,end_time,capacity",
            "Red 1,Beginners Red Ball,Monday,16:00,17:00,10",
            "Red 1,Beginners Red Ball,Wednesday,16:00,17:00,10",
            "Orange,Intermediate Orange Ball,Tuesday,17:00,18:00,8",
            "Green,Advanced Green Ball,Thursday,17:30,18:30,8",
            "Yellow,Elite Squad,Friday,18:00,19:30,6"
        ]
        
        response = make_response("\n".join(csv_content))
        response.headers["Content-Type"] = "text/csv"
        response.headers["Content-Disposition"] = "attachment; filename=groups_template.csv"
        
        return response
    except Exception as e:
        current_app.logger.error(f"Error generating template: {str(e)}")
        return jsonify({'error': 'Failed to generate template'}), 500
from flask import Blueprint, request, jsonify, current_app, abort, make_response
from flask_login import login_required, current_user
from sqlalchemy import distinct
from app.models import TennisClub, TennisGroup, TennisGroupTimes, DayOfWeek
from app import db
import pandas as pd
import io
import os
import traceback
from datetime import datetime
from app.models.club_feature import ClubFeature
from app.models.core import User
from app.utils.feature_types import FeatureType

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
        
        # ADDED: Verify club has an organisation
        if not club.organisation_id:
            return jsonify({'error': 'Club must be assigned to an organisation first'}), 400
        
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
                        # CHANGED: Check if group already exists in the organisation
                        group = TennisGroup.query.filter_by(
                            name=group_name,
                            organisation_id=club.organisation_id  # CHANGED: Use club.organisation_id
                        ).first()
                        
                        if not group:
                            # CHANGED: Create a new group with organisation_id instead of tennis_club_id
                            group = TennisGroup(
                                name=group_name,
                                description=group_description,
                                organisation_id=club.organisation_id  # CHANGED: Use organisation_id
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
                    
                    # TennisGroupTimes creation remains the same (still club-level)
                    existing_time_slot = TennisGroupTimes.query.filter_by(
                        group_id=group.id,
                        day_of_week=day_enum,
                        start_time=start_time,
                        end_time=end_time,
                        tennis_club_id=club_id  # Still club-level
                    ).first()
                    
                    if existing_time_slot:
                        warnings.append(f"Row {row_num}: Time slot already exists for '{group_name}' on {day_enum.value} at {start_time}-{end_time}")
                        continue
                    
                    # Create the time slot (still club-level)
                    time_slot = TennisGroupTimes(
                        group_id=group.id,
                        day_of_week=day_enum,
                        start_time=start_time,
                        end_time=end_time,
                        capacity=capacity,
                        tennis_club_id=club_id  # Still club-level
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
    
@super_admin_routes.route('/clubs/<int:club_id>/features', methods=['GET'])
@login_required
def get_club_features(club_id):
    """Get all feature settings for a club"""
    if not current_user.is_super_admin:
        return jsonify({'error': 'Unauthorized'}), 403
        
    club = TennisClub.query.get_or_404(club_id)
    
    # Get all defined features
    all_features = FeatureType.get_all_features()
    
    # Get current settings from database
    club_features = ClubFeature.query.filter_by(tennis_club_id=club_id).all()
    
    # Create a map for easier lookup
    features_map = {f.feature_name: f.is_enabled for f in club_features}
    
    # Combine all defined features with their current settings
    result = []
    for feature in all_features:
        result.append({
            'name': feature['name'],
            'display_name': feature['display_name'],
            'description': feature['description'],
            'icon': feature.get('icon', ''),
            'is_enabled': features_map.get(feature['name'], True)  # Default to True if not found
        })
    
    # CHANGED: Add organization context
    response_data = {
        'features': result,
        'club': {
            'id': club.id,
            'name': club.name,
            'organisation': {
                'id': club.organisation.id,
                'name': club.organisation.name,
                'slug': club.organisation.slug
            } if club.organisation else None
        }
    }
    
    return jsonify(response_data)

@super_admin_routes.route('/clubs/<int:club_id>/features', methods=['PUT'])
@login_required
def update_club_features(club_id):
    """Update feature settings for a club"""
    if not current_user.is_super_admin:
        return jsonify({'error': 'Unauthorized'}), 403
        
    club = TennisClub.query.get_or_404(club_id)
    
    data = request.get_json()
    if not data or not isinstance(data, list):
        return jsonify({'error': 'Invalid data format'}), 400
        
    try:
        # Process each feature in the request
        for feature_data in data:
            feature_name = feature_data.get('name')
            is_enabled = feature_data.get('is_enabled', True)
            
            if not feature_name:
                continue
                
            # Find existing feature or create new one
            feature = ClubFeature.query.filter_by(
                tennis_club_id=club_id,
                feature_name=feature_name
            ).first()
            
            if feature:
                # Update existing
                feature.is_enabled = is_enabled
            else:
                # Create new
                feature = ClubFeature(
                    tennis_club_id=club_id,
                    feature_name=feature_name,
                    is_enabled=is_enabled
                )
                db.session.add(feature)
                
        db.session.commit()
        return jsonify({'message': 'Features updated successfully'})
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating features: {str(e)}")
        return jsonify({'error': str(e)}), 500
    
@super_admin_routes.route('/organisations/stats', methods=['GET'])
@login_required
def get_organisation_stats():
    """Get organisation statistics for super admin dashboard"""
    if not current_user.is_super_admin:
        return jsonify({'error': 'Unauthorized'}), 403
    
    try:
        from app.models import Organisation, ReportTemplate
        from sqlalchemy import func
        
        # Get organisation statistics
        org_stats = (db.session.query(
            Organisation.id,
            Organisation.name,
            Organisation.slug,
            func.count(TennisClub.id).label('club_count'),
            func.count(distinct(User.id)).label('user_count')
        )
        .outerjoin(TennisClub, Organisation.id == TennisClub.organisation_id)
        .outerjoin(User, TennisClub.id == User.tennis_club_id)
        .group_by(Organisation.id, Organisation.name, Organisation.slug)
        .order_by(Organisation.name)
        .all())
        
        # Get template counts per organisation
        template_counts = (db.session.query(
            Organisation.id,
            func.count(ReportTemplate.id).label('template_count')
        )
        .outerjoin(ReportTemplate, Organisation.id == ReportTemplate.organisation_id)
        .filter(ReportTemplate.is_active == True)
        .group_by(Organisation.id)
        .all())
        
        template_count_dict = {t[0]: t[1] for t in template_counts}
        
        # Get clubs without organisation
        clubs_without_org = TennisClub.query.filter_by(organisation_id=None).count()
        
        result = {
            'organisations': [{
                'id': org.id,
                'name': org.name,
                'slug': org.slug,
                'club_count': org.club_count,
                'user_count': org.user_count,
                'template_count': template_count_dict.get(org.id, 0)
            } for org in org_stats],
            'clubs_without_organisation': clubs_without_org,
            'total_organisations': len(org_stats)
        }
        
        return jsonify(result)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching organisation stats: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

# 3. Add route to assign clubs to organisations
@super_admin_routes.route('/clubs/<int:club_id>/assign-organisation', methods=['PUT'])
@login_required
def assign_club_to_organisation(club_id):
    """Assign a club to an organisation"""
    if not current_user.is_super_admin:
        return jsonify({'error': 'Unauthorized'}), 403
    
    try:
        from app.models import Organisation
        
        club = TennisClub.query.get_or_404(club_id)
        data = request.get_json()
        
        if not data or 'organisation_id' not in data:
            return jsonify({'error': 'Organisation ID is required'}), 400
        
        organisation_id = data['organisation_id']
        
        # Verify organisation exists
        organisation = Organisation.query.get_or_404(organisation_id)
        
        old_org_name = club.organisation.name if club.organisation else 'None'
        club.organisation_id = organisation_id
        
        db.session.commit()
        
        current_app.logger.info(f"Assigned club {club.name} from {old_org_name} to {organisation.name}")
        
        return jsonify({
            'message': f'Club "{club.name}" assigned to organisation "{organisation.name}"',
            'club': {
                'id': club.id,
                'name': club.name,
                'organisation': {
                    'id': organisation.id,
                    'name': organisation.name,
                    'slug': organisation.slug
                }
            }
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error assigning club to organisation: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
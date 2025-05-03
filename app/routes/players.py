from flask import Blueprint, jsonify, make_response, request, render_template, flash, redirect, session, url_for, current_app
from flask_login import login_required, current_user
from app.models import (
    ProgrammePlayers, Student, TennisGroup, TennisGroupTimes, TeachingPeriod, 
    User, Report, DayOfWeek, GroupTemplate, TennisClub, UserRole
)
from app import db
from app.utils.auth import admin_required
from app.clubs.middleware import verify_club_access
from sqlalchemy import and_, or_, func, text
from datetime import datetime
import traceback
import pandas as pd
import time
import uuid
import os

player_routes = Blueprint('players', __name__, url_prefix='/api')

def parse_date(date_str):
    """Parse date from either YYYY-MM-DD or DD-MMM-YYYY format"""
    
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

def process_batch(batch_df, club_id, teaching_period, coaches, groups):
    """Process a batch of CSV rows with validation and database updates"""
    
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
            row_data['student_name'] = row['student_name']
            
            # Validate contact email
            if pd.isna(row['contact_email']):
                batch_errors.append(f"Row {row_number}: Missing contact email for {row['student_name']}")
                continue
            row_data['contact_email'] = row['contact_email']
            
            # Validate coach
            if pd.isna(row['coach_email']):
                batch_errors.append(f"Row {row_number}: Missing coach email for {row['student_name']}")
                continue
                
            coach_email = str(row['coach_email']).lower()
            if coach_email not in coaches:
                batch_errors.append(f"Row {row_number}: Coach with email {row['coach_email']} not found")
                continue
            row_data['coach'] = coaches[coach_email]
            
            # Validate group
            if pd.isna(row['group_name']):
                batch_errors.append(f"Row {row_number}: Missing group name for {row['student_name']}")
                continue
                
            group_name = str(row['group_name']).lower()
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
            
            # Parse time values
            if pd.isna(row['start_time']) or pd.isna(row['end_time']):
                batch_errors.append(f"Row {row_number}: Missing start or end time for {row['student_name']}")
                continue
                
            try:
                start_time = datetime.strptime(str(row['start_time']), '%H:%M').time()
                end_time = datetime.strptime(str(row['end_time']), '%H:%M').time()
                
                if start_time >= end_time:
                    batch_errors.append(f"Row {row_number}: End time must be after start time")
                    continue
                    
                row_data['start_time'] = start_time
                row_data['end_time'] = end_time
            except ValueError as e:
                batch_errors.append(f"Row {row_number}: Invalid time format. Use HH:MM. Error: {str(e)}")
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
            
            # Add to valid rows
            valid_rows.append(row_data)
            
        except Exception as e:
            batch_errors.append(f"Row {index + 2}: Unexpected error: {str(e)}")
    
    # Process valid rows in a single transaction
    batch_students_created = 0
    batch_players_created = 0
    
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
                            tennis_club_id=club_id
                        )
                        db.session.add(student)
                        db.session.flush()  # Get student.id
                        batch_students_created += 1

                    # Check if player assignment already exists
                    existing_player = ProgrammePlayers.query.filter_by(
                        student_id=student.id,
                        group_id=row_data['group'].id,
                        group_time_id=row_data['group_time'].id,
                        teaching_period_id=teaching_period.id,
                        tennis_club_id=club_id
                    ).first()

                    if existing_player:
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
                        tennis_club_id=club_id
                    )
                    db.session.add(player)
                    batch_players_created += 1
                    
            # Commit the outer transaction
            db.session.commit()
            
        except Exception as e:
            # Make sure to rollback
            db.session.rollback()
            batch_errors.append(f"Database error: {str(e)}")
    
    # Return batch results
    return {
        'students_created': batch_students_created,
        'players_created': batch_players_created,
        'warnings': batch_warnings,
        'errors': batch_errors
    }

@player_routes.route('/programme-players')
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
            Student.contact_number,
            Student.emergency_contact_number, 
            Student.medical_information,
            TennisGroup.name.label('group_name'),
            TennisGroup.id.label('group_id'),
            ProgrammePlayers.teaching_period_id,
            ProgrammePlayers.group_time_id,
            ProgrammePlayers.walk_home,
            TennisGroupTimes.day_of_week,
            TennisGroupTimes.start_time,
            TennisGroupTimes.end_time,
            TennisGroupTimes.capacity,
            Report.id.label('report_id'),
            Report.coach_id,
            Report.is_draft.label('is_draft'),
            ProgrammePlayers.coach_id.label('assigned_coach_id'),
            func.count(GroupTemplate.id).label('template_count')
        ).group_by(
            ProgrammePlayers.id,
            Student.name,
            Student.contact_number,
            Student.emergency_contact_number,
            Student.medical_information,
            TennisGroup.name,
            TennisGroup.id,
            ProgrammePlayers.teaching_period_id,
            ProgrammePlayers.group_time_id,
            ProgrammePlayers.walk_home,
            TennisGroupTimes.day_of_week,
            TennisGroupTimes.start_time,
            TennisGroupTimes.end_time,
            TennisGroupTimes.capacity,
            Report.id,
            Report.coach_id,
            Report.is_draft,
            ProgrammePlayers.coach_id
        ).order_by(
            ProgrammePlayers.group_id,
            Student.name
        ).all()
        
        return jsonify([{
            'id': player.id,
            'student_name': player.student_name,
            'contact_number': player.contact_number,
            'emergency_contact_number': player.emergency_contact_number,
            'medical_information': player.medical_information,
            'group_name': player.group_name,
            'group_id': player.group_id,
            'teaching_period_id': player.teaching_period_id,
            'group_time_id': player.group_time_id,
            'walk_home': player.walk_home,
            'time_slot': {
                'day_of_week': player.day_of_week.value if player.day_of_week else None,
                'start_time': player.start_time.strftime('%H:%M') if player.start_time else None,
                'end_time': player.end_time.strftime('%H:%M') if player.end_time else None,
                'capacity': player.capacity
            } if player.day_of_week else None,
            'report_status': 'draft' if player.is_draft else ('submitted' if player.report_id is not None else 'pending'),
            'report_submitted': player.report_id is not None and not player.is_draft,
            'has_draft': player.report_id is not None and player.is_draft,
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

@player_routes.route('/programme-players/next/<int:current_player_id>')
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

@player_routes.route('/groups')
@login_required
@admin_required
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


@player_routes.route('/group-recommendations/players', methods=['GET'])
def get_group_recommendation_players():
    """
    Get player IDs that are recommended for a specific group.
    This endpoint is used to support filtering the dashboard by group recommendation.
    
    Query Parameters:
    - to_group: The name of the target group for recommendations
    - period: The teaching period ID
    
    Returns:
    - A list of player IDs that are recommended for the specified group
    """
    to_group = request.args.get('to_group')
    period_id = request.args.get('period')

    if not to_group or not period_id:
        return jsonify({'error': 'Missing required parameters'}), 400

    try:

        # Simplified query that avoids reserved keywords
        sql_query = text("""
            SELECT pp.id
            FROM programme_players pp
            JOIN report r ON r.programme_player_id = pp.id
            JOIN tennis_group tg ON r.recommended_group_id = tg.id
            WHERE tg.name = :to_group
            AND r.teaching_period_id = :period_id
        """)

        # Execute the query with parameters
        result = db.session.execute(
            sql_query, 
            {'to_group': to_group, 'period_id': period_id}
        )

        # Extract just the IDs
        player_id_list = [row[0] for row in result]

        # If we found no results, try a debug query to see what recommendations exist
        if not player_id_list:
            debug_query = text("""
                SELECT tg.name as recommended_group, COUNT(*) as count
                FROM report r
                JOIN tennis_group tg ON r.recommended_group_id = tg.id  
                WHERE r.teaching_period_id = :period_id
                GROUP BY tg.name
                ORDER BY count DESC
            """)

            debug_results = db.session.execute(debug_query, {'period_id': period_id}).fetchall()

        return jsonify({'players': player_id_list})

    except Exception as e:
        current_app.logger.error(f"Error fetching group recommendation player ids: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500
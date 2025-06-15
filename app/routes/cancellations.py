# Add this to app/routes/cancellations.py (new file)

from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from app.models import (
    Cancellation, CancellationType, TennisGroupTimes, TeachingPeriod, 
    TennisGroup, DayOfWeek, Register
)
from app import db
from app.clubs.middleware import verify_club_access
from app.utils.auth import admin_required
from datetime import datetime, date, timedelta
import traceback
from sqlalchemy import and_, or_

# API routes for cancellations
cancellation_routes = Blueprint('cancellations', __name__, url_prefix='/api')

@cancellation_routes.route('/cancellations', methods=['GET'])
@login_required
@verify_club_access()
def get_cancellations():
    """Get all active cancellations for the current tennis club"""
    try:
        # Parse query parameters
        include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'
        cancellation_type = request.args.get('type')
        
        # Base query
        query = Cancellation.query.filter_by(tennis_club_id=current_user.tennis_club_id)
        
        # Filter by active status
        if not include_inactive:
            query = query.filter_by(is_active=True)
        
        # Filter by cancellation type
        if cancellation_type:
            try:
                type_enum = CancellationType[cancellation_type.upper()]
                query = query.filter_by(cancellation_type=type_enum)
            except KeyError:
                pass
        
        # Order by created date (newest first)
        cancellations = query.order_by(Cancellation.created_at.desc()).all()
        
        # Format response
        results = []
        for cancellation in cancellations:
            # Get group time info if applicable
            group_time_info = None
            if cancellation.group_time:
                group_time_info = {
                    'id': cancellation.group_time.id,
                    'group_name': cancellation.group_time.tennis_group.name,
                    'day': cancellation.group_time.day_of_week.value,
                    'start_time': cancellation.group_time.start_time.strftime('%H:%M'),
                    'end_time': cancellation.group_time.end_time.strftime('%H:%M')
                }
            
            results.append({
                'id': cancellation.id,
                'type': cancellation.cancellation_type.value,
                'reason': cancellation.reason,
                'is_active': cancellation.is_active,
                'created_at': cancellation.created_at.isoformat(),
                'created_by': {
                    'id': cancellation.created_by.id,
                    'name': cancellation.created_by.name
                },
                'specific_date': cancellation.specific_date.isoformat() if cancellation.specific_date else None,
                'week_start_date': cancellation.week_start_date.isoformat() if cancellation.week_start_date else None,
                'week_end_date': cancellation.week_end_date.isoformat() if cancellation.week_end_date else None,
                'group_time': group_time_info
            })
        
        return jsonify(results)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching cancellations: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@cancellation_routes.route('/cancellations', methods=['POST'])
@login_required
@verify_club_access()
def create_cancellation():
    """Create a new cancellation"""
    try:
        data = request.get_json()
        
        # Validate required fields
        if 'type' not in data or 'reason' not in data:
            return jsonify({'error': 'Type and reason are required'}), 400
        
        # Parse cancellation type
        try:
            cancellation_type = CancellationType[data['type'].upper()]
        except KeyError:
            return jsonify({'error': f'Invalid cancellation type: {data["type"]}. Must be session, day, or week'}), 400
        
        # Check permissions based on cancellation type
        if cancellation_type in [CancellationType.DAY, CancellationType.WEEK]:
            # Only admins can cancel entire days or weeks
            if not (current_user.is_admin or current_user.is_super_admin):
                return jsonify({'error': 'Only administrators can cancel entire days or weeks'}), 403
        
        elif cancellation_type == CancellationType.SESSION:
            # For session cancellations, verify the user can cancel this specific session
            if 'group_time_id' not in data or 'specific_date' not in data:
                return jsonify({'error': 'group_time_id and specific_date required for session cancellation'}), 400
            
            # Verify group time belongs to this club
            group_time = TennisGroupTimes.query.filter_by(
                id=data['group_time_id'],
                tennis_club_id=current_user.tennis_club_id
            ).first()
            if not group_time:
                return jsonify({'error': 'Invalid group time'}), 400
            
            # Check if user can cancel this session
            # Admins can cancel any session, coaches can only cancel sessions they're assigned to
            if not (current_user.is_admin or current_user.is_super_admin):
                # For non-admins, we need to check if they are the coach for this session
                # This requires checking the coach assignment for this specific group time
                
                # You might need to adjust this query based on your models
                # This assumes there's a way to get the coach for a group time
                # Option 1: If coach is directly on TennisGroupTimes
                if hasattr(group_time, 'coach_id') and group_time.coach_id != current_user.id:
                    return jsonify({'error': 'You can only cancel sessions that you are assigned to coach'}), 403
                
                # Option 2: If coach is determined through other relationships
                # You may need to implement additional logic here based on your data model
                # For example, checking ProgrammePlayers or other related tables
        
        # Create cancellation object
        cancellation = Cancellation(
            tennis_club_id=current_user.tennis_club_id,
            created_by_id=current_user.id,
            cancellation_type=cancellation_type,
            reason=data['reason'],
            is_active=data.get('is_active', True)
        )
        
        # Set type-specific fields
        if cancellation_type == CancellationType.SESSION:
            cancellation.group_time_id = data['group_time_id']
            cancellation.specific_date = datetime.strptime(data['specific_date'], '%Y-%m-%d').date()
        
        elif cancellation_type == CancellationType.DAY:
            if 'specific_date' not in data:
                return jsonify({'error': 'specific_date required for day cancellation'}), 400
            
            cancellation.specific_date = datetime.strptime(data['specific_date'], '%Y-%m-%d').date()
        
        elif cancellation_type == CancellationType.WEEK:
            if 'week_start_date' not in data or 'week_end_date' not in data:
                return jsonify({'error': 'week_start_date and week_end_date required for week cancellation'}), 400
            
            cancellation.week_start_date = datetime.strptime(data['week_start_date'], '%Y-%m-%d').date()
            cancellation.week_end_date = datetime.strptime(data['week_end_date'], '%Y-%m-%d').date()
            
            # Validate that end date is after start date
            if cancellation.week_end_date < cancellation.week_start_date:
                return jsonify({'error': 'week_end_date must be after week_start_date'}), 400
        
        db.session.add(cancellation)
        db.session.commit()
        
        return jsonify({
            'message': 'Cancellation created successfully',
            'cancellation_id': cancellation.id
        }), 201
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating cancellation: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@cancellation_routes.route('/cancellations/<int:cancellation_id>', methods=['PUT'])
@login_required
@verify_club_access()
@admin_required
def update_cancellation(cancellation_id):
    """Update an existing cancellation"""
    try:
        cancellation = Cancellation.query.filter_by(
            id=cancellation_id,
            tennis_club_id=current_user.tennis_club_id
        ).first_or_404()
        
        data = request.get_json()
        
        # Update allowed fields
        if 'reason' in data:
            cancellation.reason = data['reason']
        
        if 'is_active' in data:
            cancellation.is_active = data['is_active']
        
        # Update date fields if provided
        if 'specific_date' in data:
            cancellation.specific_date = datetime.strptime(data['specific_date'], '%Y-%m-%d').date()
        
        if 'week_start_date' in data:
            cancellation.week_start_date = datetime.strptime(data['week_start_date'], '%Y-%m-%d').date()
        
        if 'week_end_date' in data:
            cancellation.week_end_date = datetime.strptime(data['week_end_date'], '%Y-%m-%d').date()
        
        if 'recurring_start_date' in data:
            cancellation.recurring_start_date = datetime.strptime(data['recurring_start_date'], '%Y-%m-%d').date()
        
        if 'recurring_end_date' in data:
            cancellation.recurring_end_date = datetime.strptime(data['recurring_end_date'], '%Y-%m-%d').date()
        
        db.session.commit()
        
        return jsonify({
            'message': 'Cancellation updated successfully',
            'cancellation_id': cancellation.id
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating cancellation: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@cancellation_routes.route('/cancellations/<int:cancellation_id>', methods=['DELETE'])
@login_required
@verify_club_access()
@admin_required
def delete_cancellation(cancellation_id):
    """Delete (deactivate) a cancellation"""
    try:
        cancellation = Cancellation.query.filter_by(
            id=cancellation_id,
            tennis_club_id=current_user.tennis_club_id
        ).first_or_404()
        
        # Instead of deleting, just deactivate
        cancellation.is_active = False
        db.session.commit()
        
        return jsonify({
            'message': 'Cancellation deactivated successfully',
            'cancellation_id': cancellation.id
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error deleting cancellation: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

# Business Logic Functions

def is_session_cancelled(group_time_id, session_date, tennis_club_id):
    """
    Check if a specific session is cancelled by any active cancellation.
    
    Args:
        group_time_id: ID of the group time slot
        session_date: Date of the session (date object)
        tennis_club_id: ID of the tennis club
        
    Returns:
        tuple: (is_cancelled: bool, cancellation_reason: str or None)
    """
    try:
        # Get all active cancellations for this club
        cancellations = Cancellation.query.filter_by(
            tennis_club_id=tennis_club_id,
            is_active=True
        ).all()
        
        # Check each cancellation to see if it affects this session
        for cancellation in cancellations:
            if cancellation.is_session_cancelled(group_time_id, session_date):
                return True, cancellation.reason
                
        return False, None
        
    except Exception as e:
        current_app.logger.error(f"Error checking session cancellation: {str(e)}")
        return False, None

def get_cancelled_sessions_in_range(start_date, end_date, tennis_club_id, teaching_period_id=None):
    """
    Get all cancelled sessions within a date range.
    
    Args:
        start_date: Start date (date object)
        end_date: End date (date object)
        tennis_club_id: ID of the tennis club
        teaching_period_id: Optional teaching period filter (for context)
        
    Returns:
        list: List of cancelled session info dicts
    """
    try:
        cancelled_sessions = []
        
        # Get all group times for the club
        group_times_query = TennisGroupTimes.query.filter_by(tennis_club_id=tennis_club_id)
        if teaching_period_id:
            # Join with programme players to ensure we only get active group times
            from app.models import ProgrammePlayers
            group_times_query = group_times_query.join(
                ProgrammePlayers, TennisGroupTimes.id == ProgrammePlayers.group_time_id
            ).filter(ProgrammePlayers.teaching_period_id == teaching_period_id).distinct()
        
        group_times = group_times_query.all()
        
        # Map day names to Python weekday numbers
        day_mapping = {
            DayOfWeek.MONDAY: 0,
            DayOfWeek.TUESDAY: 1,
            DayOfWeek.WEDNESDAY: 2,
            DayOfWeek.THURSDAY: 3,
            DayOfWeek.FRIDAY: 4,
            DayOfWeek.SATURDAY: 5,
            DayOfWeek.SUNDAY: 6
        }
        
        # Check each date in range
        current_date = start_date
        while current_date <= end_date:
            current_weekday = current_date.weekday()
            
            # Check each group time that falls on this day
            for group_time in group_times:
                if day_mapping.get(group_time.day_of_week) == current_weekday:
                    is_cancelled, reason = is_session_cancelled(
                        group_time.id, 
                        current_date, 
                        tennis_club_id
                    )
                    
                    if is_cancelled:
                        cancelled_sessions.append({
                            'date': current_date.isoformat(),
                            'group_time_id': group_time.id,
                            'group_name': group_time.tennis_group.name,
                            'start_time': group_time.start_time.strftime('%H:%M'),
                            'end_time': group_time.end_time.strftime('%H:%M'),
                            'reason': reason
                        })
            
            current_date += timedelta(days=1)
        
        return cancelled_sessions
        
    except Exception as e:
        current_app.logger.error(f"Error getting cancelled sessions: {str(e)}")
        return []

@cancellation_routes.route('/cancellations/check-session')
@login_required
@verify_club_access()
def check_session_cancellation():
    """Check if a specific session is cancelled"""
    try:
        group_time_id = request.args.get('group_time_id', type=int)
        session_date = request.args.get('date')
        
        if not all([group_time_id, session_date]):
            return jsonify({'error': 'group_time_id and date are required'}), 400
        
        # Parse date
        try:
            session_date_obj = datetime.strptime(session_date, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
        
        is_cancelled, reason = is_session_cancelled(
            group_time_id,
            session_date_obj,
            current_user.tennis_club_id
        )
        
        return jsonify({
            'is_cancelled': is_cancelled,
            'reason': reason
        })
        
    except Exception as e:
        current_app.logger.error(f"Error checking session cancellation: {str(e)}")
        return jsonify({'error': str(e)}), 500

@cancellation_routes.route('/cancellations/range')
@login_required
@verify_club_access()
def get_cancellations_in_range():
    """Get all cancelled sessions within a date range"""
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        teaching_period_id = request.args.get('teaching_period_id', type=int)
        
        if not all([start_date, end_date]):
            return jsonify({'error': 'start_date and end_date are required'}), 400
        
        # Parse dates
        try:
            start_date_obj = datetime.strptime(start_date, '%Y-%m-%d').date()
            end_date_obj = datetime.strptime(end_date, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
        
        cancelled_sessions = get_cancelled_sessions_in_range(
            start_date_obj,
            end_date_obj,
            current_user.tennis_club_id,
            teaching_period_id
        )
        
        return jsonify(cancelled_sessions)
        
    except Exception as e:
        current_app.logger.error(f"Error getting cancellations in range: {str(e)}")
        return jsonify({'error': str(e)}), 500
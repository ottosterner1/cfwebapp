from flask import Blueprint, request, jsonify, current_app, render_template
from flask_login import login_required, current_user
from app.models import (
    Register, RegisterEntry, TeachingPeriod, TennisGroupTimes, 
    ProgrammePlayers, AttendanceStatus, TennisGroup, Student, User, RegisterAssistantCoach
)
from app import db
from app.models.base import UserRole
from app.utils.auth import admin_required
from app.clubs.middleware import verify_club_access
from sqlalchemy import and_, or_, func, case, distinct
from datetime import datetime, timedelta, date
import traceback

# API routes for JSON data
register_routes = Blueprint('registers', __name__, url_prefix='/api')

# View routes for HTML pages
register_views = Blueprint('register_views', __name__, url_prefix='/registers')


def serialize_attendance_status(status):
    """
    Convert AttendanceStatus to consistent string format for API responses.
    Handles both enum instances and string values.
    
    Args:
        status: An AttendanceStatus enum or string
        
    Returns:
        Lowercase string value with underscores (e.g., 'away_with_notice')
    """
    if hasattr(status, 'value'):  # If it's an enum instance
        return status.value
    elif isinstance(status, str):
        # If it's already the correct format, just return it
        if status.lower() in [e.value for e in AttendanceStatus]:
            return status.lower()
        
        # Try to match by enum name (e.g., "AWAY_WITH_NOTICE")
        try:
            return AttendanceStatus[status.upper()].value
        except (KeyError, AttributeError):
            # Fallback - convert to lowercase with underscores
            return status.lower().replace(' ', '_')
    
    # Last resort fallback
    return str(status).lower().replace(' ', '_')

# =========================================================
# VIEW ROUTES - For rendering HTML templates
# =========================================================

@register_views.route('/')
@login_required
@verify_club_access()
def register_list():
    """Render the register list page"""
    return render_template('pages/registers.html')

@register_views.route('/new')
@login_required
@verify_club_access()
def create_register():
    """Render the create register page"""
    return render_template('pages/create_register.html')

@register_views.route('/<int:register_id>')
@login_required
@verify_club_access()
def view_register(register_id):
    """Render the view register page"""
    # Check if register exists and user has access
    register = Register.query.get_or_404(register_id)
    if not current_user.is_admin and register.coach_id != current_user.id:
        return render_template('errors/403.html'), 403
        
    return render_template('pages/view_register.html', register_id=register_id)

@register_views.route('/<int:register_id>/edit')
@login_required
@verify_club_access()
def edit_register(register_id):
    """Render the edit register page"""
    # Check if register exists and user has access
    register = Register.query.get_or_404(register_id)
    if not current_user.is_admin and register.coach_id != current_user.id:
        return render_template('errors/403.html'), 403
        
    return render_template('pages/edit_register.html', register_id=register_id)

# =========================================================
# API ROUTES - For JSON data
# =========================================================

@register_routes.route('/registers')
@login_required
@verify_club_access()
def get_registers():
    """Get registers for the current user's tennis club with filtering options"""
    try:
        # Parse query parameters
        teaching_period_id = request.args.get('period_id', type=int)
        group_id = request.args.get('group_id', type=int)
        day_of_week = request.args.get('day_of_week')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        coach_id = request.args.get('coach_id', type=int)
        
        # Start with base query - be explicit about the model being queried
        query = Register.query.filter(Register.tennis_club_id == current_user.tennis_club_id)
        
        # Apply filters - scope them correctly to the appropriate tables
        if teaching_period_id:
            query = query.filter(Register.teaching_period_id == teaching_period_id)
        
        # Join with group_time for group and day filtering
        if group_id or day_of_week:
            query = query.join(TennisGroupTimes, Register.group_time_id == TennisGroupTimes.id)
            
            if group_id:
                query = query.filter(TennisGroupTimes.group_id == group_id)
                
            if day_of_week:
                from app.models.base import DayOfWeek
                try:
                    # Try to match by enum name (uppercase input expected)
                    day_enum = DayOfWeek[day_of_week.upper()]
                    query = query.filter(TennisGroupTimes.day_of_week == day_enum)
                except KeyError:
                    # Try to match by enum value (case insensitive)
                    day_enum = next((day for day in DayOfWeek if day.value.upper() == day_of_week.upper()), None)
                    if day_enum:
                        query = query.filter(TennisGroupTimes.day_of_week == day_enum)
        
        if start_date:
            try:
                start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
                query = query.filter(Register.date >= start_date)
            except ValueError:
                pass
                
        if end_date:
            try:
                end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
                query = query.filter(Register.date <= end_date)
            except ValueError:
                pass
                
        # Coach filter - admin/super_admin can see all, coach can only see their own
        if not (current_user.is_admin or current_user.is_super_admin):
            # Apply filter to Register.coach_id, not TennisGroupTimes
            query = query.filter(Register.coach_id == current_user.id)
        elif coach_id:  # Admin filtering by specific coach
            query = query.filter(Register.coach_id == coach_id)
        
        # Order by date (most recent first)
        registers = query.order_by(Register.date.desc()).all()
        
        # Calculate attendance stats for each register
        results = []
        for register in registers:
            # Count entries by status
            present_count = sum(1 for entry in register.entries if entry.attendance_status == AttendanceStatus.PRESENT)
            absent_count = sum(1 for entry in register.entries if entry.attendance_status == AttendanceStatus.ABSENT)
            sick_count = sum(1 for entry in register.entries if entry.attendance_status == AttendanceStatus.SICK)
            away_with_notice_count = sum(1 for entry in register.entries if entry.attendance_status == AttendanceStatus.AWAY_WITH_NOTICE)
            
            # Get group info from the group time
            group_name = register.group_time.tennis_group.name if register.group_time else "Unknown Group"
            
            # Calculate attendance rate - UPDATED: Only count PRESENT as attendance
            total_entries = len(register.entries)
            # Changed calculation to only count present (not away_with_notice)
            attendance_rate = round((present_count / total_entries * 100), 1) if total_entries > 0 else 0
            
            # Add day of week info
            day_of_week = register.group_time.day_of_week.value if register.group_time and register.group_time.day_of_week else None
            
            results.append({
                'id': register.id,
                'date': register.date.isoformat(),
                'group_name': group_name,
                'group_id': register.group_time.group_id if register.group_time else None,
                'coach_name': register.coach.name,
                'coach_id': register.coach_id,
                'time_slot': {
                    'day': day_of_week,
                    'start_time': register.group_time.start_time.strftime('%H:%M') if register.group_time and register.group_time.start_time else None,
                    'end_time': register.group_time.end_time.strftime('%H:%M') if register.group_time and register.group_time.end_time else None
                },
                'stats': {
                    'total': total_entries,
                    'present': present_count,
                    'absent': absent_count,
                    'sick': sick_count,
                    'away_with_notice': away_with_notice_count,
                    'attendance_rate': attendance_rate
                }
            })
        
        return jsonify(results)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching registers: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@register_routes.route('/registers/<int:register_id>')
@login_required
@verify_club_access()
def get_register(register_id):
    """Get a specific register with detailed attendance information"""
    try:
        register = Register.query.get_or_404(register_id)
        
        # Check permissions
        if not current_user.is_admin and register.coach_id != current_user.id:
            return jsonify({'error': 'Permission denied'}), 403
            
        # Get group info
        group_time = register.group_time
        group = group_time.tennis_group if group_time else None
        
        # Format entries with student information
        entries = []
        for entry in register.entries:
            player = entry.programme_player
            student = player.student if player else None
            
            if student:
                # Use the serializer function for consistent formatting
                entries.append({
                    'id': entry.id,
                    'student_id': student.id,
                    'student_name': student.name,
                    'attendance_status': serialize_attendance_status(entry.attendance_status),
                    'notes': entry.notes,
                    'player_id': player.id,
                    'predicted_attendance': entry.predicted_attendance
                })
                
        # Get assistant coaches
        assistant_coaches = []
        for assistant in register.assistant_coaches:
            assistant_coaches.append({
                'id': assistant.coach_id,
                'name': assistant.coach.name
            })
                
        # Build response
        response = {
            'id': register.id,
            'date': register.date.isoformat(),
            'group': {
                'id': group.id if group else None,
                'name': group.name if group else 'Unknown Group'
            },
            'time_slot': {
                'id': group_time.id if group_time else None,
                'day': group_time.day_of_week.value if group_time else None,
                'start_time': group_time.start_time.strftime('%H:%M') if group_time else None,
                'end_time': group_time.end_time.strftime('%H:%M') if group_time else None
            },
            'coach': {
                'id': register.coach_id,
                'name': register.coach.name
            },
            'assistant_coaches': assistant_coaches,  # Add assistant coaches to response
            'notes': register.notes, 
            'entries': entries,
            'teaching_period': {
                'id': register.teaching_period_id,
                'name': register.teaching_period.name
            }
        }
        
        return jsonify(response)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching register details: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@register_routes.route('/registers', methods=['POST'])
@login_required
@verify_club_access()
def create_register():
    """Create a new register for a group session"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['group_time_id', 'date', 'teaching_period_id']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
                
        # Parse date string to date object
        try:
            register_date = datetime.strptime(data['date'], '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
            
        # Check if register already exists for this group_time and date
        existing_register = Register.query.filter_by(
            group_time_id=data['group_time_id'],
            date=register_date,
            teaching_period_id=data['teaching_period_id']
        ).first()
        
        if existing_register:
            return jsonify({
                'error': 'A register already exists for this group and date',
                'register_id': existing_register.id
            }), 409  # Conflict
            
        # Create new register
        register = Register(
            group_time_id=data['group_time_id'],
            coach_id=current_user.id,
            date=register_date,
            teaching_period_id=data['teaching_period_id'],
            notes=data.get('notes', ''),
            tennis_club_id=current_user.tennis_club_id
        )
        
        db.session.add(register)
        db.session.flush()  # Get register.id without committing yet

        # Add assistant coaches if provided
        assistant_coach_ids = data.get('assistant_coach_ids', [])
        for coach_id in assistant_coach_ids:
            # Verify coach exists and belongs to same tennis club
            coach = User.query.filter_by(id=coach_id, tennis_club_id=current_user.tennis_club_id).first()
            if coach:
                assistant = RegisterAssistantCoach(
                    register_id=register.id,
                    coach_id=coach_id
                )
                db.session.add(assistant)

        # Pre-populate entries for all students in this group time
        players = ProgrammePlayers.query.filter_by(
            group_time_id=data['group_time_id'],
            teaching_period_id=data['teaching_period_id'],
            tennis_club_id=current_user.tennis_club_id
        ).all()
        
        for player in players:
            entry = RegisterEntry(
                register_id=register.id,
                programme_player_id=player.id,
                attendance_status=AttendanceStatus.ABSENT,  # Default to absent
                predicted_attendance=data.get('predicted_attendance', False)
            )
            db.session.add(entry)
            
        db.session.commit()
        
        return jsonify({
            'message': 'Register created successfully',
            'register_id': register.id
        }), 201
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating register: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@register_routes.route('/registers/<int:register_id>', methods=['PUT'])
@login_required
@verify_club_access()
def update_register(register_id):
    """Update register details (coach, notes, status)"""
    try:
        register = Register.query.get_or_404(register_id)
        
        # Check permissions
        if not current_user.is_admin and register.coach_id != current_user.id:
            return jsonify({'error': 'Permission denied'}), 403
            
        data = request.get_json()
        
        # Update allowed fields
        if 'notes' in data:
            register.notes = data['notes']
                
        if current_user.is_admin and 'coach_id' in data:
            register.coach_id = data['coach_id']
            
        # Add date update functionality
        if 'date' in data:
            try:
                # Parse the date string to a date object
                new_date = datetime.strptime(data['date'], '%Y-%m-%d').date()
                
                # Check if a register already exists for this group_time and date
                existing_register = Register.query.filter_by(
                    group_time_id=register.group_time_id,
                    date=new_date,
                    teaching_period_id=register.teaching_period_id
                ).first()
                
                if existing_register and existing_register.id != register.id:
                    return jsonify({
                        'error': 'A register already exists for this group and date',
                        'register_id': existing_register.id
                    }), 409  # Conflict
                
                # Update the date
                register.date = new_date
            except ValueError:
                return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
            
        db.session.commit()
        
        return jsonify({
            'message': 'Register updated successfully',
            'register_id': register.id
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating register: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@register_routes.route('/registers/<int:register_id>/entries', methods=['PUT'])
@login_required
@verify_club_access()
def update_register_entries(register_id):
    """Update attendance entries for a register"""
    try:
        register = Register.query.get_or_404(register_id)
        
        # Check permissions
        if not current_user.is_admin and register.coach_id != current_user.id:
            return jsonify({'error': 'Permission denied'}), 403
            
        data = request.get_json()
        entries = data.get('entries', [])
        
        if not entries:
            return jsonify({'error': 'No entries provided'}), 400
            
        # Define a direct mapping for attendance status
        status_map = {
            'present': AttendanceStatus.PRESENT,
            'absent': AttendanceStatus.ABSENT,
            'sick': AttendanceStatus.SICK,
            'away_with_notice': AttendanceStatus.AWAY_WITH_NOTICE
        }
        
        # Keep track of updates
        updated_count = 0
        errors = []
        
        # Use no_autoflush to prevent premature flushes
        with db.session.no_autoflush:
            for entry_data in entries:
                entry_id = entry_data.get('id')
                player_id = entry_data.get('player_id')
                
                # Find entry by ID or player ID
                entry = None
                if entry_id:
                    entry = RegisterEntry.query.get(entry_id)
                elif player_id:
                    entry = RegisterEntry.query.filter_by(
                        register_id=register_id,
                        programme_player_id=player_id
                    ).first()
                    
                if not entry:
                    errors.append(f"Entry not found for ID: {entry_id or 'None'}, Player ID: {player_id or 'None'}")
                    continue
                    
                # Update attendance status using direct mapping with serializer
                if 'attendance_status' in entry_data:
                    # Normalize the input status
                    status_value = serialize_attendance_status(entry_data['attendance_status'])
                    if status_value in status_map:
                        entry.attendance_status = status_map[status_value]
                    else:
                        errors.append(f"Invalid attendance status for entry {entry.id}: {status_value}")
                        continue
                    
                # Update notes
                if 'notes' in entry_data:
                    entry.notes = entry_data['notes']
                    
                # Update predicted attendance
                if 'predicted_attendance' in entry_data:
                    entry.predicted_attendance = bool(entry_data['predicted_attendance'])
                    
                updated_count += 1
        
        # Now explicitly commit the changes
        db.session.commit()
        
        return jsonify({
            'message': f'Updated {updated_count} entries successfully',
            'errors': errors
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating register entries: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@register_routes.route('/registers/<int:register_id>', methods=['DELETE'])
@login_required
@verify_club_access()
def delete_register(register_id):
    """Delete a register and all its entries"""
    try:
        register = Register.query.get_or_404(register_id)
        
        # Only allow deletion for the same tennis club
        if register.tennis_club_id != current_user.tennis_club_id:
            return jsonify({'error': 'Permission denied'}), 403
            
        # Delete register (cascade will handle entries)
        db.session.delete(register)
        db.session.commit()
        
        return jsonify({
            'message': 'Register deleted successfully'
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error deleting register: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@register_routes.route('/registers/upcoming')
@login_required
@verify_club_access()
def get_upcoming_sessions():
    """Get upcoming sessions that need registers"""
    try:
        # Get current teaching period (or use the one from the query params)
        teaching_period_id = request.args.get('period_id', type=int)
        
        current_period = None
        if not teaching_period_id:
            current_period = TeachingPeriod.query.filter(
                TeachingPeriod.tennis_club_id == current_user.tennis_club_id,
                TeachingPeriod.start_date <= func.current_date(),
                TeachingPeriod.end_date >= func.current_date()
            ).order_by(TeachingPeriod.start_date.desc()).first()
            
            if current_period:
                teaching_period_id = current_period.id
            else:
                return jsonify([])
        else:
            # If teaching_period_id was provided, fetch the period object
            current_period = TeachingPeriod.query.get(teaching_period_id)
            if not current_period:
                return jsonify([])
        
        # Get all group times for this club
        group_times = TennisGroupTimes.query.filter_by(
            tennis_club_id=current_user.tennis_club_id
        ).all()
        
        # Generate upcoming dates for the next 4 weeks
        today = date.today()
        upcoming_dates = []
        for i in range(28):  # 4 weeks
            upcoming_dates.append(today + timedelta(days=i))
            
        # For each group time, find sessions that don't have registers yet
        upcoming_sessions = []
        
        for group_time in group_times:
            # Check if coach is associated with this group time
            if not current_user.is_admin:
                players = ProgrammePlayers.query.filter_by(
                    group_time_id=group_time.id,
                    teaching_period_id=teaching_period_id,
                    tennis_club_id=current_user.tennis_club_id
                ).all()
                
                # Count players assigned to the current coach
                coach_player_count = sum(1 for p in players if p.coach_id == current_user.id)
                
                # Skip if no players or none assigned to this coach
                if len(players) == 0 or coach_player_count == 0:
                    continue
            
            # Get the day of week for this group time
            day_of_week = group_time.day_of_week.name  # e.g., "MONDAY"
            
            # Find dates with this day of week
            for check_date in upcoming_dates:
                if check_date.strftime('%A').upper() == day_of_week:
                    # Check if register already exists for this date and group time
                    existing_register = Register.query.filter_by(
                        group_time_id=group_time.id,
                        date=check_date,
                        teaching_period_id=teaching_period_id
                    ).first()
                    
                    if not existing_register:
                        # Get group and coach info
                        group = group_time.tennis_group
                        
                        # Get assigned coach for this group time in this period
                        assigned_coach = db.session.query(User).join(
                            ProgrammePlayers, User.id == ProgrammePlayers.coach_id
                        ).filter(
                            ProgrammePlayers.group_time_id == group_time.id,
                            ProgrammePlayers.teaching_period_id == current_period.id
                        ).first()
                        
                        # Add to upcoming sessions
                        upcoming_sessions.append({
                            'date': check_date.isoformat(),
                            'group_time': {
                                'id': group_time.id,
                                'day': group_time.day_of_week.value,
                                'start_time': group_time.start_time.strftime('%H:%M'),
                                'end_time': group_time.end_time.strftime('%H:%M')
                            },
                            'group': {
                                'id': group.id,
                                'name': group.name
                            },
                            'teaching_period': {
                                'id': current_period.id,
                                'name': current_period.name
                            },
                            'coach': {
                                'id': assigned_coach.id if assigned_coach else None,
                                'name': assigned_coach.name if assigned_coach else 'Not assigned'
                            }
                        })
                        
        # Sort by date
        upcoming_sessions.sort(key=lambda x: x['date'])
        
        return jsonify(upcoming_sessions)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching upcoming sessions: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@register_routes.route('/registers/attendance-stats')
@login_required
@verify_club_access()
def get_attendance_stats():
    """Get attendance statistics for groups/students"""
    try:
        # Parse query parameters
        teaching_period_id = request.args.get('period_id', type=int)
        group_id = request.args.get('group_id', type=int)
        student_id = request.args.get('student_id', type=int)
        coach_id = request.args.get('coach_id', type=int) 
        
        # Validate parameters
        if not teaching_period_id:
            return jsonify({'error': 'Teaching period ID is required'}), 400
            
        # Base query for register entries
        query = db.session.query(
            RegisterEntry, Register, TennisGroupTimes, TennisGroup, Student
        ).join(
            Register, RegisterEntry.register_id == Register.id
        ).join(
            TennisGroupTimes, Register.group_time_id == TennisGroupTimes.id
        ).join(
            TennisGroup, TennisGroupTimes.group_id == TennisGroup.id
        ).join(
            ProgrammePlayers, RegisterEntry.programme_player_id == ProgrammePlayers.id
        ).join(
            Student, ProgrammePlayers.student_id == Student.id
        ).filter(
            Register.tennis_club_id == current_user.tennis_club_id,
            Register.teaching_period_id == teaching_period_id
        )
        
        # Apply optional filters
        if group_id:
            query = query.filter(TennisGroup.id == group_id)
            
        if student_id:
            query = query.filter(Student.id == student_id)
            
        # Handle coach filtering
        coach_filter = None
        if not (current_user.is_admin or current_user.is_super_admin):
            # Non-admin users can only see their assigned registers
            coach_filter = Register.coach_id == current_user.id
            query = query.filter(coach_filter)
        elif coach_id:  # Admin filtering by specific coach
            # Allow admins to filter by a specific coach
            coach_filter = Register.coach_id == coach_id
            query = query.filter(coach_filter)
            
        entries = query.all()
        
        # Process results based on requested type
        stats_type = request.args.get('type', 'summary')
        
        if stats_type == 'summary':
            # Overall summary statistics
            total_entries = len(entries)
            present_count = sum(1 for entry, *_ in entries if entry.attendance_status == AttendanceStatus.PRESENT)
            absent_count = sum(1 for entry, *_ in entries if entry.attendance_status == AttendanceStatus.ABSENT)
            sick_count = sum(1 for entry, *_ in entries if entry.attendance_status == AttendanceStatus.SICK)
            away_with_notice_count = sum(1 for entry, *_ in entries if entry.attendance_status == AttendanceStatus.AWAY_WITH_NOTICE)
            
            # UPDATED: Only count PRESENT as attendance (not away_with_notice)
            attendance_rate = round((present_count / total_entries * 100), 1) if total_entries > 0 else 0
            
            # Apply the same coach filter to the register count query
            register_query = db.session.query(func.count(distinct(Register.id))).filter(
                Register.tennis_club_id == current_user.tennis_club_id,
                Register.teaching_period_id == teaching_period_id
            )
            
            # Apply the same coach filter to register count
            if coach_filter:
                register_query = register_query.filter(coach_filter)
                
            register_count = register_query.scalar()

            return jsonify({
                'total_registers': register_count,  
                'total_sessions': total_entries,   
                'present': present_count,
                'absent': absent_count,
                'sick': sick_count,
                'away_with_notice': away_with_notice_count,
                'attendance_rate': attendance_rate
            })
            
        elif stats_type == 'by_group':
            # Stats grouped by tennis group
            group_stats = {}
            
            for entry, register, time_slot, group, student in entries:
                group_id = group.id
                
                if group_id not in group_stats:
                    group_stats[group_id] = {
                        'id': group_id,
                        'name': group.name,
                        'total': 0,
                        'present': 0,
                        'absent': 0,
                        'sick': 0,
                        'away_with_notice': 0
                    }
                    
                group_stats[group_id]['total'] += 1
                
                # Use direct enum comparison for counting
                if entry.attendance_status == AttendanceStatus.PRESENT:
                    group_stats[group_id]['present'] += 1
                elif entry.attendance_status == AttendanceStatus.ABSENT:
                    group_stats[group_id]['absent'] += 1
                elif entry.attendance_status == AttendanceStatus.SICK:
                    group_stats[group_id]['sick'] += 1
                elif entry.attendance_status == AttendanceStatus.AWAY_WITH_NOTICE:
                    group_stats[group_id]['away_with_notice'] += 1
            
            # Calculate attendance rates - UPDATED: Only count PRESENT as attendance
            for stats in group_stats.values():
                stats['attendance_rate'] = round(
                    (stats['present'] / stats['total'] * 100), 1
                ) if stats['total'] > 0 else 0
                
            return jsonify(list(group_stats.values()))
            
        elif stats_type == 'by_student':
            # Stats grouped by student
            student_stats = {}
            
            for entry, register, time_slot, group, student in entries:
                student_id = student.id
                
                if student_id not in student_stats:
                    student_stats[student_id] = {
                        'id': student_id,
                        'name': student.name,
                        'total': 0,
                        'present': 0,
                        'absent': 0,
                        'sick': 0,
                        'away_with_notice': 0
                    }
                    
                student_stats[student_id]['total'] += 1
                
                # Use direct enum comparison for counting
                if entry.attendance_status == AttendanceStatus.PRESENT:
                    student_stats[student_id]['present'] += 1
                elif entry.attendance_status == AttendanceStatus.ABSENT:
                    student_stats[student_id]['absent'] += 1
                elif entry.attendance_status == AttendanceStatus.SICK:
                    student_stats[student_id]['sick'] += 1
                elif entry.attendance_status == AttendanceStatus.AWAY_WITH_NOTICE:
                    student_stats[student_id]['away_with_notice'] += 1
            
            # Calculate attendance rates - UPDATED: Only count PRESENT as attendance
            for stats in student_stats.values():
                stats['attendance_rate'] = round(
                    (stats['present'] / stats['total'] * 100), 1
                ) if stats['total'] > 0 else 0
                
            return jsonify(list(student_stats.values()))
            
        else:
            return jsonify({'error': 'Invalid stats type'}), 400
            
    except Exception as e:
        current_app.logger.error(f"Error generating attendance stats: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@register_routes.route('/group-time-players')
@login_required
@verify_club_access()
def get_group_time_players():
    """Get players for a specific group time and teaching period"""
    try:
        group_time_id = request.args.get('group_time_id', type=int)
        teaching_period_id = request.args.get('teaching_period_id', type=int)
        
        if not group_time_id or not teaching_period_id:
            return jsonify({'error': 'Group time ID and teaching period ID are required'}), 400
            
        # Get players for this group time and teaching period
        players = ProgrammePlayers.query.filter_by(
            group_time_id=group_time_id,
            teaching_period_id=teaching_period_id,
            tennis_club_id=current_user.tennis_club_id
        ).join(
            Student, ProgrammePlayers.student_id == Student.id
        ).all()
        
        # Format as JSON
        results = []
        for player in players:
            # Format date of birth if available, otherwise None
            dob = player.student.date_of_birth.isoformat() if player.student.date_of_birth else None
            
            results.append({
                'id': player.id,
                'student_id': player.student_id,
                'student_name': player.student.name,
                'contact_number': player.student.contact_number,
                'emergency_contact_number': player.student.emergency_contact_number,
                'medical_information': player.student.medical_information,
                'walk_home': player.walk_home,
                'attendance_status': serialize_attendance_status('present'),  # Use serializer for consistency
                'notes': '',
                'predicted_attendance': False,
                'date_of_birth': dob,
                'contact_email': player.student.contact_email
            })
        
        return jsonify(results)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching group time players: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@register_routes.route('/coach-sessions')
@login_required
@verify_club_access()
def get_coach_sessions():
    """Get sessions for a specific day that the current coach is assigned to"""
    try:
        day_of_week = request.args.get('day_of_week')
        teaching_period_id = request.args.get('teaching_period_id', type=int)
        show_all = request.args.get('show_all', 'false').lower() == 'true'  # Fix boolean parsing
        
        if not day_of_week:
            return jsonify({'error': 'Day of week is required'}), 400
            
        # If no teaching period specified, get the current one
        if not teaching_period_id:
            current_period = TeachingPeriod.query.filter(
                TeachingPeriod.tennis_club_id == current_user.tennis_club_id,
                TeachingPeriod.start_date <= func.current_date(),
                TeachingPeriod.end_date >= func.current_date()
            ).order_by(TeachingPeriod.start_date.desc()).first()
            
            if current_period:
                teaching_period_id = current_period.id
            else:
                return jsonify([])
        
        # Log for debugging
        current_app.logger.info(f"Fetching sessions for day: {day_of_week}, teaching period: {teaching_period_id}")
        current_app.logger.info(f"Current user role: {current_user.role}, admin: {current_user.is_admin}, super admin: {current_user.is_super_admin}")
        
        # Convert day_of_week string to enum value for comparison
        from app.models.base import DayOfWeek
        try:
            # Try to match by enum name (uppercase input expected)
            day_enum = DayOfWeek[day_of_week.upper()]
        except KeyError:
            # Try to match by enum value (case insensitive)
            day_enum = next((day for day in DayOfWeek if day.value.upper() == day_of_week.upper()), None)
            if not day_enum:
                return jsonify({'error': f'Invalid day of week: {day_of_week}'}), 400
        
        # Query all group times for this day
        query = TennisGroupTimes.query.join(
            TennisGroup, TennisGroupTimes.group_id == TennisGroup.id
        ).filter(
            TennisGroupTimes.tennis_club_id == current_user.tennis_club_id,
            TennisGroupTimes.day_of_week == day_enum  # Directly compare with enum instance
        )
        
        # Get all group times
        group_times = query.all()
        
        # Log found group times
        current_app.logger.info(f"Found {len(group_times)} group times for day {day_of_week}")
        
        # Format as JSON
        results = []
        for group_time in group_times:
            # Find all players for this group time and teaching period
            players = ProgrammePlayers.query.filter_by(
                group_time_id=group_time.id,
                teaching_period_id=teaching_period_id,
                tennis_club_id=current_user.tennis_club_id
            ).all()
            
            # Count players assigned to the current coach
            coach_player_count = sum(1 for p in players if p.coach_id == current_user.id)
            
            # For super admins and admins, always include the group time
            # For coaches, only include if they have assigned players unless show_all is True
            if current_user.is_super_admin or current_user.is_admin or show_all or coach_player_count > 0:
                # Calculate percentage of players assigned to this coach
                coach_percentage = (coach_player_count / len(players) * 100) if players else 0
                
                # Add to results
                results.append({
                    'id': group_time.id,
                    'group_id': group_time.group_id,
                    'group_name': group_time.tennis_group.name,
                    'day': group_time.day_of_week.value,  # Safe to use .value here in Python code
                    'start_time': group_time.start_time.strftime('%H:%M'),
                    'end_time': group_time.end_time.strftime('%H:%M'),
                    'player_count': len(players),
                    'coach_player_count': coach_player_count,
                    'coach_percentage': round(coach_percentage, 1),
                    'teaching_period_id': teaching_period_id
                })
        
        current_app.logger.info(f"Returning {len(results)} sessions")
        return jsonify(results)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching coach sessions: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
    

@register_routes.route('/coaches')
@login_required
@verify_club_access()
def get_coaches():
    """Get list of coaches for the current tennis club"""
    try:
        # Get coaches who are assigned to players
        coaches = db.session.query(User).filter(
            User.tennis_club_id == current_user.tennis_club_id,
            User.is_active == True
        ).all()
        
        return jsonify([
            {'id': coach.id, 'name': coach.name}
            for coach in coaches
        ])
    except Exception as e:
        current_app.logger.error(f"Error fetching coaches: {str(e)}")
        return jsonify({'error': str(e)}), 500
    
@register_routes.route('/days-of-week')
@login_required
@verify_club_access()
def get_days_of_week():
    """Get unique days of week that have registers for the selected period"""
    try:
        teaching_period_id = request.args.get('period_id', type=int)
        
        if not teaching_period_id:
            return jsonify([])
            
        # Query for unique days of week that have registers in this period
        query = db.session.query(TennisGroupTimes.day_of_week)\
            .join(Register, Register.group_time_id == TennisGroupTimes.id)\
            .filter(Register.teaching_period_id == teaching_period_id,
                   Register.tennis_club_id == current_user.tennis_club_id)\
            .distinct()
            
        # Add coach filter for non-admins
        if not (current_user.is_admin or current_user.is_super_admin):
            query = query.filter(Register.coach_id == current_user.id)
            
        days = query.all()
        
        # Convert enum values to strings and sort them in weekday order
        day_order = {
            'MONDAY': 0, 
            'TUESDAY': 1, 
            'WEDNESDAY': 2, 
            'THURSDAY': 3, 
            'FRIDAY': 4, 
            'SATURDAY': 5, 
            'SUNDAY': 6
        }
        
        day_list = [{'value': day[0].name, 'label': day[0].value} for day in days]
        day_list.sort(key=lambda x: day_order.get(x['value'], 999))
        
        return jsonify(day_list)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching days of week: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
    
@register_routes.route('/groups-by-day')
@login_required
@verify_club_access()
def get_groups_by_day():
    try:
        teaching_period_id = request.args.get('period_id', type=int)
        day_of_week = request.args.get('day_of_week')
        
        if not teaching_period_id:
            return jsonify([])
            
        # Base query for all groups with registers in this period
        query = db.session.query(TennisGroup.id, TennisGroup.name)\
            .join(TennisGroupTimes, TennisGroupTimes.group_id == TennisGroup.id)\
            .join(Register, Register.group_time_id == TennisGroupTimes.id)\
            .filter(Register.teaching_period_id == teaching_period_id,
                   Register.tennis_club_id == current_user.tennis_club_id)
        
        # Add day filter only if provided
        if day_of_week:
            from app.models.base import DayOfWeek
            day_enum = None
            try:
                day_enum = DayOfWeek[day_of_week.upper()]
                query = query.filter(TennisGroupTimes.day_of_week == day_enum)
            except KeyError:
                # Fallback conversion methods
                try:
                    day_enum = next((d for d in DayOfWeek if d.value.upper() == day_of_week.upper()), None)
                    if day_enum:
                        query = query.filter(TennisGroupTimes.day_of_week == day_enum)
                    else:
                        day_enum = next((d for d in DayOfWeek if d.name[:3] == day_of_week.upper()[:3]), None)
                        if day_enum:
                            query = query.filter(TennisGroupTimes.day_of_week == day_enum)
                except Exception as e:
                    current_app.logger.error(f"Day conversion error: {e}")
                    # Don't return - just continue without the day filter
        
        # Apply coach filter if needed
        if not (current_user.is_admin or current_user.is_super_admin):
            query = query.filter(Register.coach_id == current_user.id)
        elif request.args.get('coach_id', type=int):
            query = query.filter(Register.coach_id == request.args.get('coach_id', type=int))
        
        # Get distinct groups and sort by name
        query = query.distinct().order_by(TennisGroup.name)
        
        groups = query.all()
        group_list = [{'id': group[0], 'name': group[1]} for group in groups]
        
        return jsonify(group_list)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching groups by day: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
    
@register_routes.route('/sessions')
@login_required
@verify_club_access()
def get_sessions():
    """Get sessions (time slots) for a specific group in the selected period, optionally filtered by day"""
    try:
        teaching_period_id = request.args.get('period_id', type=int)
        day_of_week = request.args.get('day_of_week')
        group_id = request.args.get('group_id', type=int)
        
        # Only require teaching period and group ID
        if not teaching_period_id or not group_id:
            return jsonify([])
            
        # Base query for all sessions for this group with registers
        query = db.session.query(
                TennisGroupTimes.id,
                TennisGroupTimes.start_time,
                TennisGroupTimes.end_time,
                func.count(Register.id).label('register_count')
            )\
            .join(Register, Register.group_time_id == TennisGroupTimes.id)\
            .filter(TennisGroupTimes.group_id == group_id,
                   Register.teaching_period_id == teaching_period_id,
                   Register.tennis_club_id == current_user.tennis_club_id)
        
        # Add day filter only if provided
        if day_of_week:
            from app.models.base import DayOfWeek
            try:
                day_enum = DayOfWeek[day_of_week.upper()]
                query = query.filter(TennisGroupTimes.day_of_week == day_enum)
            except KeyError:
                try:
                    # Try to match by value (Monday, Tuesday, etc.)
                    day_enum = next((d for d in DayOfWeek if d.value.upper() == day_of_week.upper()), None)
                    if day_enum:
                        query = query.filter(TennisGroupTimes.day_of_week == day_enum)
                    else:
                        # Try to match by first 3 letters (MON, TUE, etc.)
                        day_enum = next((d for d in DayOfWeek if d.name[:3] == day_of_week.upper()[:3]), None)
                        if day_enum:
                            query = query.filter(TennisGroupTimes.day_of_week == day_enum)
                except Exception as e:
                    current_app.logger.error(f"Day conversion error: {e}")
                    # Don't return - just continue without the day filter
            
        # Apply coach filter for non-admins
        if not (current_user.is_admin or current_user.is_super_admin):
            query = query.filter(Register.coach_id == current_user.id)
            
        # Group by time slot
        query = query.group_by(
            TennisGroupTimes.id,
            TennisGroupTimes.start_time,
            TennisGroupTimes.end_time
        ).order_by(TennisGroupTimes.start_time)
        
        sessions = query.all()
        
        session_list = [
            {
                'id': session[0],
                'start_time': session[1].strftime('%H:%M') if session[1] else None,
                'end_time': session[2].strftime('%H:%M') if session[2] else None,
                'time_display': f"{session[1].strftime('%H:%M')}-{session[2].strftime('%H:%M')}",
                'register_count': session[3]
            } 
            for session in sessions
        ]
        
        current_app.logger.info(f"Returning {len(session_list)} sessions for group {group_id}")
        return jsonify(session_list)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching sessions: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500 

@register_routes.route('/user/info')
@login_required
@verify_club_access()
def get_user_info():
    """Get current user information"""
    try:
        # Return basic user information needed for filtering
        return jsonify({
            'id': current_user.id,
            'is_admin': current_user.is_admin or current_user.is_super_admin,
            'is_super_admin': current_user.is_super_admin,
            'coach_id': current_user.id if current_user.role == UserRole.COACH else None,
            'name': current_user.name,
            'tennis_club_id': current_user.tennis_club_id
        })
    except Exception as e:
        current_app.logger.error(f"Error fetching user info: {str(e)}")
        return jsonify({'error': str(e)}), 500
    
@register_routes.route('/registers/notes')
@login_required
@verify_club_access()
def get_all_register_notes():
    """Get all notes from registers with filtering options"""
    try:
        # Parse query parameters
        teaching_period_id = request.args.get('period_id', type=int)
        group_id = request.args.get('group_id', type=int)
        day_of_week = request.args.get('day_of_week')
        coach_id = request.args.get('coach_id', type=int)
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        has_notes_only = request.args.get('has_notes_only', 'false').lower() == 'true'
        
        # Query for registers
        query = Register.query.filter(
            Register.tennis_club_id == current_user.tennis_club_id
        )
        
        # Apply filters
        if teaching_period_id:
            query = query.filter(Register.teaching_period_id == teaching_period_id)
        
        # First, check if we need either filter
        if group_id or day_of_week:
            # Do the join only once
            query = query.join(
                TennisGroupTimes, Register.group_time_id == TennisGroupTimes.id
            )
            
            # Then apply individual filters to the already joined table
            if group_id:
                query = query.filter(TennisGroupTimes.group_id == group_id)
                
            if day_of_week:
                from app.models.base import DayOfWeek
                try:
                    day_enum = DayOfWeek[day_of_week.upper()]
                    query = query.filter(TennisGroupTimes.day_of_week == day_enum)
                except KeyError:
                    pass
                
        if coach_id:
            query = query.filter(Register.coach_id == coach_id)
        elif not current_user.is_admin:
            query = query.filter(Register.coach_id == current_user.id)
            
        if start_date:
            try:
                start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
                query = query.filter(Register.date >= start_date)
            except ValueError:
                pass
                
        if end_date:
            try:
                end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
                query = query.filter(Register.date <= end_date)
            except ValueError:
                pass
                
        # Get all entries for registers
        results = []
        
        for register in query.all():
            # Skip registers without notes if filter is applied
            if has_notes_only and not register.notes:
                # Check if any entries have notes
                entry_has_notes = False
                for entry in register.entries:
                    if entry.notes:
                        entry_has_notes = True
                        break
                        
                if not entry_has_notes:
                    continue
                    
            # Process register
            group_time = register.group_time
            group = group_time.tennis_group if group_time else None
            
            # Get entries with notes
            entries_with_notes = []
            for entry in register.entries:
                if entry.notes:  # Only include entries with notes
                    player = entry.programme_player
                    student = player.student if player else None
                    
                    if student:
                        entries_with_notes.append({
                            'id': entry.id,
                            'student_id': student.id,
                            'student_name': student.name,
                            'notes': entry.notes,
                            'player_id': player.id,
                            'attendance_status': serialize_attendance_status(entry.attendance_status)
                        })
            
            # Include register only if it has notes or entries with notes
            if register.notes or entries_with_notes:
                results.append({
                    'id': register.id,
                    'date': register.date.isoformat(),
                    'group': {
                        'id': group.id if group else None,
                        'name': group.name if group else 'Unknown Group'
                    },
                    'time_slot': {
                        'day': group_time.day_of_week.value if group_time else None,
                        'start_time': group_time.start_time.strftime('%H:%M') if group_time and group_time.start_time else None,
                        'end_time': group_time.end_time.strftime('%H:%M') if group_time and group_time.end_time else None
                    },
                    'coach': {
                        'id': register.coach_id,
                        'name': register.coach.name
                    },
                    'notes': register.notes,  # Register-level notes
                    'entries_with_notes': entries_with_notes,
                    'teaching_period': {
                        'id': register.teaching_period_id,
                        'name': register.teaching_period.name
                    }
                })
                
        return jsonify(results)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching register notes: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
    

@register_routes.route('/registers/<int:register_id>/assistant-coaches', methods=['PUT'])
@login_required
@verify_club_access()
def update_assistant_coaches(register_id):
    try:
        register = Register.query.get_or_404(register_id)
        
        # Check permissions
        if not current_user.is_admin and register.coach_id != current_user.id:
            return jsonify({'error': 'Permission denied'}), 403
            
        data = request.get_json()
        coach_ids = data.get('coach_ids', [])
        
        # Validate coach_ids
        if not isinstance(coach_ids, list):
            return jsonify({'error': 'coach_ids must be an array'}), 400
            
        # Clear existing assistant coaches
        RegisterAssistantCoach.query.filter_by(register_id=register_id).delete()
        
        # Add new assistant coaches
        for coach_id in coach_ids:
            # Verify coach exists and belongs to same tennis club
            coach = User.query.filter_by(id=coach_id, tennis_club_id=current_user.tennis_club_id).first()
            if not coach:
                continue
                
            assistant = RegisterAssistantCoach(
                register_id=register_id,
                coach_id=coach_id
            )
            db.session.add(assistant)
            
        db.session.commit()
        
        return jsonify({
            'message': 'Assistant coaches updated successfully',
            'register_id': register_id
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating assistant coaches: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
    
@register_routes.route('/registers/<int:register_id>/clear-notes', methods=['DELETE'])
@login_required
@verify_club_access()
def clear_register_notes(register_id):
    """Clear/delete notes from a register"""
    try:
        register = Register.query.get_or_404(register_id)
        
        # Check permissions - only admin or the coach who created it can delete notes
        if not current_user.is_admin and register.coach_id != current_user.id:
            return jsonify({'error': 'Permission denied'}), 403
        
        # Clear the register notes
        register.notes = ''
        db.session.commit()
        
        return jsonify({
            'message': 'Register notes cleared successfully',
            'register_id': register_id
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error clearing register notes: {str(e)}")
        return jsonify({'error': str(e)}), 500

@register_routes.route('/registers/<int:register_id>/entries/<int:entry_id>/clear-notes', methods=['DELETE'])
@login_required
@verify_club_access()
def clear_entry_notes(register_id, entry_id):
    """Clear/delete notes from a specific register entry"""
    try:
        register = Register.query.get_or_404(register_id)
        
        # Check permissions
        if not current_user.is_admin and register.coach_id != current_user.id:
            return jsonify({'error': 'Permission denied'}), 403
        
        entry = RegisterEntry.query.filter_by(
            id=entry_id,
            register_id=register_id
        ).first_or_404()
        
        # Clear the entry notes
        entry.notes = ''
        db.session.commit()
        
        return jsonify({
            'message': 'Entry notes cleared successfully',
            'entry_id': entry_id
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error clearing entry notes: {str(e)}")
        return jsonify({'error': str(e)}), 500
from flask import Blueprint, request, jsonify, current_app, render_template
from flask_login import login_required, current_user
from app.models import (
    Register, RegisterEntry, TeachingPeriod, TennisGroupTimes, 
    ProgrammePlayers, AttendanceStatus, RegisterStatus, TennisGroup, Student, User
)
from app import db
from app.utils.auth import admin_required
from app.clubs.middleware import verify_club_access
from sqlalchemy import and_, or_, func, case, distinct
from datetime import datetime, timedelta, date
import traceback

# API routes for JSON data
register_routes = Blueprint('registers', __name__, url_prefix='/api')

# View routes for HTML pages
register_views = Blueprint('register_views', __name__, url_prefix='/registers')

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
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        coach_id = request.args.get('coach_id', type=int)
        
        # Start with base query
        query = Register.query.filter_by(tennis_club_id=current_user.tennis_club_id)
        
        # Apply filters
        if teaching_period_id:
            query = query.filter_by(teaching_period_id=teaching_period_id)
            
        if group_id:
            query = query.join(TennisGroupTimes).filter(TennisGroupTimes.group_id == group_id)
            
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
                
        # Coach filter - admin can see all, coach can only see their own
        if not current_user.is_admin:
            query = query.filter_by(coach_id=current_user.id)
        elif coach_id:  # Admin filtering by specific coach
            query = query.filter_by(coach_id=coach_id)
        
        # Order by date (most recent first)
        registers = query.order_by(Register.date.desc()).all()
        
        # Calculate attendance stats for each register
        results = []
        for register in registers:
            # Count entries by status
            present_count = sum(1 for entry in register.entries if entry.attendance_status == AttendanceStatus.PRESENT)
            absent_count = sum(1 for entry in register.entries if entry.attendance_status == AttendanceStatus.ABSENT)
            excused_count = sum(1 for entry in register.entries if entry.attendance_status == AttendanceStatus.EXCUSED)
            late_count = sum(1 for entry in register.entries if entry.attendance_status == AttendanceStatus.LATE)
            
            # Get group info from the group time
            group_name = register.group_time.tennis_group.name if register.group_time else "Unknown Group"
            
            # Calculate attendance rate
            total_entries = len(register.entries)
            attendance_rate = round((present_count + late_count) / total_entries * 100, 1) if total_entries > 0 else 0
            
            results.append({
                'id': register.id,
                'date': register.date.isoformat(),
                'group_name': group_name,
                'coach_name': register.coach.name,
                'time_slot': {
                    'day': register.group_time.day_of_week.value if register.group_time else None,
                    'start_time': register.group_time.start_time.strftime('%H:%M') if register.group_time else None,
                    'end_time': register.group_time.end_time.strftime('%H:%M') if register.group_time else None
                },
                'status': register.status.value,
                'stats': {
                    'total': total_entries,
                    'present': present_count,
                    'absent': absent_count,
                    'excused': excused_count,
                    'late': late_count,
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
                entries.append({
                    'id': entry.id,
                    'student_id': student.id,
                    'student_name': student.name,
                    'attendance_status': entry.attendance_status.value,
                    'notes': entry.notes,
                    'player_id': player.id,
                    'predicted_attendance': entry.predicted_attendance
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
            'status': register.status.value,
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
            coach_id=current_user.id,  # Current user is the coach creating the register
            date=register_date,
            teaching_period_id=data['teaching_period_id'],
            status=RegisterStatus.DRAFT,
            notes=data.get('notes', ''),
            tennis_club_id=current_user.tennis_club_id
        )
        
        db.session.add(register)
        db.session.flush()  # Get register.id without committing yet
        
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
            
        if 'status' in data:
            try:
                register.status = RegisterStatus[data['status'].upper()]
            except KeyError:
                return jsonify({'error': f"Invalid status value. Must be one of: {', '.join([s.name.lower() for s in RegisterStatus])}"}), 400
                
        if current_user.is_admin and 'coach_id' in data:
            register.coach_id = data['coach_id']
            
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
            
        # Keep track of updates
        updated_count = 0
        errors = []
        
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
                
            # Update attendance status
            if 'attendance_status' in entry_data:
                try:
                    entry.attendance_status = AttendanceStatus[entry_data['attendance_status'].upper()]
                except KeyError:
                    errors.append(f"Invalid attendance status for entry {entry.id}: {entry_data['attendance_status']}")
                    continue
                    
            # Update notes
            if 'notes' in entry_data:
                entry.notes = entry_data['notes']
                
            # Update predicted attendance
            if 'predicted_attendance' in entry_data:
                entry.predicted_attendance = bool(entry_data['predicted_attendance'])
                
            updated_count += 1
            
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
@admin_required  # Only admins can delete registers
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
        # Get current teaching period
        current_period = TeachingPeriod.query.filter(
            TeachingPeriod.tennis_club_id == current_user.tennis_club_id,
            TeachingPeriod.start_date <= func.current_date(),
            TeachingPeriod.end_date >= func.current_date()
        ).order_by(TeachingPeriod.start_date.desc()).first()
        
        if not current_period:
            return jsonify([])
            
        # Get all group times for this club that the current user coaches
        query = TennisGroupTimes.query.join(
            ProgrammePlayers, ProgrammePlayers.group_time_id == TennisGroupTimes.id
        ).filter(
            TennisGroupTimes.tennis_club_id == current_user.tennis_club_id,
            ProgrammePlayers.teaching_period_id == current_period.id
        )
        
        # Non-admins can only see their assigned groups
        if not current_user.is_admin:
            query = query.filter(ProgrammePlayers.coach_id == current_user.id)
            
        # Make the query distinct
        query = query.group_by(TennisGroupTimes.id)
        
        group_times = query.all()
        
        # Generate upcoming dates for the next 4 weeks
        today = date.today()
        upcoming_dates = []
        for i in range(28):  # 4 weeks
            upcoming_dates.append(today + timedelta(days=i))
            
        # For each group time, find sessions that don't have registers yet
        upcoming_sessions = []
        
        for group_time in group_times:
            # Get the day of week for this group time
            day_of_week = group_time.day_of_week.name  # e.g., "MONDAY"
            
            # Find dates with this day of week
            for check_date in upcoming_dates:
                if check_date.strftime('%A').upper() == day_of_week:
                    # Check if register already exists for this date and group time
                    existing_register = Register.query.filter_by(
                        group_time_id=group_time.id,
                        date=check_date,
                        teaching_period_id=current_period.id
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
            
        # Non-admins can only see their assigned groups
        if not current_user.is_admin:
            query = query.filter(Register.coach_id == current_user.id)
            
        entries = query.all()
        
        # Process results based on requested type
        stats_type = request.args.get('type', 'summary')
        
        if stats_type == 'summary':
            # Overall summary statistics
            total_entries = len(entries)
            present_count = sum(1 for entry, *_ in entries if entry.attendance_status == AttendanceStatus.PRESENT)
            absent_count = sum(1 for entry, *_ in entries if entry.attendance_status == AttendanceStatus.ABSENT)
            excused_count = sum(1 for entry, *_ in entries if entry.attendance_status == AttendanceStatus.EXCUSED)
            late_count = sum(1 for entry, *_ in entries if entry.attendance_status == AttendanceStatus.LATE)
            
            attendance_rate = round((present_count + late_count) / total_entries * 100, 1) if total_entries > 0 else 0
            
            return jsonify({
                'total_sessions': total_entries,
                'present': present_count,
                'absent': absent_count,
                'excused': excused_count,
                'late': late_count,
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
                        'excused': 0,
                        'late': 0
                    }
                    
                group_stats[group_id]['total'] += 1
                
                if entry.attendance_status == AttendanceStatus.PRESENT:
                    group_stats[group_id]['present'] += 1
                elif entry.attendance_status == AttendanceStatus.ABSENT:
                    group_stats[group_id]['absent'] += 1
                elif entry.attendance_status == AttendanceStatus.EXCUSED:
                    group_stats[group_id]['excused'] += 1
                elif entry.attendance_status == AttendanceStatus.LATE:
                    group_stats[group_id]['late'] += 1
            
            # Calculate attendance rates
            for stats in group_stats.values():
                stats['attendance_rate'] = round(
                    (stats['present'] + stats['late']) / stats['total'] * 100, 1
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
                        'excused': 0,
                        'late': 0
                    }
                    
                student_stats[student_id]['total'] += 1
                
                if entry.attendance_status == AttendanceStatus.PRESENT:
                    student_stats[student_id]['present'] += 1
                elif entry.attendance_status == AttendanceStatus.ABSENT:
                    student_stats[student_id]['absent'] += 1
                elif entry.attendance_status == AttendanceStatus.EXCUSED:
                    student_stats[student_id]['excused'] += 1
                elif entry.attendance_status == AttendanceStatus.LATE:
                    student_stats[student_id]['late'] += 1
            
            # Calculate attendance rates
            for stats in student_stats.values():
                stats['attendance_rate'] = round(
                    (stats['present'] + stats['late']) / stats['total'] * 100, 1
                ) if stats['total'] > 0 else 0
                
            return jsonify(list(student_stats.values()))
            
        else:
            return jsonify({'error': 'Invalid stats type'}), 400
            
    except Exception as e:
        current_app.logger.error(f"Error generating attendance stats: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
    
# Add this new endpoint to your register_routes in app/routes/registers.py

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
            results.append({
                'id': player.id,
                'student_id': player.student_id,
                'student_name': player.student.name,
                'attendance_status': 'present',  # Default to present for new registers
                'notes': '',
                'predicted_attendance': False
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
        
        # Find all group times for this day that the coach is assigned to
        query = TennisGroupTimes.query.join(
            ProgrammePlayers, ProgrammePlayers.group_time_id == TennisGroupTimes.id
        ).join(
            TennisGroup, TennisGroupTimes.group_id == TennisGroup.id
        ).filter(
            TennisGroupTimes.tennis_club_id == current_user.tennis_club_id,
            ProgrammePlayers.teaching_period_id == teaching_period_id,
            func.upper(TennisGroupTimes.day_of_week.name) == day_of_week.upper()
        )
        
        # For non-admins, only show their assigned groups
        if not current_user.is_admin:
            query = query.filter(ProgrammePlayers.coach_id == current_user.id)
            
        # Make the query distinct
        group_times = query.distinct(TennisGroupTimes.id).all()
        
        # Format as JSON
        results = []
        for group_time in group_times:
            # Get player count
            player_count = ProgrammePlayers.query.filter_by(
                group_time_id=group_time.id,
                teaching_period_id=teaching_period_id,
                tennis_club_id=current_user.tennis_club_id
            ).count()
            
            # Add to results
            results.append({
                'id': group_time.id,
                'group_name': group_time.tennis_group.name,
                'day': group_time.day_of_week.value,
                'start_time': group_time.start_time.strftime('%H:%M'),
                'end_time': group_time.end_time.strftime('%H:%M'),
                'player_count': player_count,
                'teaching_period_id': teaching_period_id
            })
        
        return jsonify(results)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching coach sessions: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
from flask import Blueprint, request, jsonify, current_app, render_template
from flask_login import login_required, current_user
from app.models import (
    Register, RegisterEntry, TeachingPeriod, TennisGroupTimes, 
    ProgrammePlayers, AttendanceStatus, TennisGroup, Student, User, RegisterAssistantCoach, DayOfWeek,
    Cancellation, CancellationType, SessionPlan
)
from app import db
from app.models.base import UserRole
from app.utils.auth import admin_required
from app.clubs.middleware import verify_club_access
from sqlalchemy import and_, or_, func, case, distinct
from datetime import datetime, timedelta, date
import traceback
from app.services.email_service import EmailService
from sqlalchemy import desc
from app.routes.cancellations import get_cancelled_sessions_in_range, is_session_cancelled

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
def apply_session_plan_to_register(register, group_time_id, register_date, teaching_period_id):
    """
    Apply session plan entries to a register if a plan exists.
    This is completely optional - if no session plan exists, the register will use default logic.
    
    Args:
        register: The Register object to populate
        group_time_id: Group time ID
        register_date: Date of the register
        teaching_period_id: Teaching period ID
        
    Returns:
        tuple: (plan_found, entries_added, trial_players_info)
    """
    from app.models.session_planning import SessionPlan, SessionPlanEntry, TrialPlayer, PlannedAttendanceStatus, PlayerType
    
    # Check if a session plan exists for this session (OPTIONAL)
    session_plan = SessionPlan.query.filter_by(
        group_time_id=group_time_id,
        date=register_date,
        teaching_period_id=teaching_period_id,
        tennis_club_id=current_user.tennis_club_id,
        is_active=True
    ).first()
    
    if not session_plan:
        current_app.logger.info(f"No session plan found for group_time_id={group_time_id}, date={register_date} - using default register creation")
        return False, 0, []
    
    current_app.logger.info(f"Found session plan {session_plan.id} for register creation - applying planned attendance")
    
    # Map planned status to attendance status
    status_mapping = {
        PlannedAttendanceStatus.PLANNED_PRESENT: AttendanceStatus.PRESENT,
        PlannedAttendanceStatus.PLANNED_ABSENT: AttendanceStatus.AWAY_WITH_NOTICE,
        PlannedAttendanceStatus.TRIAL_PLAYER: AttendanceStatus.PRESENT,
        PlannedAttendanceStatus.MAKEUP_PLAYER: AttendanceStatus.PRESENT
    }
    
    entries_added = 0
    
    # Process planned entries
    for plan_entry in session_plan.plan_entries:
        # Map planned status to attendance status
        attendance_status = status_mapping.get(
            plan_entry.planned_status, 
            AttendanceStatus.ABSENT
        )
        
        # Create register entry
        register_entry = RegisterEntry(
            register_id=register.id,
            programme_player_id=plan_entry.programme_player_id,
            attendance_status=attendance_status,
            notes=plan_entry.notes or '',
            predicted_attendance=False
        )
        
        db.session.add(register_entry)
        entries_added += 1
        
        # Log makeup players
        if plan_entry.player_type == PlayerType.MAKEUP:
            student_name = plan_entry.programme_player.student.name if plan_entry.programme_player else "Unknown"
            current_app.logger.info(f"Added planned makeup player: {student_name}")
    
    # Get trial players information (they can't be added as RegisterEntry since they're not ProgrammePlayers)
    trial_players_info = []
    for trial_player in session_plan.trial_players:
        trial_players_info.append({
            'id': trial_player.id,
            'name': trial_player.name,
            'contact_email': trial_player.contact_email,
            'contact_number': trial_player.contact_number,
            'notes': trial_player.notes,
            'date_of_birth': trial_player.date_of_birth.isoformat() if trial_player.date_of_birth else None
        })
    
    # Add session plan notes to register notes if they exist
    if session_plan.notes and not register.notes:
        register.notes = f"From session plan: {session_plan.notes}"
    elif session_plan.notes and register.notes:
        register.notes = f"{register.notes}\n\nFrom session plan: {session_plan.notes}"
    
    current_app.logger.info(f"Applied session plan: {entries_added} entries, {len(trial_players_info)} trial players")
    
    return True, entries_added, trial_players_info

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
        
        # Format regular player entries
        entries = []
        for entry in register.entries:
            player = entry.programme_player
            student = player.student if player else None
            
            if student:
                # Determine if this is a makeup player
                is_makeup = False
                group_name = None
                
                if player.group_time_id != register.group_time_id:
                    is_makeup = True
                    group_name = player.tennis_group.name
                
                entries.append({
                    'id': entry.id,
                    'student_id': student.id,
                    'student_name': student.name,
                    'attendance_status': serialize_attendance_status(entry.attendance_status),
                    'notes': entry.notes,
                    'player_id': player.id,
                    'predicted_attendance': entry.predicted_attendance,
                    'is_makeup': is_makeup,
                    'is_trial': False,
                    'group_name': group_name,
                    'contact_email': student.contact_email,
                    'contact_number': student.contact_number,
                    'emergency_contact_number': student.emergency_contact_number,
                    'date_of_birth': student.date_of_birth.isoformat() if student.date_of_birth else None
                })
        
        # Get trial players from session plan (if one exists for this register)
        from app.models.session_planning import SessionPlan
        session_plan = SessionPlan.query.filter_by(
            group_time_id=register.group_time_id,
            date=register.date,
            teaching_period_id=register.teaching_period_id,
            tennis_club_id=current_user.tennis_club_id,
            is_active=True
        ).first()
        
        if session_plan:
            # Add trial players from the session plan
            for trial_player in session_plan.trial_players:
                entries.append({
                    'id': f"trial_{trial_player.id}",
                    'student_id': None,
                    'student_name': trial_player.name,
                    'attendance_status': 'present',  # Default trial players to present
                    'notes': trial_player.notes or '',
                    'player_id': None,
                    'trial_player_id': trial_player.id,
                    'predicted_attendance': False,
                    'is_makeup': False,
                    'is_trial': True,
                    'group_name': None,
                    'contact_email': trial_player.contact_email,
                    'contact_number': trial_player.contact_number,
                    'emergency_contact_number': None,
                    'date_of_birth': trial_player.date_of_birth.isoformat() if trial_player.date_of_birth else None
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
            'assistant_coaches': assistant_coaches,
            'notes': register.notes, 
            'entries': entries,  # Now includes trial players
            'teaching_period': {
                'id': register.teaching_period_id,
                'name': register.teaching_period.name
            }
        }
        
        # Log summary for debugging
        regular_count = len([e for e in entries if not e.get('is_trial', False) and not e.get('is_makeup', False)])
        makeup_count = len([e for e in entries if e.get('is_makeup', False)])
        trial_count = len([e for e in entries if e.get('is_trial', False)])
        current_app.logger.info(f"Register {register_id}: {regular_count} regular, {makeup_count} makeup, {trial_count} trial players")
        
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

        # Get ALL regular players for this group time and teaching period
        all_regular_players = ProgrammePlayers.query.filter_by(
            group_time_id=data['group_time_id'],
            teaching_period_id=data['teaching_period_id'],
            tennis_club_id=current_user.tennis_club_id
        ).all()

        # Check if there's a session plan for this session
        from app.models.session_planning import SessionPlan, PlannedAttendanceStatus, PlayerType
        session_plan = SessionPlan.query.filter_by(
            group_time_id=data['group_time_id'],
            date=register_date,
            teaching_period_id=data['teaching_period_id'],
            tennis_club_id=current_user.tennis_club_id,
            is_active=True
        ).first()

        # Create mapping of planned statuses if session plan exists
        planned_statuses = {}
        if session_plan:
            for plan_entry in session_plan.plan_entries:
                planned_statuses[plan_entry.programme_player_id] = plan_entry

        # Create register entries for ALL regular players
        regular_entries_added = 0
        for player in all_regular_players:
            plan_entry = planned_statuses.get(player.id)
            
            # Determine attendance status based on session plan or default
            if plan_entry:
                if plan_entry.planned_status == PlannedAttendanceStatus.PLANNED_PRESENT:
                    attendance_status = AttendanceStatus.PRESENT
                elif plan_entry.planned_status == PlannedAttendanceStatus.PLANNED_ABSENT:
                    attendance_status = AttendanceStatus.AWAY_WITH_NOTICE
                else:
                    attendance_status = AttendanceStatus.PRESENT
                notes = plan_entry.notes or ''
            else:
                # Player not in session plan - use default
                attendance_status = AttendanceStatus.PRESENT
                notes = ''
            
            entry = RegisterEntry(
                register_id=register.id,
                programme_player_id=player.id,
                attendance_status=attendance_status,
                notes=notes,
                predicted_attendance=True
            )
            db.session.add(entry)
            regular_entries_added += 1

        # Add makeup players from session plan (if any)
        makeup_entries_added = 0
        if session_plan:
            for plan_entry in session_plan.plan_entries:
                if (plan_entry.player_type == PlayerType.MAKEUP and 
                    plan_entry.programme_player.group_time_id != data['group_time_id']):
                    
                    # Check if this makeup player is already added
                    existing_entry = RegisterEntry.query.filter_by(
                        register_id=register.id,
                        programme_player_id=plan_entry.programme_player_id
                    ).first()
                    
                    if not existing_entry:
                        entry = RegisterEntry(
                            register_id=register.id,
                            programme_player_id=plan_entry.programme_player_id,
                            attendance_status=AttendanceStatus.PRESENT,
                            notes=plan_entry.notes or '',
                            predicted_attendance=False
                        )
                        db.session.add(entry)
                        makeup_entries_added += 1

        # Add any additional makeup players from the request
        additional_makeup_ids = data.get('makeup_player_ids', [])
        additional_makeup_added = 0
        if additional_makeup_ids:
            # Get existing player IDs to avoid duplicates
            existing_player_ids = {entry.programme_player_id for entry in 
                                 RegisterEntry.query.filter_by(register_id=register.id).all()}
            
            # Filter out players already added
            new_makeup_ids = [pid for pid in additional_makeup_ids if pid not in existing_player_ids]
            
            if new_makeup_ids:
                makeup_players = ProgrammePlayers.query.filter(
                    ProgrammePlayers.id.in_(new_makeup_ids),
                    ProgrammePlayers.teaching_period_id==data['teaching_period_id'],
                    ProgrammePlayers.tennis_club_id==current_user.tennis_club_id
                ).all()
                
                for makeup_player in makeup_players:
                    entry = RegisterEntry(
                        register_id=register.id,
                        programme_player_id=makeup_player.id,
                        attendance_status=AttendanceStatus.PRESENT,
                        notes='',
                        predicted_attendance=False
                    )
                    db.session.add(entry)
                    additional_makeup_added += 1

        # Get trial players info if session plan exists
        trial_players_info = []
        if session_plan:
            for trial_player in session_plan.trial_players:
                trial_players_info.append({
                    'id': trial_player.id,
                    'name': trial_player.name,
                    'contact_email': trial_player.contact_email,
                    'contact_number': trial_player.contact_number,
                    'notes': trial_player.notes,
                    'date_of_birth': trial_player.date_of_birth.isoformat() if trial_player.date_of_birth else None
                })

        # Update register notes with session plan notes if they exist
        if session_plan and session_plan.notes:
            if register.notes:
                register.notes = f"{register.notes}\n\nFrom session plan: {session_plan.notes}"
            else:
                register.notes = f"From session plan: {session_plan.notes}"

        # Commit all changes to database
        db.session.commit()

        response_data = {
            'message': 'Register created successfully',
            'register_id': register.id,
            'used_session_plan': session_plan is not None,
            'regular_entries_added': regular_entries_added,
            'makeup_entries_added': makeup_entries_added,
            'additional_makeup_added': additional_makeup_added,
            'trial_players_info': trial_players_info,
            'total_entries': regular_entries_added + makeup_entries_added + additional_makeup_added
        }

        current_app.logger.info(f"Register {register.id} created with {response_data['total_entries']} total entries")
        
        return jsonify(response_data), 201
        
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
            
        # Define status mapping
        status_map = {
            'present': AttendanceStatus.PRESENT,
            'absent': AttendanceStatus.ABSENT,
            'sick': AttendanceStatus.SICK,
            'away_with_notice': AttendanceStatus.AWAY_WITH_NOTICE
        }
        
        # Keep track of updates
        updated_count = 0
        errors = []
        
        current_app.logger.info(f"Updating {len(entries)} register entries for register {register_id}")
        
        # Use no_autoflush to prevent premature flushes
        with db.session.no_autoflush:
            for entry_data in entries:
                player_id = entry_data.get('player_id')
                
                if not player_id:
                    errors.append(f"Missing player_id in entry data: {entry_data}")
                    continue
                
                # Find the register entry for this player
                entry = RegisterEntry.query.filter_by(
                    register_id=register_id,
                    programme_player_id=player_id
                ).first()
                
                if not entry:
                    errors.append(f"Register entry not found for player_id: {player_id}")
                    continue
                
                # Update attendance status
                if 'attendance_status' in entry_data:
                    status_value = serialize_attendance_status(entry_data['attendance_status'])
                    if status_value in status_map:
                        entry.attendance_status = status_map[status_value]
                        current_app.logger.debug(f"Updated player {player_id} attendance to {status_value}")
                    else:
                        errors.append(f"Invalid attendance status for player {player_id}: {status_value}")
                        continue
                
                # Update notes
                if 'notes' in entry_data:
                    entry.notes = entry_data['notes']
                    current_app.logger.debug(f"Updated player {player_id} notes")
                
                # Update predicted attendance
                if 'predicted_attendance' in entry_data:
                    entry.predicted_attendance = bool(entry_data['predicted_attendance'])
                
                updated_count += 1
        
        # Commit the changes to the database
        db.session.commit()
        
        # Check for consecutive absences and send notification emails
        process_absence_notifications(register_id)
        
        current_app.logger.info(f"Successfully updated {updated_count} register entries")
        
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
    """Get players for a specific group time and teaching period with session plan information"""
    try:
        group_time_id = request.args.get('group_time_id', type=int)
        teaching_period_id = request.args.get('teaching_period_id', type=int)
        date_str = request.args.get('date')  # Optional date for session plan lookup
        
        if not group_time_id or not teaching_period_id:
            return jsonify({'error': 'Group time ID and teaching period ID are required'}), 400
        
        # Parse date if provided
        session_date = None
        if date_str:
            try:
                session_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            except ValueError:
                return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
        
        # Check for session plan if date is provided
        session_plan = None
        if session_date:
            from app.models.session_planning import SessionPlan
            session_plan = SessionPlan.query.filter_by(
                group_time_id=group_time_id,
                date=session_date,
                teaching_period_id=teaching_period_id,
                tennis_club_id=current_user.tennis_club_id,
                is_active=True
            ).first()
        
        # Get regular players for this group time and teaching period
        players = ProgrammePlayers.query.filter_by(
            group_time_id=group_time_id,
            teaching_period_id=teaching_period_id,
            tennis_club_id=current_user.tennis_club_id
        ).join(
            Student, ProgrammePlayers.student_id == Student.id
        ).all()
        
        # Create a mapping of player IDs to their plan entries
        plan_entries_map = {}
        makeup_players_from_plan = []
        
        if session_plan:
            from app.models.session_planning import PlayerType, PlannedAttendanceStatus
            
            # Map plan entries by player ID
            for plan_entry in session_plan.plan_entries:
                plan_entries_map[plan_entry.programme_player_id] = plan_entry
                
                # If this is a makeup player, add to makeup list
                if plan_entry.player_type == PlayerType.MAKEUP:
                    makeup_players_from_plan.append(plan_entry.programme_player_id)
        
        # Format regular players as JSON
        results = []
        for player in players:
            # Format date of birth if available, otherwise None
            dob = player.student.date_of_birth.isoformat() if player.student.date_of_birth else None
            
            # Get planned information if available
            plan_entry = plan_entries_map.get(player.id)
            planned_status = None
            planned_notes = ''
            is_makeup_from_plan = player.id in makeup_players_from_plan
            
            if plan_entry:
                planned_status = plan_entry.planned_status.value
                planned_notes = plan_entry.notes or ''
            
            # Determine default attendance status based on plan
            default_attendance = 'present'  # Changed default to present
            if plan_entry:
                if plan_entry.planned_status == PlannedAttendanceStatus.PLANNED_PRESENT:
                    default_attendance = 'present'
                elif plan_entry.planned_status == PlannedAttendanceStatus.PLANNED_ABSENT:
                    default_attendance = 'away_with_notice'  # Changed from absent to away_with_notice
                elif plan_entry.planned_status in [PlannedAttendanceStatus.MAKEUP_PLAYER, PlannedAttendanceStatus.TRIAL_PLAYER]:
                    default_attendance = 'present'
            
            results.append({
                'id': player.id,
                'student_id': player.student_id,
                'student_name': player.student.name,
                'contact_number': player.student.contact_number,
                'emergency_contact_number': player.student.emergency_contact_number,
                'medical_information': player.student.medical_information,
                'walk_home': player.walk_home,
                'attendance_status': serialize_attendance_status(default_attendance),
                'notes': planned_notes,
                'predicted_attendance': True,
                'date_of_birth': dob,
                'contact_email': player.student.contact_email,
                # Session plan information
                'has_plan': plan_entry is not None,
                'planned_status': planned_status,
                'is_makeup_from_plan': is_makeup_from_plan,
                'original_group_name': player.tennis_group.name if is_makeup_from_plan else None,
                'is_trial': False,
                'player_type': 'regular'
            })
        
        # Add makeup players from other groups if they're in the plan
        if session_plan:
            for plan_entry in session_plan.plan_entries:
                if (plan_entry.player_type == PlayerType.MAKEUP and 
                    plan_entry.programme_player_id not in [p.id for p in players]):
                    
                    makeup_player = plan_entry.programme_player
                    if makeup_player and makeup_player.student:
                        dob = makeup_player.student.date_of_birth.isoformat() if makeup_player.student.date_of_birth else None
                        
                        results.append({
                            'id': makeup_player.id,
                            'student_id': makeup_player.student_id,
                            'student_name': makeup_player.student.name,
                            'contact_number': makeup_player.student.contact_number,
                            'emergency_contact_number': makeup_player.student.emergency_contact_number,
                            'medical_information': makeup_player.student.medical_information,
                            'walk_home': makeup_player.walk_home,
                            'attendance_status': serialize_attendance_status('present'),
                            'notes': plan_entry.notes or '',
                            'predicted_attendance': False,
                            'date_of_birth': dob,
                            'contact_email': makeup_player.student.contact_email,
                            # Session plan information
                            'has_plan': True,
                            'planned_status': plan_entry.planned_status.value,
                            'is_makeup_from_plan': True,
                            'original_group_name': makeup_player.tennis_group.name,
                            'is_trial': False,
                            'player_type': 'makeup'
                        })
        
        # Add trial players from session plan
        trial_players = []
        if session_plan:
            for trial_player in session_plan.trial_players:
                trial_players.append({
                    'id': f"trial_{trial_player.id}",  # Use special ID format to avoid conflicts
                    'trial_player_id': trial_player.id,
                    'student_id': None,
                    'student_name': trial_player.name,
                    'contact_number': trial_player.contact_number,
                    'emergency_contact_number': None,
                    'medical_information': None,
                    'walk_home': None,
                    'attendance_status': 'present',  # Default trial players to present
                    'notes': trial_player.notes or '',
                    'predicted_attendance': False,
                    'date_of_birth': trial_player.date_of_birth.isoformat() if trial_player.date_of_birth else None,
                    'contact_email': trial_player.contact_email,
                    'is_trial': True,
                    'player_type': 'trial'
                })
        
        # Include session plan summary information
        response = {
            'players': results,
            'trial_players': trial_players,
            'session_plan': None
        }
        
        if session_plan:
            response['session_plan'] = {
                'id': session_plan.id,
                'notes': session_plan.notes,
                'planned_by': session_plan.planned_by.name if session_plan.planned_by else 'Unknown',
                'trial_players_count': len(trial_players),
                'summary': session_plan.get_plan_summary()
            }
        
        return jsonify(response)
        
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
    
# Add this new route to registers.py

@register_routes.route('/players/search')
@login_required
@verify_club_access()
def search_makeup_players():
    """Search for players from other groups for makeup classes"""
    try:
        # Get query parameters
        teaching_period_id = request.args.get('teaching_period_id', type=int)
        exclude_group_time_id = request.args.get('exclude_group_time_id', type=int)
        query = request.args.get('query', '').strip()
        
        if not teaching_period_id or not exclude_group_time_id:
            return jsonify({'error': 'Missing required parameters'}), 400
        
        # Base query for players in the same teaching period but different group times
        # JOIN with TennisGroupTimes to get day and time information
        players_query = ProgrammePlayers.query.join(
            Student, ProgrammePlayers.student_id == Student.id
        ).join(
            TennisGroup, ProgrammePlayers.group_id == TennisGroup.id
        ).join(
            TennisGroupTimes, ProgrammePlayers.group_time_id == TennisGroupTimes.id
        ).filter(
            ProgrammePlayers.teaching_period_id == teaching_period_id,
            ProgrammePlayers.tennis_club_id == current_user.tennis_club_id,
            ProgrammePlayers.group_time_id != exclude_group_time_id
        )
        
        # Add name search filter if provided
        if query:
            players_query = players_query.filter(
                Student.name.ilike(f'%{query}%')
            )
        
        # Get players
        players = players_query.all()
        
        # Format response
        results = []
        for player in players:
            student = player.student
            group = player.tennis_group
            # Get the group time information
            group_time = player.group_time
            
            results.append({
                'id': player.id,
                'student_id': student.id,
                'student_name': student.name,
                'group_name': group.name,
                'contact_number': student.contact_number,
                'emergency_contact_number': student.emergency_contact_number,
                'medical_information': student.medical_information,
                'walk_home': player.walk_home,
                'contact_email': student.contact_email,
                'date_of_birth': student.date_of_birth.isoformat() if student.date_of_birth else None,
                'attendance_status': 'present',
                'notes': '',
                'predicted_attendance': False,
                # ADD THE TIME INFORMATION HERE
                'day_of_week': group_time.day_of_week.value if group_time and group_time.day_of_week else None,
                'start_time': group_time.start_time.strftime('%H:%M:%S') if group_time and group_time.start_time else None,
                'end_time': group_time.end_time.strftime('%H:%M:%S') if group_time and group_time.end_time else None
            })
        
        return jsonify(results)
        
    except Exception as e:
        current_app.logger.error(f"Error searching makeup players: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
    


# Add these new functions to registers.py

def get_consecutive_absence_count(player_id, teaching_period_id, up_to_date=None):
    """
    Calculate the number of consecutive absences for a player.
    Only 'absent' status counts - sick and away_with_notice break the streak.
    
    Args:
        player_id: The programme player ID
        teaching_period_id: The teaching period ID 
        up_to_date: Count absences up to this date (inclusive). If None, uses all dates.
    
    Returns:
        int: Number of consecutive absences from most recent backwards
    """
    try:
        # Query register entries for this player in chronological order (newest first)
        query = db.session.query(RegisterEntry, Register).join(
            Register, RegisterEntry.register_id == Register.id
        ).filter(
            RegisterEntry.programme_player_id == player_id,
            Register.teaching_period_id == teaching_period_id
        )
        
        # Filter by date if specified
        if up_to_date:
            query = query.filter(Register.date <= up_to_date)
            
        # Order by date descending (most recent first)
        register_entries = query.order_by(desc(Register.date)).all()
        
        # Count consecutive absences from the most recent entry backwards
        consecutive_count = 0
        for entry, register in register_entries:
            if entry.attendance_status == AttendanceStatus.ABSENT:
                consecutive_count += 1
            else:
                # Any non-absent status breaks the consecutive streak
                break
                
        return consecutive_count
        
    except Exception as e:
        current_app.logger.error(f"Error calculating consecutive absences: {str(e)}")
        return 0

def send_absence_notification_email(programme_player, register, absence_count):
    """
    Send email notification to parent/guardian about consecutive absences.
    
    Args:
        programme_player: ProgrammePlayers object
        register: Register object where the absence was recorded
        absence_count: Number of consecutive absences
    """
    try:
        student = programme_player.student
        club = programme_player.tennis_club
        group = programme_player.tennis_group
        
        # Verify we have an email address to send to
        if not student.contact_email:
            current_app.logger.warning(f"Cannot send absence email - no contact email for student {student.name}")
            return False
        
        # Get time information from the register's group_time
        time_display = "session"  # Default fallback
        day_display = ""
        
        if register.group_time:
            group_time = register.group_time
            if group_time.start_time and group_time.end_time:
                time_display = f"{group_time.start_time.strftime('%H:%M')}-{group_time.end_time.strftime('%H:%M')}"
            
            if group_time.day_of_week:
                day_display = f"{group_time.day_of_week.value} "
        
        # Combine day and time for a complete session description
        session_description = f"{day_display}{time_display}"
        full_session_name = f"{group.name} ({session_description})"
        
        # Prepare email subject and content
        email_subject = f"Attendance Notice for {student.name} - {group.name}"
        
        # Check if this is a Wilton club (contains "Wilton" in the name) for customized email content
        if "wilton" in club.name.lower():
            # Wilton-specific email content
            email_html = f"""
            <html>
                <body style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto;">
                        <div style="margin-bottom: 30px;">
                            <p>Dear {student.name} or Parent/Guardian,</p>
                            <p>We've noticed that <strong>{student.name}</strong> has missed the <strong>{full_session_name}</strong> session 3 times in a row.</p>
                            <p>We wanted to check in to see if there were any issues with the session and whether you are planning on being there in future weeks.</p>
                            <p>If there's anything you want to discuss, please get in contact with Marc using the following email: headcoach@wiltontennisclub.co.uk.</p>
                            <p>Thanks,<br>Marc Beckles, Head Coach</p>
                        </div>
                        <div style="font-size: 0.9em; color: #666; border-top: 1px solid #eee; padding-top: 15px;">
                            <p>This is an automated attendance notification from {club.name}.</p>
                            <p>Please do not reply to this email.</p>
                        </div>
                    </div>
                </body>
            </html>
            """
        else:
            # Generic email content for all other clubs
            email_html = f"""
            <html>
                <body style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto;">
                        <div style="margin-bottom: 30px;">
                            <p>Dear {student.name} or Parent/Guardian,</p>
                            <p>We've noticed that <strong>{student.name}</strong> has missed the <strong>{full_session_name}</strong> session 3 times in a row.</p>
                            <p>We wanted to check in to see if there were any issues with the session and whether you are planning on being there in future weeks.</p>
                            <p>If there's anything you want to discuss, please get in contact with the {club.name} coaching team.</p>
                            <p>Thanks,<br>{club.name}</p>
                        </div>
                        <div style="font-size: 0.9em; color: #666; border-top: 1px solid #eee; padding-top: 15px;">
                            <p>This is an automated attendance notification from {club.name}.</p>
                            <p>Please do not reply to this email.</p>
                        </div>
                    </div>
                </body>
            </html>
            """
        
        # Send email using the existing email service
        email_service = EmailService()
        success, result = email_service.send_generic_email(
            recipient_email=student.contact_email,
            subject=email_subject,
            html_content=email_html,
            sender_name=club.name
        )
        
        if success:
            current_app.logger.info(f"Absence notification email sent successfully to {student.contact_email} for {student.name} - {full_session_name}")
            return True
        else:
            current_app.logger.error(f"Failed to send absence notification email: {result}")
            return False
            
    except Exception as e:
        current_app.logger.error(f"Error sending absence notification email: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return False

def process_absence_notifications(register_id):
    """
    Check all absent players in a register and send emails for those with exactly 3 consecutive absences.
    
    Args:
        register_id: ID of the register that was just created/updated
    """
    try:
        register = Register.query.get(register_id)
        if not register:
            current_app.logger.warning(f"Register {register_id} not found for absence notification processing")
            return
            
        # Find all entries in this register marked as absent
        absent_entries = RegisterEntry.query.filter_by(
            register_id=register_id,
            attendance_status=AttendanceStatus.ABSENT
        ).all()
        
        # Process each absent player
        for entry in absent_entries:
            # Count their consecutive absences up to this register's date
            consecutive_absences = get_consecutive_absence_count(
                entry.programme_player_id,
                register.teaching_period_id,
                register.date
            )
            # Send email only if this is exactly the 3rd consecutive absence
            if consecutive_absences == 3:
                programme_player = entry.programme_player
                send_absence_notification_email(programme_player, register, consecutive_absences)
                
    except Exception as e:
        current_app.logger.error(f"Error processing absence notifications for register {register_id}: {str(e)}")
        current_app.logger.error(traceback.format_exc())

@register_routes.route('/register-calendar')
@login_required
@verify_club_access()
def get_register_calendar():
    """Get calendar view of scheduled sessions and register status for current coach"""
    try:
        # Parse query parameters
        teaching_period_id = request.args.get('period_id', type=int)
        start_date = request.args.get('start_date')  # Optional date range
        end_date = request.args.get('end_date')      # Optional date range
        include_cancelled = request.args.get('include_cancelled', 'true').lower() == 'true'
        
        # Get default teaching period if not specified
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
        
        # Default to current week if no date range specified
        if not start_date:
            today = date.today()
            # Get Monday of current week
            days_since_monday = today.weekday()
            monday = today - timedelta(days=days_since_monday)
            start_date = monday.strftime('%Y-%m-%d')
            
        if not end_date:
            start_date_obj = datetime.strptime(start_date, '%Y-%m-%d').date()
            sunday = start_date_obj + timedelta(days=6)
            end_date = sunday.strftime('%Y-%m-%d')
        
        # Parse date strings
        start_date_obj = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_date_obj = datetime.strptime(end_date, '%Y-%m-%d').date()
        
        # Get all group times that the coach is assigned to
        coach_group_times_query = db.session.query(
            TennisGroupTimes.id,
            TennisGroupTimes.group_id,
            TennisGroupTimes.day_of_week,
            TennisGroupTimes.start_time,
            TennisGroupTimes.end_time,
            TennisGroup.name.label('group_name'),
            func.count(ProgrammePlayers.id).label('student_count')
        ).join(
            TennisGroup, TennisGroupTimes.group_id == TennisGroup.id
        ).join(
            ProgrammePlayers, and_(
                ProgrammePlayers.group_time_id == TennisGroupTimes.id,
                ProgrammePlayers.teaching_period_id == teaching_period_id
            )
        ).filter(
            TennisGroupTimes.tennis_club_id == current_user.tennis_club_id,
            ProgrammePlayers.tennis_club_id == current_user.tennis_club_id
        )
        
        # Filter by coach (admin can see all, coaches see only their own)
        if not current_user.is_admin:
            coach_group_times_query = coach_group_times_query.filter(
                ProgrammePlayers.coach_id == current_user.id
            )
        
        coach_group_times = coach_group_times_query.group_by(
            TennisGroupTimes.id,
            TennisGroupTimes.group_id,
            TennisGroupTimes.day_of_week,
            TennisGroupTimes.start_time,
            TennisGroupTimes.end_time,
            TennisGroup.name
        ).all()
        
        # Generate all potential session dates within the range
        sessions = []
        current_date = start_date_obj
        
        # Map day names to Python weekday numbers (Monday = 0)
        day_mapping = {
            DayOfWeek.MONDAY: 0,
            DayOfWeek.TUESDAY: 1,
            DayOfWeek.WEDNESDAY: 2,
            DayOfWeek.THURSDAY: 3,
            DayOfWeek.FRIDAY: 4,
            DayOfWeek.SATURDAY: 5,
            DayOfWeek.SUNDAY: 6
        }
        
        while current_date <= end_date_obj:
            current_weekday = current_date.weekday()
            
            # Find group times that match this day
            for group_time in coach_group_times:
                if day_mapping.get(group_time.day_of_week) == current_weekday:
                    # Check if a register exists for this session
                    existing_register = Register.query.filter_by(
                        group_time_id=group_time.id,
                        date=current_date,
                        teaching_period_id=teaching_period_id,
                        tennis_club_id=current_user.tennis_club_id
                    ).first()
                    
                    # Only include sessions for non-admin users that belong to them
                    if not current_user.is_admin:
                        if existing_register and existing_register.coach_id != current_user.id:
                            continue
                    
                    # Check if session is cancelled (using 3 arguments)
                    is_cancelled, cancellation_reason = is_session_cancelled(
                        group_time.id,
                        current_date,
                        current_user.tennis_club_id
                    )
                    
                    # Skip cancelled sessions unless include_cancelled is True
                    if is_cancelled and not include_cancelled:
                        continue
                    
                    # Get assigned coach for this group time in this period
                    assigned_coach = db.session.query(User).join(
                        ProgrammePlayers, User.id == ProgrammePlayers.coach_id
                    ).filter(
                        ProgrammePlayers.group_time_id == group_time.id,
                        ProgrammePlayers.teaching_period_id == teaching_period_id
                    ).first()
                    
                    session_data = {
                        'id': f"{group_time.id}-{current_date.strftime('%Y%m%d')}",
                        'date': current_date.strftime('%Y-%m-%d'),
                        'day_of_week': group_time.day_of_week.value,
                        'start_time': group_time.start_time.strftime('%H:%M'),
                        'end_time': group_time.end_time.strftime('%H:%M'),
                        'time_display': f"{group_time.start_time.strftime('%H:%M')}-{group_time.end_time.strftime('%H:%M')}",
                        'group_id': group_time.group_id,
                        'group_name': group_time.group_name,
                        'group_time_id': group_time.id,
                        'student_count': group_time.student_count,
                        'has_register': existing_register is not None,
                        'register_id': existing_register.id if existing_register else None,
                        'teaching_period_id': teaching_period_id,
                        'coach': {
                            'id': assigned_coach.id if assigned_coach else None,
                            'name': assigned_coach.name if assigned_coach else 'Not assigned'
                        },
                        'is_cancelled': is_cancelled,
                        'cancellation_reason': cancellation_reason,
                        'status': 'cancelled' if is_cancelled else ('completed' if existing_register else 'scheduled')
                    }
                    
                    sessions.append(session_data)
            
            current_date += timedelta(days=1)
        
        # Sort sessions by date and time
        sessions.sort(key=lambda x: (x['date'], x['start_time']))
        
        return jsonify(sessions)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching register calendar: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


@register_routes.route('/register-calendar/summary')
@login_required
@verify_club_access()
def get_register_calendar_summary():
    """Get summary statistics for register completion, excluding cancelled sessions"""
    try:
        teaching_period_id = request.args.get('period_id', type=int)
        
        # Get default teaching period if not specified
        if not teaching_period_id:
            current_period = TeachingPeriod.query.filter(
                TeachingPeriod.tennis_club_id == current_user.tennis_club_id,
                TeachingPeriod.start_date <= func.current_date(),
                TeachingPeriod.end_date >= func.current_date()
            ).order_by(TeachingPeriod.start_date.desc()).first()
            
            if current_period:
                teaching_period_id = current_period.id
            else:
                return jsonify({
                    'total_sessions': 0,
                    'completed_registers': 0,
                    'missing_registers': 0,
                    'overdue_registers': 0,
                    'cancelled_sessions': 0,
                    'completion_rate': 0
                })
        
        # Get current date for overdue calculation
        today = date.today()
        
        # Count scheduled sessions for the coach (excluding cancelled ones)
        coach_sessions_query = db.session.query(
            TennisGroupTimes.id,
            TennisGroupTimes.day_of_week,
            func.count(ProgrammePlayers.id).label('has_students')
        ).join(
            TennisGroup, TennisGroupTimes.group_id == TennisGroup.id
        ).join(
            ProgrammePlayers, and_(
                ProgrammePlayers.group_time_id == TennisGroupTimes.id,
                ProgrammePlayers.teaching_period_id == teaching_period_id
            )
        ).filter(
            TennisGroupTimes.tennis_club_id == current_user.tennis_club_id,
            ProgrammePlayers.tennis_club_id == current_user.tennis_club_id
        )
        
        if not current_user.is_admin:
            coach_sessions_query = coach_sessions_query.filter(
                ProgrammePlayers.coach_id == current_user.id
            )
        
        coach_sessions = coach_sessions_query.group_by(
            TennisGroupTimes.id,
            TennisGroupTimes.day_of_week
        ).having(func.count(ProgrammePlayers.id) > 0).all()
        
        # Count registers for the teaching period
        registers_query = Register.query.filter(
            Register.teaching_period_id == teaching_period_id,
            Register.tennis_club_id == current_user.tennis_club_id
        )
        
        if not current_user.is_admin:
            registers_query = registers_query.filter(
                Register.coach_id == current_user.id
            )
        
        total_registers = registers_query.count()
        
        # Count overdue registers (excluding cancelled sessions)
        overdue_registers = 0
        overdue_query = registers_query.filter(Register.date < today)
        
        for register in overdue_query.all():
            # Check if this register's session was cancelled (using 3 arguments)
            is_cancelled, _ = is_session_cancelled(
                register.group_time_id,
                register.date,
                current_user.tennis_club_id
            )
            if not is_cancelled:
                overdue_registers += 1
        
        # Calculate estimated total sessions (rough estimate) excluding cancelled ones
        teaching_period = TeachingPeriod.query.get(teaching_period_id)
        cancelled_sessions_count = 0
        
        if teaching_period:
            term_weeks = ((teaching_period.end_date - teaching_period.start_date).days + 1) // 7
            estimated_total_sessions = len(coach_sessions) * term_weeks
            
            # Count cancelled sessions in the period
            cancelled_sessions = get_cancelled_sessions_in_range(
                teaching_period.start_date,
                teaching_period.end_date,
                current_user.tennis_club_id,
                teaching_period_id
            )
            cancelled_sessions_count = len(cancelled_sessions)
            
            # Filter cancelled sessions by coach if not admin
            if not current_user.is_admin:
                # This is a simplified approach - count all cancelled sessions for now
                pass
            
            estimated_total_sessions = max(0, estimated_total_sessions - cancelled_sessions_count)
        else:
            estimated_total_sessions = 0
        
        completion_rate = (total_registers / estimated_total_sessions * 100) if estimated_total_sessions > 0 else 0
        
        return jsonify({
            'total_sessions': estimated_total_sessions,
            'completed_registers': total_registers,
            'missing_registers': max(0, estimated_total_sessions - total_registers),
            'overdue_registers': overdue_registers,
            'cancelled_sessions': cancelled_sessions_count,
            'completion_rate': round(completion_rate, 1),
            'weekly_sessions': len(coach_sessions)
        })
        
    except Exception as e:
        current_app.logger.error(f"Error fetching register summary: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


@register_routes.route('/register-calendar/quick-create', methods=['POST'])
@login_required
@verify_club_access()
def quick_create_register():
    """Quick create a register from calendar view"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['group_time_id', 'date', 'teaching_period_id']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Parse date
        try:
            register_date = datetime.strptime(data['date'], '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
        
        # Check if register already exists
        existing_register = Register.query.filter_by(
            group_time_id=data['group_time_id'],
            date=register_date,
            teaching_period_id=data['teaching_period_id']
        ).first()
        
        if existing_register:
            return jsonify({
                'error': 'Register already exists for this session',
                'register_id': existing_register.id
            }), 409
        
        # Create register
        register = Register(
            group_time_id=data['group_time_id'],
            coach_id=current_user.id,
            date=register_date,
            teaching_period_id=data['teaching_period_id'],
            notes=data.get('notes', ''),
            tennis_club_id=current_user.tennis_club_id
        )
        
        db.session.add(register)
        db.session.flush()
        
        # OPTIONAL: Try to apply session plan first (if admin has created one)
        # If no session plan exists, we'll use the original logic below
        plan_found, plan_entries_added, trial_players_info = apply_session_plan_to_register(
            register, 
            data['group_time_id'], 
            register_date, 
            data['teaching_period_id']
        )
        
        response_data = {
            'message': 'Register created successfully',
            'register_id': register.id,
            'used_session_plan': plan_found,
            'plan_entries_added': plan_entries_added,
            'trial_players_info': trial_players_info
        }
        
        if plan_found:
            # SESSION PLAN FOUND - Use planned attendance
            current_app.logger.info(f"Quick register {register.id} created using session plan with {plan_entries_added} planned entries")
            response_data['student_count'] = plan_entries_added
        else:
            # NO SESSION PLAN - Use original default behavior
            current_app.logger.info(f"No session plan found for quick register {register.id}, using standard player population")
            
            # Pre-populate with students from this group/time
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
                    predicted_attendance=False
                )
                db.session.add(entry)
            
            response_data['student_count'] = len(players)
        
        db.session.commit()
        
        return jsonify(response_data), 201
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error quick creating register: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
    
@register_routes.route('/session-plans/overview')
@login_required
@verify_club_access()
def get_session_plans_overview():
    """Get an overview of upcoming sessions with their planning status"""
    try:
        # Parse query parameters
        teaching_period_id = request.args.get('period_id', type=int)
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        # Get default teaching period if not specified
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
        
        # Default to next 2 weeks if no date range specified
        if not start_date:
            today = date.today()
            start_date = today.strftime('%Y-%m-%d')
            
        if not end_date:
            start_date_obj = datetime.strptime(start_date, '%Y-%m-%d').date()
            end_date_obj = start_date_obj + timedelta(days=14)
            end_date = end_date_obj.strftime('%Y-%m-%d')
        
        # Parse date strings
        start_date_obj = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_date_obj = datetime.strptime(end_date, '%Y-%m-%d').date()
        
        # Get all group times for this club
        group_times = TennisGroupTimes.query.filter_by(
            tennis_club_id=current_user.tennis_club_id
        ).all()
        
        # Generate session overview
        sessions_overview = []
        current_date = start_date_obj
        
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
        
        while current_date <= end_date_obj:
            current_weekday = current_date.weekday()
            
            # Find group times that match this day
            for group_time in group_times:
                if day_mapping.get(group_time.day_of_week) == current_weekday:
                    # Check for session plan
                    session_plan = SessionPlan.query.filter_by(
                        group_time_id=group_time.id,
                        date=current_date,
                        teaching_period_id=teaching_period_id,
                        tennis_club_id=current_user.tennis_club_id,
                        is_active=True
                    ).first()
                    
                    # Check for register
                    register = Register.query.filter_by(
                        group_time_id=group_time.id,
                        date=current_date,
                        teaching_period_id=teaching_period_id,
                        tennis_club_id=current_user.tennis_club_id
                    ).first()
                    
                    # Get group info
                    group = group_time.tennis_group
                    
                    # Get player count
                    player_count = ProgrammePlayers.query.filter_by(
                        group_time_id=group_time.id,
                        teaching_period_id=teaching_period_id,
                        tennis_club_id=current_user.tennis_club_id
                    ).count()
                    
                    # Skip if no players
                    if player_count == 0:
                        continue
                    
                    # Determine session status
                    status = 'scheduled'
                    if session_plan and register:
                        status = 'planned_and_registered'
                    elif session_plan:
                        status = 'planned'
                    elif register:
                        status = 'registered'
                    
                    sessions_overview.append({
                        'date': current_date.strftime('%Y-%m-%d'),
                        'group_time_id': group_time.id,
                        'group_name': group.name,
                        'day_of_week': group_time.day_of_week.value,
                        'start_time': group_time.start_time.strftime('%H:%M'),
                        'end_time': group_time.end_time.strftime('%H:%M'),
                        'player_count': player_count,
                        'status': status,
                        'has_plan': session_plan is not None,
                        'has_register': register is not None,
                        'plan_id': session_plan.id if session_plan else None,
                        'register_id': register.id if register else None,
                        'plan_summary': session_plan.get_plan_summary() if session_plan else None,
                        'teaching_period_id': teaching_period_id
                    })
            
            current_date += timedelta(days=1)
        
        return jsonify(sessions_overview)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching session plans overview: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

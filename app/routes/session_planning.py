# app/routes/session_planning.py

from flask import Blueprint, request, jsonify, current_app, render_template
from flask_login import login_required, current_user
from app.models import (
    SessionPlan, SessionPlanEntry, TrialPlayer, TennisGroupTimes, 
    TeachingPeriod, ProgrammePlayers, Student, User, TennisGroup
)
from app.models.session_planning import PlannedAttendanceStatus, PlayerType
from app import db
from app.models.base import UserRole
from app.utils.auth import admin_required
from app.clubs.middleware import verify_club_access
from sqlalchemy import and_, or_, func, desc
from datetime import datetime, timedelta, date
import traceback

# API routes for session planning
session_planning_routes = Blueprint('session_planning', __name__, url_prefix='/api/session-plans')

# View routes for HTML pages
session_planning_views = Blueprint('session_planning_views', __name__, url_prefix='/session-plans')

# =========================================================
# VIEW ROUTES - For rendering HTML templates
# =========================================================

@session_planning_views.route('/')
@login_required
@admin_required
@verify_club_access()
def session_plans_list():
    """Render the session plans list page"""
    return render_template('pages/session_plan.html')

@session_planning_views.route('/create')
@login_required
@admin_required
@verify_club_access()
def create_session_plan_view():
    """Render the create session plan page"""
    return render_template('pages/session_plan.html')

@session_planning_views.route('/<int:plan_id>')
@login_required
@admin_required
@verify_club_access()
def view_session_plan(plan_id):
    """Render the view session plan page"""
    # Check if plan exists and user has access
    plan = SessionPlan.query.filter_by(
        id=plan_id,
        tennis_club_id=current_user.tennis_club_id
    ).first_or_404()
        
    return render_template('pages/session_plan.html', plan_id=plan_id)

@session_planning_views.route('/<int:plan_id>/edit')
@login_required
@admin_required
@verify_club_access()
def edit_session_plan_view(plan_id):
    """Render the edit session plan page"""
    # Check if plan exists and user has access
    plan = SessionPlan.query.filter_by(
        id=plan_id,
        tennis_club_id=current_user.tennis_club_id
    ).first_or_404()
        
    return render_template('pages/session_plan.html', plan_id=plan_id)

# =========================================================
# API ROUTES - For JSON data
# =========================================================

@session_planning_routes.route('/', methods=['GET'])
@login_required
@admin_required
@verify_club_access()
def get_session_plans():
    """Get all session plans for the current tennis club with filtering options"""
    try:
        # Parse query parameters
        teaching_period_id = request.args.get('period_id', type=int)
        group_id = request.args.get('group_id', type=int)
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'
        
        # Start with base query
        query = SessionPlan.query.filter(SessionPlan.tennis_club_id == current_user.tennis_club_id)
        
        # Apply filters
        if teaching_period_id:
            query = query.filter(SessionPlan.teaching_period_id == teaching_period_id)
        
        if group_id:
            # Join with group times to filter by group
            query = query.join(TennisGroupTimes).filter(TennisGroupTimes.group_id == group_id)
        
        if start_date:
            try:
                start_date_obj = datetime.strptime(start_date, '%Y-%m-%d').date()
                query = query.filter(SessionPlan.date >= start_date_obj)
            except ValueError:
                pass
                
        if end_date:
            try:
                end_date_obj = datetime.strptime(end_date, '%Y-%m-%d').date()
                query = query.filter(SessionPlan.date <= end_date_obj)
            except ValueError:
                pass
        
        if not include_inactive:
            query = query.filter(SessionPlan.is_active == True)
        
        # Order by date (most recent first)
        session_plans = query.order_by(desc(SessionPlan.date)).all()
        
        # Format results
        results = []
        for plan in session_plans:
            
            group_time = plan.group_time
            group = group_time.tennis_group if group_time else None
            
            summary = plan.get_plan_summary()
            
            result_item = {
                'id': plan.id,
                'date': plan.date.isoformat(),
                'group': {
                    'id': group.id if group else None,
                    'name': group.name if group else 'Unknown Group'
                },
                'time_slot': {
                    'id': group_time.id if group_time else None,
                    'day': group_time.day_of_week.value if group_time else None,
                    'start_time': group_time.start_time.strftime('%H:%M') if group_time and group_time.start_time else None,
                    'end_time': group_time.end_time.strftime('%H:%M') if group_time and group_time.end_time else None
                },
                'teaching_period': {
                    'id': plan.teaching_period_id,
                    'name': plan.teaching_period.name if plan.teaching_period else 'Unknown Period'
                },
                'planned_by': {
                    'id': plan.planned_by_id,
                    'name': plan.planned_by.name if plan.planned_by else 'Unknown User'
                },
                'notes': plan.notes,
                'is_active': plan.is_active,
                'created_at': plan.created_at.isoformat() if plan.created_at else None,
                'session_description': plan.session_description,
                'summary': summary
            }
            
            results.append(result_item)
              
        return jsonify(results)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching session plans: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@session_planning_routes.route('/<int:plan_id>', methods=['GET'])
@login_required
@admin_required
@verify_club_access()
def get_session_plan(plan_id):
    """Get a specific session plan with detailed information"""
    try:
        plan = SessionPlan.query.filter_by(
            id=plan_id,
            tennis_club_id=current_user.tennis_club_id
        ).first_or_404()
        
        # Get group info
        group_time = plan.group_time
        group = group_time.tennis_group if group_time else None
        
        # Format plan entries
        plan_entries = []
        for entry in plan.plan_entries:
            player = entry.programme_player
            student = player.student if player else None
            
            if student:
                plan_entries.append({
                    'id': entry.id,
                    'player_id': player.id,
                    'student_id': student.id,
                    'student_name': student.name,
                    'planned_status': entry.planned_status.value,
                    'player_type': entry.player_type.value,
                    'notes': entry.notes,
                    'original_group': player.tennis_group.name if entry.player_type == PlayerType.MAKEUP else None
                })
        
        # Format trial players
        trial_players = [trial.to_dict() for trial in plan.trial_players]
        
        # Build response
        response = {
            'id': plan.id,
            'date': plan.date.isoformat(),
            'group': {
                'id': group.id if group else None,
                'name': group.name if group else 'Unknown Group'
            },
            'time_slot': {
                'id': group_time.id if group_time else None,
                'day': group_time.day_of_week.value if group_time else None,
                'start_time': group_time.start_time.strftime('%H:%M') if group_time and group_time.start_time else None,
                'end_time': group_time.end_time.strftime('%H:%M') if group_time and group_time.end_time else None
            },
            'teaching_period': {
                'id': plan.teaching_period_id,
                'name': plan.teaching_period.name if plan.teaching_period else 'Unknown Period'
            },
            'planned_by': {
                'id': plan.planned_by_id,
                'name': plan.planned_by.name if plan.planned_by else 'Unknown User'
            },
            'notes': plan.notes,
            'is_active': plan.is_active,
            'created_at': plan.created_at.isoformat() if plan.created_at else None,
            'updated_at': plan.updated_at.isoformat() if plan.updated_at else None,
            'session_description': plan.session_description,
            'plan_entries': plan_entries,
            'trial_players': trial_players,
            'summary': plan.get_plan_summary()
        }
        
        return jsonify(response)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching session plan details: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@session_planning_routes.route('/', methods=['POST'])
@login_required
@admin_required
@verify_club_access()
def create_session_plan():
    """Create a new session plan"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['group_time_id', 'date', 'teaching_period_id']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Parse date
        try:
            plan_date = datetime.strptime(data['date'], '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
        
        # Validate group time belongs to club
        group_time = TennisGroupTimes.query.filter_by(
            id=data['group_time_id'],
            tennis_club_id=current_user.tennis_club_id
        ).first()
        
        if not group_time:
            return jsonify({'error': 'Invalid group time selected'}), 400
        
        # Validate teaching period belongs to club
        teaching_period = TeachingPeriod.query.filter_by(
            id=data['teaching_period_id'],
            tennis_club_id=current_user.tennis_club_id
        ).first()
        
        if not teaching_period:
            return jsonify({'error': 'Invalid teaching period selected'}), 400
        
        # Check if plan already exists for this session
        existing_plan = SessionPlan.query.filter_by(
            group_time_id=data['group_time_id'],
            date=plan_date,
            teaching_period_id=data['teaching_period_id']
        ).first()
        
        if existing_plan:
            return jsonify({
                'error': 'A session plan already exists for this session',
                'existing_plan_id': existing_plan.id
            }), 409
        
        # Create new session plan
        session_plan = SessionPlan(
            group_time_id=data['group_time_id'],
            date=plan_date,
            teaching_period_id=data['teaching_period_id'],
            tennis_club_id=current_user.tennis_club_id,
            planned_by_id=current_user.id,
            notes=data.get('notes', '')
        )
        
        db.session.add(session_plan)
        db.session.flush()  # Get plan ID
        
        # Process plan entries if provided
        plan_entries = data.get('plan_entries', [])
        for entry_data in plan_entries:
            if 'player_id' not in entry_data or 'planned_status' not in entry_data:
                continue
            
            # Validate player belongs to club
            player = ProgrammePlayers.query.filter_by(
                id=entry_data['player_id'],
                tennis_club_id=current_user.tennis_club_id
            ).first()
            
            if not player:
                continue
            
            # Validate planned status
            try:
                planned_status = PlannedAttendanceStatus(entry_data['planned_status'])
            except ValueError:
                continue
            
            # Determine player type
            player_type = PlayerType.REGULAR
            if entry_data.get('player_type') == 'makeup':
                player_type = PlayerType.MAKEUP
            
            plan_entry = SessionPlanEntry(
                session_plan_id=session_plan.id,
                programme_player_id=player.id,
                planned_status=planned_status,
                player_type=player_type,
                notes=entry_data.get('notes', '')
            )
            db.session.add(plan_entry)
        
        # Process trial players if provided
        trial_players = data.get('trial_players', [])
        for trial_data in trial_players:
            if 'name' not in trial_data:
                continue
            
            trial_player = TrialPlayer(
                session_plan_id=session_plan.id,
                name=trial_data['name'],
                contact_email=trial_data.get('contact_email'),
                contact_number=trial_data.get('contact_number'),
                emergency_contact_number=trial_data.get('emergency_contact_number'),
                medical_information=trial_data.get('medical_information'),
                notes=trial_data.get('notes', ''),
                date_of_birth=datetime.strptime(trial_data['date_of_birth'], '%Y-%m-%d').date() if trial_data.get('date_of_birth') else None
            )
            db.session.add(trial_player)
        
        db.session.commit()
        
        return jsonify({
            'message': 'Session plan created successfully',
            'plan_id': session_plan.id,
            'session_description': session_plan.session_description
        }), 201
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating session plan: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@session_planning_routes.route('/<int:plan_id>', methods=['PUT'])
@login_required
@admin_required
@verify_club_access()
def update_session_plan(plan_id):
    """Update an existing session plan"""
    try:
        plan = SessionPlan.query.filter_by(
            id=plan_id,
            tennis_club_id=current_user.tennis_club_id
        ).first_or_404()
        
        data = request.get_json()
        
        # Update basic plan details
        if 'notes' in data:
            plan.notes = data['notes']
        
        if 'is_active' in data:
            plan.is_active = data['is_active']
        
        # Update date if provided
        if 'date' in data:
            try:
                new_date = datetime.strptime(data['date'], '%Y-%m-%d').date()
                
                # Check if another plan exists for this new date
                existing_plan = SessionPlan.query.filter_by(
                    group_time_id=plan.group_time_id,
                    date=new_date,
                    teaching_period_id=plan.teaching_period_id
                ).first()
                
                if existing_plan and existing_plan.id != plan.id:
                    return jsonify({
                        'error': 'A session plan already exists for this date',
                        'existing_plan_id': existing_plan.id
                    }), 409
                
                plan.date = new_date
            except ValueError:
                return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
        
        db.session.commit()
        
        return jsonify({
            'message': 'Session plan updated successfully',
            'plan_id': plan.id,
            'session_description': plan.session_description
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating session plan: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@session_planning_routes.route('/<int:plan_id>', methods=['DELETE'])
@login_required
@admin_required
@verify_club_access()
def delete_session_plan(plan_id):
    """Delete a session plan and all its entries"""
    try:
        plan = SessionPlan.query.filter_by(
            id=plan_id,
            tennis_club_id=current_user.tennis_club_id
        ).first_or_404()
        
        session_description = plan.session_description
        
        # Delete plan (cascade will handle entries and trial players)
        db.session.delete(plan)
        db.session.commit()
        
        return jsonify({
            'message': f'Session plan deleted successfully: {session_description}'
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error deleting session plan: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@session_planning_routes.route('/<int:plan_id>/entries', methods=['PUT'])
@login_required
@admin_required
@verify_club_access()
def update_plan_entries(plan_id):
    """Update plan entries for a session plan"""
    try:
        plan = SessionPlan.query.filter_by(
            id=plan_id,
            tennis_club_id=current_user.tennis_club_id
        ).first_or_404()
        
        data = request.get_json()
        entries = data.get('entries', [])
        
        if not isinstance(entries, list):
            return jsonify({'error': 'entries must be a list'}), 400
        
        # Clear existing entries
        SessionPlanEntry.query.filter_by(session_plan_id=plan_id).delete()
        
        # Add new entries
        for entry_data in entries:
            if 'player_id' not in entry_data or 'planned_status' not in entry_data:
                continue
            
            # Validate player
            player = ProgrammePlayers.query.filter_by(
                id=entry_data['player_id'],
                tennis_club_id=current_user.tennis_club_id
            ).first()
            
            if not player:
                continue
            
            # Validate planned status
            try:
                planned_status = PlannedAttendanceStatus(entry_data['planned_status'])
            except ValueError:
                continue
            
            # Determine player type
            player_type = PlayerType.REGULAR
            if entry_data.get('player_type') == 'makeup':
                player_type = PlayerType.MAKEUP
            
            plan_entry = SessionPlanEntry(
                session_plan_id=plan.id,
                programme_player_id=player.id,
                planned_status=planned_status,
                player_type=player_type,
                notes=entry_data.get('notes', '')
            )
            db.session.add(plan_entry)
        
        db.session.commit()
        
        return jsonify({
            'message': 'Plan entries updated successfully',
            'entries_count': len(entries)
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating plan entries: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@session_planning_routes.route('/<int:plan_id>/trial-players', methods=['PUT'])
@login_required
@admin_required
@verify_club_access()
def update_trial_players(plan_id):
    """Update trial players for a session plan"""
    try:
        plan = SessionPlan.query.filter_by(
            id=plan_id,
            tennis_club_id=current_user.tennis_club_id
        ).first_or_404()
        
        data = request.get_json()
        trial_players = data.get('trial_players', [])
        
        if not isinstance(trial_players, list):
            return jsonify({'error': 'trial_players must be a list'}), 400
        
        # Clear existing trial players
        TrialPlayer.query.filter_by(session_plan_id=plan_id).delete()
        
        # Add new trial players
        for trial_data in trial_players:
            if 'name' not in trial_data:
                continue
            
            trial_player = TrialPlayer(
                session_plan_id=plan.id,
                name=trial_data['name'],
                contact_email=trial_data.get('contact_email'),
                contact_number=trial_data.get('contact_number'),
                emergency_contact_number=trial_data.get('emergency_contact_number'),
                medical_information=trial_data.get('medical_information'),
                notes=trial_data.get('notes', ''),
                date_of_birth=datetime.strptime(trial_data['date_of_birth'], '%Y-%m-%d').date() if trial_data.get('date_of_birth') else None
            )
            db.session.add(trial_player)
        
        db.session.commit()
        
        return jsonify({
            'message': 'Trial players updated successfully',
            'trial_players_count': len(trial_players)
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating trial players: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@session_planning_routes.route('/check-session', methods=['GET'])
@login_required
@admin_required
@verify_club_access()
def check_session_plan():
    """Check if a session plan exists for specific session parameters"""
    try:
        group_time_id = request.args.get('group_time_id', type=int)
        date_str = request.args.get('date')
        teaching_period_id = request.args.get('teaching_period_id', type=int)
        
        if not all([group_time_id, date_str, teaching_period_id]):
            return jsonify({'error': 'group_time_id, date, and teaching_period_id are required'}), 400
        
        # Parse date
        try:
            session_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
        
        # Check for existing plan
        existing_plan = SessionPlan.query.filter_by(
            group_time_id=group_time_id,
            date=session_date,
            teaching_period_id=teaching_period_id,
            tennis_club_id=current_user.tennis_club_id,
            is_active=True
        ).first()
        
        if existing_plan:
            return jsonify({
                'has_plan': True,
                'plan_id': existing_plan.id,
                'session_description': existing_plan.session_description,
                'summary': existing_plan.get_plan_summary()
            })
        else:
            return jsonify({
                'has_plan': False
            })
        
    except Exception as e:
        current_app.logger.error(f"Error checking session plan: {str(e)}")
        return jsonify({'error': str(e)}), 500
    
@session_planning_routes.route('/trial-players', methods=['GET'])
@login_required
@admin_required
@verify_club_access()
def get_trial_players_stats():
    """Get trial players statistics with filtering options"""
    try:
        # Parse query parameters
        teaching_period_id = request.args.get('period_id', type=int)
        group_id = request.args.get('group_id', type=int)
        coach_id = request.args.get('coach_id', type=int)
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        if not teaching_period_id:
            return jsonify({'error': 'Teaching period ID is required'}), 400
        
        # Base query for trial players
        query = db.session.query(
            TrialPlayer,
            SessionPlan,
            TennisGroupTimes,
            TennisGroup,
            User,
            TeachingPeriod
        ).join(
            SessionPlan, TrialPlayer.session_plan_id == SessionPlan.id
        ).join(
            TennisGroupTimes, SessionPlan.group_time_id == TennisGroupTimes.id
        ).join(
            TennisGroup, TennisGroupTimes.group_id == TennisGroup.id
        ).join(
            User, SessionPlan.planned_by_id == User.id
        ).join(
            TeachingPeriod, SessionPlan.teaching_period_id == TeachingPeriod.id
        ).filter(
            SessionPlan.tennis_club_id == current_user.tennis_club_id,
            SessionPlan.teaching_period_id == teaching_period_id,
            SessionPlan.is_active == True
        )
        
        # Apply filters
        if group_id:
            query = query.filter(TennisGroup.id == group_id)
        
        if coach_id:
            query = query.filter(User.id == coach_id)
        elif not current_user.is_admin:
            # Non-admin users can only see their own trial players
            query = query.filter(User.id == current_user.id)
        
        if start_date:
            try:
                start_date_obj = datetime.strptime(start_date, '%Y-%m-%d').date()
                query = query.filter(SessionPlan.date >= start_date_obj)
            except ValueError:
                pass
        
        if end_date:
            try:
                end_date_obj = datetime.strptime(end_date, '%Y-%m-%d').date()
                query = query.filter(SessionPlan.date <= end_date_obj)
            except ValueError:
                pass
        
        # Order by date (most recent first)
        results = query.order_by(desc(SessionPlan.date)).all()
        
        # Format response
        trial_players = []
        for trial_player, session_plan, group_time, group, coach, teaching_period in results:
            trial_players.append({
                'id': trial_player.id,
                'name': trial_player.name,
                'contact_email': trial_player.contact_email,
                'contact_number': trial_player.contact_number,
                'emergency_contact_number': trial_player.emergency_contact_number,
                'date_of_birth': trial_player.date_of_birth.isoformat() if trial_player.date_of_birth else None,
                'medical_information': trial_player.medical_information,
                'notes': trial_player.notes or '',
                'session_plan_id': session_plan.id,
                'session_date': session_plan.date.isoformat(),
                'group_name': group.name,
                'group_id': group.id,
                'time_slot': {
                    'day': group_time.day_of_week.value if group_time.day_of_week else None,
                    'start_time': group_time.start_time.strftime('%H:%M') if group_time.start_time else None,
                    'end_time': group_time.end_time.strftime('%H:%M') if group_time.end_time else None
                },
                'coach_name': coach.name,
                'coach_id': coach.id,
                'teaching_period': {
                    'id': teaching_period.id,
                    'name': teaching_period.name
                }
            })
        
        return jsonify(trial_players)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching trial players stats: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@session_planning_routes.route('/summary', methods=['GET'])
@login_required
@admin_required
@verify_club_access()
def get_session_plan_summary():
    """Get session plan summary statistics"""
    try:
        # Parse query parameters
        teaching_period_id = request.args.get('period_id', type=int)
        group_id = request.args.get('group_id', type=int)
        coach_id = request.args.get('coach_id', type=int)
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        if not teaching_period_id:
            return jsonify({'error': 'Teaching period ID is required'}), 400
        
        # Base query for session plans
        base_query = SessionPlan.query.filter(
            SessionPlan.tennis_club_id == current_user.tennis_club_id,
            SessionPlan.teaching_period_id == teaching_period_id,
            SessionPlan.is_active == True
        )
        
        # Apply coach filter
        if coach_id:
            base_query = base_query.filter(SessionPlan.planned_by_id == coach_id)
        elif not current_user.is_admin:
            base_query = base_query.filter(SessionPlan.planned_by_id == current_user.id)
        
        # Apply group filter
        if group_id:
            base_query = base_query.join(TennisGroupTimes).filter(
                TennisGroupTimes.group_id == group_id
            )
        
        # Apply date filters
        if start_date:
            try:
                start_date_obj = datetime.strptime(start_date, '%Y-%m-%d').date()
                base_query = base_query.filter(SessionPlan.date >= start_date_obj)
            except ValueError:
                pass
        
        if end_date:
            try:
                end_date_obj = datetime.strptime(end_date, '%Y-%m-%d').date()
                base_query = base_query.filter(SessionPlan.date <= end_date_obj)
            except ValueError:
                pass
        
        # Get all session plans
        session_plans = base_query.all()
        
        # Calculate statistics
        total_plans = len(session_plans)
        total_trial_players = 0
        total_makeup_players = 0
        total_planned_absences = 0
        plans_with_trials = 0
        plans_with_makeups = 0
        plans_with_absences = 0
        
        for plan in session_plans:
            # Count trial players
            trial_count = len(plan.trial_players)
            total_trial_players += trial_count
            if trial_count > 0:
                plans_with_trials += 1
            
            # Count makeup players and planned absences
            makeup_count = 0
            absence_count = 0
            
            for entry in plan.plan_entries:
                if entry.player_type == PlayerType.MAKEUP:
                    makeup_count += 1
                elif entry.planned_status == PlannedAttendanceStatus.PLANNED_ABSENT:
                    absence_count += 1
            
            total_makeup_players += makeup_count
            total_planned_absences += absence_count
            
            if makeup_count > 0:
                plans_with_makeups += 1
            if absence_count > 0:
                plans_with_absences += 1
        
        summary = {
            'total_plans': total_plans,
            'total_trial_players': total_trial_players,
            'total_makeup_players': total_makeup_players,
            'total_planned_absences': total_planned_absences,
            'plans_with_trials': plans_with_trials,
            'plans_with_makeups': plans_with_makeups,
            'plans_with_absences': plans_with_absences
        }
        
        return jsonify(summary)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching session plan summary: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@session_planning_routes.route('/makeup-players', methods=['GET'])
@login_required
@admin_required
@verify_club_access()
def get_makeup_players_stats():
    """Get makeup players statistics with filtering options"""
    try:
        # Parse query parameters
        teaching_period_id = request.args.get('period_id', type=int)
        group_id = request.args.get('group_id', type=int)
        coach_id = request.args.get('coach_id', type=int)
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        if not teaching_period_id:
            return jsonify({'error': 'Teaching period ID is required'}), 400
        
        # Base query for makeup players
        query = db.session.query(
            SessionPlanEntry,
            ProgrammePlayers,
            Student,
            SessionPlan,
            TennisGroupTimes,
            TennisGroup,
            User,
            TeachingPeriod
        ).join(
            ProgrammePlayers, SessionPlanEntry.programme_player_id == ProgrammePlayers.id
        ).join(
            Student, ProgrammePlayers.student_id == Student.id
        ).join(
            SessionPlan, SessionPlanEntry.session_plan_id == SessionPlan.id
        ).join(
            TennisGroupTimes, SessionPlan.group_time_id == TennisGroupTimes.id
        ).join(
            TennisGroup, TennisGroupTimes.group_id == TennisGroup.id
        ).join(
            User, SessionPlan.planned_by_id == User.id
        ).join(
            TeachingPeriod, SessionPlan.teaching_period_id == TeachingPeriod.id
        ).filter(
            SessionPlan.tennis_club_id == current_user.tennis_club_id,
            SessionPlan.teaching_period_id == teaching_period_id,
            SessionPlan.is_active == True,
            SessionPlanEntry.player_type == PlayerType.MAKEUP
        )
        
        # Apply filters
        if group_id:
            query = query.filter(TennisGroup.id == group_id)
        
        if coach_id:
            query = query.filter(User.id == coach_id)
        elif not current_user.is_admin:
            # Non-admin users can only see their own makeup players
            query = query.filter(User.id == current_user.id)
        
        if start_date:
            try:
                start_date_obj = datetime.strptime(start_date, '%Y-%m-%d').date()
                query = query.filter(SessionPlan.date >= start_date_obj)
            except ValueError:
                pass
        
        if end_date:
            try:
                end_date_obj = datetime.strptime(end_date, '%Y-%m-%d').date()
                query = query.filter(SessionPlan.date <= end_date_obj)
            except ValueError:
                pass
        
        # Order by date (most recent first)
        results = query.order_by(desc(SessionPlan.date)).all()
        
        # Format response
        makeup_players = []
        for entry, player, student, session_plan, group_time, group, coach, teaching_period in results:
            # Get original group information
            original_group = player.tennis_group
            original_group_time = player.group_time
            
            makeup_players.append({
                'id': entry.id,
                'student_id': student.id,
                'student_name': student.name,
                'contact_email': student.contact_email,
                'contact_number': student.contact_number,
                'notes': entry.notes or '',
                'session_plan_id': session_plan.id,
                'session_date': session_plan.date.isoformat(),
                'group_name': group.name,
                'group_id': group.id,
                'time_slot': {
                    'day': group_time.day_of_week.value if group_time.day_of_week else None,
                    'start_time': group_time.start_time.strftime('%H:%M') if group_time.start_time else None,
                    'end_time': group_time.end_time.strftime('%H:%M') if group_time.end_time else None
                },
                'coach_name': coach.name,
                'coach_id': coach.id,
                'original_group': {
                    'name': original_group.name if original_group else None,
                    'day': original_group_time.day_of_week.value if original_group_time and original_group_time.day_of_week else None,
                    'start_time': original_group_time.start_time.strftime('%H:%M') if original_group_time and original_group_time.start_time else None,
                    'end_time': original_group_time.end_time.strftime('%H:%M') if original_group_time and original_group_time.end_time else None
                },
                'teaching_period': {
                    'id': teaching_period.id,
                    'name': teaching_period.name
                }
            })
        
        return jsonify(makeup_players)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching makeup players stats: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@session_planning_routes.route('/planned-absences', methods=['GET'])
@login_required
@admin_required
@verify_club_access()
def get_planned_absences_stats():
    """Get planned absences statistics with filtering options"""
    try:
        # Parse query parameters
        teaching_period_id = request.args.get('period_id', type=int)
        group_id = request.args.get('group_id', type=int)
        coach_id = request.args.get('coach_id', type=int)
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        if not teaching_period_id:
            return jsonify({'error': 'Teaching period ID is required'}), 400
        
        # Base query for planned absences
        query = db.session.query(
            SessionPlanEntry,
            ProgrammePlayers,
            Student,
            SessionPlan,
            TennisGroupTimes,
            TennisGroup,
            User,
            TeachingPeriod
        ).join(
            ProgrammePlayers, SessionPlanEntry.programme_player_id == ProgrammePlayers.id
        ).join(
            Student, ProgrammePlayers.student_id == Student.id
        ).join(
            SessionPlan, SessionPlanEntry.session_plan_id == SessionPlan.id
        ).join(
            TennisGroupTimes, SessionPlan.group_time_id == TennisGroupTimes.id
        ).join(
            TennisGroup, TennisGroupTimes.group_id == TennisGroup.id
        ).join(
            User, SessionPlan.planned_by_id == User.id
        ).join(
            TeachingPeriod, SessionPlan.teaching_period_id == TeachingPeriod.id
        ).filter(
            SessionPlan.tennis_club_id == current_user.tennis_club_id,
            SessionPlan.teaching_period_id == teaching_period_id,
            SessionPlan.is_active == True,
            SessionPlanEntry.planned_status == PlannedAttendanceStatus.PLANNED_ABSENT
        )
        
        # Apply filters
        if group_id:
            query = query.filter(TennisGroup.id == group_id)
        
        if coach_id:
            query = query.filter(User.id == coach_id)
        elif not current_user.is_admin:
            # Non-admin users can only see their own planned absences
            query = query.filter(User.id == current_user.id)
        
        if start_date:
            try:
                start_date_obj = datetime.strptime(start_date, '%Y-%m-%d').date()
                query = query.filter(SessionPlan.date >= start_date_obj)
            except ValueError:
                pass
        
        if end_date:
            try:
                end_date_obj = datetime.strptime(end_date, '%Y-%m-%d').date()
                query = query.filter(SessionPlan.date <= end_date_obj)
            except ValueError:
                pass
        
        # Order by date (most recent first)
        results = query.order_by(desc(SessionPlan.date)).all()
        
        # Format response
        planned_absences = []
        for entry, player, student, session_plan, group_time, group, coach, teaching_period in results:
            planned_absences.append({
                'id': entry.id,
                'student_id': student.id,
                'student_name': student.name,
                'contact_email': student.contact_email,
                'contact_number': student.contact_number,
                'notes': entry.notes or '',
                'session_plan_id': session_plan.id,
                'session_date': session_plan.date.isoformat(),
                'group_name': group.name,
                'group_id': group.id,
                'time_slot': {
                    'day': group_time.day_of_week.value if group_time.day_of_week else None,
                    'start_time': group_time.start_time.strftime('%H:%M') if group_time.start_time else None,
                    'end_time': group_time.end_time.strftime('%H:%M') if group_time.end_time else None
                },
                'coach_name': coach.name,
                'coach_id': coach.id,
                'teaching_period': {
                    'id': teaching_period.id,
                    'name': teaching_period.name
                }
            })
        
        return jsonify(planned_absences)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching planned absences stats: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
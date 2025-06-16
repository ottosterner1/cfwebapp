from io import BytesIO
import os
from flask import Blueprint, render_template, request, redirect, send_file, url_for, flash, session, current_app, jsonify
from flask_login import login_required, current_user
import pandas as pd
from app.models import (
    User, TennisGroup, TeachingPeriod, Student, Report, UserRole, 
    TennisClub, ProgrammePlayers, CoachDetails, GroupTemplate, ReportTemplate, TennisGroupTimes
)
from app import db
from app.clubs.middleware import verify_club_access
from sqlalchemy import func, and_, or_, distinct, case
from app.utils.auth import admin_required, club_access_required
import traceback

main = Blueprint('main', __name__)

ALLOWED_EXTENSIONS = {'csv', 'xlsx', 'xls'}
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@main.context_processor
def utility_processor():
    return {'UserRole': UserRole}

@main.route('/')
def index():
    return render_template('pages/index.html')

@main.route('/surveys')
@login_required
@admin_required
def survey_dashboard():
    club = current_user.tennis_club
    return render_template('survey/dashboard.html', club=club)

@main.route('/dashboard')
@login_required
@verify_club_access()
def dashboard():
    return render_template('pages/dashboard.html')

@main.route('/lta-accreditation')
@login_required
@verify_club_access()
def lta_accreditation():
    return render_template('pages/lta_accreditation.html')  

@main.route('/api/current-user')
@login_required
@verify_club_access()
def current_user_info():
    
    if not current_user.is_authenticated:
        return jsonify({'error': 'Not authenticated'}), 401

    try:
        # Get logo URLs safely
        logo_url = None
        logo_presigned_url = None
        
        if current_user.tennis_club and current_user.tennis_club.logo_url:
            logo_url = current_user.tennis_club.logo_url
            # If you have a method for presigned URLs, add it here
            try:
                logo_presigned_url = current_user.tennis_club.logo_presigned_url
            except (AttributeError, Exception):
                logo_presigned_url = logo_url  # Fallback to regular URL

        # Build features object safely
        features = {}
        if current_user.tennis_club:
            try:
                features = {
                    'coaching_reports': current_user.tennis_club.has_feature('coaching_reports'),
                    'manage_programme': current_user.tennis_club.has_feature('manage_programme'),
                    'lta_accreditation': current_user.tennis_club.has_feature('lta_accreditation'),
                    'registers': current_user.tennis_club.has_feature('registers'),
                    'invoices': current_user.tennis_club.has_feature('invoices'),
                    'surveys_basic': current_user.tennis_club.has_feature('surveys_basic')
                }
            except (AttributeError, Exception) as e:
                current_app.logger.error(f"Error getting features: {str(e)}")
                # Fallback - assume all features are available if has_feature method doesn't exist
                features = {
                    'coaching_reports': True,
                    'manage_programme': True,
                    'lta_accreditation': True,
                    'registers': True,
                    'invoices': True,
                    'surveys_basic': True
                }

        response_data = {
            'id': current_user.id,
            'name': current_user.name,
            'email': current_user.email,  # Added email field
            'is_admin': current_user.is_admin,
            'is_super_admin': current_user.is_super_admin,
            'tennis_club_id': current_user.tennis_club_id,
            'tennis_club': {
                'id': current_user.tennis_club_id,
                'name': current_user.tennis_club.name if current_user.tennis_club else None,
                'logo_url': logo_url,
                'logo_presigned_url': logo_presigned_url,
                'features': features
            }
        }

        # Debug logging (remove in production)
        current_app.logger.info(f"API Response for user {current_user.id}: {response_data}")

        response = jsonify(response_data)

        response.headers.update({
            'Access-Control-Allow-Origin': request.headers.get('Origin', 'https://cfwebapp.local'),
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie, X-Requested-With'
        })
        
        return response

    except Exception as e:
        current_app.logger.error(f"Error in current_user_info: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': 'Failed to load user data'}), 500

@main.route('/api/current-user', methods=['OPTIONS'])
def current_user_options():
    response = jsonify({'status': 'ok'})
    response.headers['Access-Control-Allow-Origin'] = request.headers.get('Origin', '*')
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Cookie'
    return response

@main.route('/api/dashboard/stats')
@login_required
@verify_club_access()
def dashboard_stats():
    try:
        tennis_club_id = current_user.tennis_club_id
        selected_period_id = request.args.get('period', type=int)
        
        # Get all teaching periods ordered by start date (newest first)
        all_periods = TeachingPeriod.query.filter_by(
            tennis_club_id=tennis_club_id
        ).order_by(TeachingPeriod.start_date.desc()).all()
        
        # Get period IDs that have players
        period_ids_with_players = (db.session.query(ProgrammePlayers.teaching_period_id)
            .filter(ProgrammePlayers.tennis_club_id == tennis_club_id)
            .distinct()
            .all())
        period_ids = [p[0] for p in period_ids_with_players]
        
        # Find the default period (latest with players)
        default_period_id = None
        if period_ids:
            default_period = TeachingPeriod.query.filter(
                TeachingPeriod.id.in_(period_ids),
                TeachingPeriod.tennis_club_id == tennis_club_id
            ).order_by(TeachingPeriod.start_date.desc()).first()
            
            if default_period:
                default_period_id = default_period.id
        
        # If no period is selected, use the default
        if not selected_period_id and default_period_id:
            selected_period_id = default_period_id

        # Base query for students
        base_query = (ProgrammePlayers.query
            .select_from(ProgrammePlayers)
            .join(TennisGroup, ProgrammePlayers.group_id == TennisGroup.id)
            .join(GroupTemplate, and_(
                TennisGroup.id == GroupTemplate.group_id,
                GroupTemplate.is_active == True
            ))
            .join(ReportTemplate, and_(
                ReportTemplate.id == GroupTemplate.template_id,
                ReportTemplate.is_active == True
            ))
            .filter(ProgrammePlayers.tennis_club_id == tennis_club_id))

        if not (current_user.is_admin or current_user.is_super_admin):
            base_query = base_query.filter(ProgrammePlayers.coach_id == current_user.id)
            
        if selected_period_id:
            base_query = base_query.filter(ProgrammePlayers.teaching_period_id == selected_period_id)
            
        total_students = base_query.count()
        
        # Get reports query for all reports (both draft and final)
        reports_query = (Report.query
            .select_from(Report)
            .join(ProgrammePlayers)
            .join(TennisGroup, ProgrammePlayers.group_id == TennisGroup.id)
            .join(GroupTemplate, and_(
                TennisGroup.id == GroupTemplate.group_id,
                GroupTemplate.is_active == True
            ))
            .join(ReportTemplate, and_(
                ReportTemplate.id == GroupTemplate.template_id,
                ReportTemplate.is_active == True
            ))
            .filter(ProgrammePlayers.tennis_club_id == tennis_club_id))

        if not (current_user.is_admin or current_user.is_super_admin):
            reports_query = reports_query.filter(ProgrammePlayers.coach_id == current_user.id)
            
        if selected_period_id:
            reports_query = reports_query.filter(Report.teaching_period_id == selected_period_id)
            
        # Count both submitted and draft reports
        total_reports = reports_query.count()
        submitted_reports = reports_query.filter(Report.is_draft == False).count()
        draft_reports = reports_query.filter(Report.is_draft == True).count()
        
        completion_rate = round((submitted_reports / total_students * 100) if total_students > 0 else 0, 1)
        
        # Get group stats including draft status
        group_stats_query = (db.session.query(
            TennisGroup.name,
            func.count(distinct(ProgrammePlayers.id)).label('count'),
            func.sum(case((Report.is_draft == False, 1), else_=0)).label('reports_completed'),
            func.sum(case((Report.is_draft == True, 1), else_=0)).label('reports_draft')
        )
        .select_from(TennisGroup)
        .join(GroupTemplate, and_(
            TennisGroup.id == GroupTemplate.group_id,
            GroupTemplate.is_active == True
        ))
        .join(ReportTemplate, and_(
            ReportTemplate.id == GroupTemplate.template_id,
            ReportTemplate.is_active == True
        ))
        .join(ProgrammePlayers, TennisGroup.id == ProgrammePlayers.group_id)
        .outerjoin(Report, ProgrammePlayers.id == Report.programme_player_id)
        .filter(ProgrammePlayers.tennis_club_id == tennis_club_id))
        
        if selected_period_id:
            group_stats_query = group_stats_query.filter(
                ProgrammePlayers.teaching_period_id == selected_period_id
            )
            
        if not (current_user.is_admin or current_user.is_super_admin):
            group_stats_query = group_stats_query.filter(
                ProgrammePlayers.coach_id == current_user.id
            )
            
        group_stats = group_stats_query.group_by(TennisGroup.name).all()
        
        # Get coach summaries only for admin users
        coach_summaries = None
        if current_user.is_admin or current_user.is_super_admin:
            coach_summaries = []
            coaches = User.query.filter_by(
                tennis_club_id=tennis_club_id,
            ).all()
            
            for coach in coaches:
                # Create fresh queries for each coach
                coach_players = base_query.filter(ProgrammePlayers.coach_id == coach.id).count()
                
                # Skip coaches with no assigned players/reports
                if coach_players == 0:
                    continue
                    
                coach_draft_reports = reports_query.filter(
                    ProgrammePlayers.coach_id == coach.id,
                    Report.is_draft == True
                ).count()
                
                coach_submitted_reports = reports_query.filter(
                    ProgrammePlayers.coach_id == coach.id,
                    Report.is_draft == False
                ).count()
                
                coach_summaries.append({
                    'id': coach.id,
                    'name': coach.name,
                    'total_assigned': coach_players,
                    'reports_completed': coach_submitted_reports,
                    'reports_draft': coach_draft_reports
                })
                
            # Sort coaches by name
            coach_summaries = sorted(coach_summaries, key=lambda x: x['name'])

        # Get group recommendations WITH SESSION INFO (only consider finalised reports)
        recommendations_query = (db.session.query(
            TennisGroup.name.label('from_group'),
            func.count().label('count'),
            Report.recommended_group_id,
            ProgrammePlayers.group_time_id,
            TennisGroupTimes.day_of_week,
            TennisGroupTimes.start_time,
            TennisGroupTimes.end_time
        )
        .select_from(Report)
        .join(ProgrammePlayers, Report.programme_player_id == ProgrammePlayers.id)
        .join(TennisGroup, ProgrammePlayers.group_id == TennisGroup.id)
        .outerjoin(TennisGroupTimes, ProgrammePlayers.group_time_id == TennisGroupTimes.id)
        .join(GroupTemplate, and_(
            TennisGroup.id == GroupTemplate.group_id,
            GroupTemplate.is_active == True
        ))
        .join(ReportTemplate, and_(
            ReportTemplate.id == GroupTemplate.template_id,
            ReportTemplate.is_active == True
        ))
        .filter(
            ProgrammePlayers.tennis_club_id == tennis_club_id,
            Report.recommended_group_id.isnot(None),
            Report.is_draft == False  # Only include finalised reports
        ))
        
        if selected_period_id:
            recommendations_query = recommendations_query.filter(
                Report.teaching_period_id == selected_period_id
            )
            
        if not (current_user.is_admin or current_user.is_super_admin):
            recommendations_query = recommendations_query.filter(
                ProgrammePlayers.coach_id == current_user.id
            )
            
        recommendations = recommendations_query.group_by(
            TennisGroup.name,
            Report.recommended_group_id,
            ProgrammePlayers.group_time_id,
            TennisGroupTimes.day_of_week,
            TennisGroupTimes.start_time,
            TennisGroupTimes.end_time
        ).all()
        
        # Process recommendations with session information
        group_recommendations = []
        for from_group, count, recommended_group_id, group_time_id, day_of_week, start_time, end_time in recommendations:
            to_group = TennisGroup.query.get(recommended_group_id)
            if to_group:
                # Format time slot information
                session_info = None
                if day_of_week and start_time and end_time:
                    session_info = {
                        'day_of_week': day_of_week.value,
                        'start_time': start_time.strftime('%H:%M'),
                        'end_time': end_time.strftime('%H:%M'),
                        'time_slot_id': group_time_id
                    }
                
                group_recommendations.append({
                    'from_group': from_group,
                    'to_group': to_group.name,
                    'count': count,
                    'session': session_info
                })
        
        response_data = {
            'periods': [{
                'id': p.id,
                'name': p.name,
                'hasPlayers': p.id in period_ids
            } for p in all_periods],
            'defaultPeriodId': default_period_id,
            'stats': {
                'totalStudents': total_students,
                'totalReports': total_reports,
                'submittedReports': submitted_reports,
                'draftReports': draft_reports,
                'reportCompletion': completion_rate,
                'currentGroups': [{
                    'name': name,
                    'count': count,
                    'reports_completed': completed,
                    'reports_draft': draft
                } for name, count, completed, draft in group_stats],
                'coachSummaries': coach_summaries,
                'groupRecommendations': group_recommendations
            }
        }
        return jsonify(response_data)
        
    except Exception as e:
        current_app.logger.error(f"Error in dashboard stats: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({
            'error': f"Server error: {str(e)}",
            'periods': [],
            'stats': {
                'totalStudents': 0,
                'totalReports': 0,
                'submittedReports': 0,
                'draftReports': 0,
                'reportCompletion': 0,
                'currentGroups': [],
                'coachSummaries': None,
                'groupRecommendations': []
            }
        }), 500

@main.route('/home')
@login_required
def home():
    try:
        # Get basic counts without group/term relations for now
        reports = Report.query.filter_by(coach_id=current_user.id).order_by(Report.date.desc()).all()
        students = Student.query.join(Report).filter(Report.coach_id == current_user.id).distinct().all()
        
        return render_template('pages/home.html', 
                            reports=reports,
                            students=students)
    except Exception as e:
        current_app.logger.error(f"Error in home route: {str(e)}")
        flash("Error loading dashboard data", "error")
        return redirect(url_for('main.index'))

@main.route('/debug/reports')
@login_required
def debug_reports():
    reports = Report.query.all()
    return {
        'count': len(reports),
        'reports': [{
            'id': r.id,
            'student_id': r.student_id,
            'coach_id': r.coach_id
        } for r in reports]
    }

@main.route('/profile')
@login_required
@verify_club_access()
def profile_page():
    """Serve the profile page"""
    return render_template('pages/profile.html')

@main.route('/api/profile')
@login_required
@verify_club_access()
def get_profile():
    """Get the current user's basic profile information"""
    try:
        user_data = {
            'id': current_user.id,
            'email': current_user.email,
            'name': current_user.name,
            'role': current_user.role.value,
            'tennis_club': {
                'id': current_user.tennis_club_id,
                'name': current_user.tennis_club.name if current_user.tennis_club else None
            }
        }
        
        # Include coach details if they exist
        if current_user.coach_details:
            user_data['coach_details'] = {
                'contact_number': current_user.coach_details.contact_number,
                'emergency_contact_name': current_user.coach_details.emergency_contact_name,
                'emergency_contact_number': current_user.coach_details.emergency_contact_number
            }
            
        return jsonify(user_data)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching profile: {str(e)}")
        return jsonify({'error': 'Failed to fetch profile data'}), 500

@main.route('/api/profile/details', methods=['PUT'])
@login_required
@verify_club_access()
def update_profile_details():
    """Update the current user's coach details"""
    try:
        data = request.get_json()
        
        # Get or create coach details
        coach_details = current_user.coach_details
        if not coach_details:
            coach_details = CoachDetails(
                user_id=current_user.id,
                tennis_club_id=current_user.tennis_club_id
            )
            db.session.add(coach_details)
        
        # Update fields
        coach_details.contact_number = data.get('contact_number')
        coach_details.emergency_contact_name = data.get('emergency_contact_name')
        coach_details.emergency_contact_number = data.get('emergency_contact_number')
        
        db.session.commit()
        
        return jsonify({
            'contact_number': coach_details.contact_number,
            'emergency_contact_name': coach_details.emergency_contact_name,
            'emergency_contact_number': coach_details.emergency_contact_number
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating profile: {str(e)}")
        return jsonify({'error': 'Failed to update profile'}), 500

@main.route('/upload', methods=['GET', 'POST'])
@login_required
def upload():
    # Get groups and periods specific to the user's tennis club
    groups = TennisGroup.query.filter_by(tennis_club_id=current_user.tennis_club_id).all()
    periods = TeachingPeriod.query.filter_by(tennis_club_id=current_user.tennis_club_id).order_by(TeachingPeriod.start_date.desc()).all()

    if request.method == 'POST':
        if 'file' not in request.files:
            flash('No file uploaded')
            return redirect(request.url)
            
        file = request.files['file']
        group_id = request.form.get('group_id')
        teaching_period_id = request.form.get('teaching_period_id')
        
        if not group_id or not teaching_period_id:
            flash('Please select both group and term')
            return redirect(request.url)
            
        if file.filename == '':
            flash('No file selected')
            return redirect(request.url)
            
        if file and allowed_file(file.filename):
            try:
                df = pd.read_csv(file)
                
                # Simplified expected columns
                expected_columns = [
                    'student_name',
                    'age',
                    'forehand',
                    'backhand',
                    'movement',
                    'overall_rating',
                    'next_group_recommendation',
                    'notes'
                ]
                
                missing_columns = [col for col in expected_columns if col not in df.columns]
                if missing_columns:
                    flash(f'Missing columns: {", ".join(missing_columns)}')
                    return redirect(request.url)
                
                students_created = 0
                reports_created = 0
                
                # Verify group and term belong to user's tennis club
                group = TennisGroup.query.filter_by(id=group_id, tennis_club_id=current_user.tennis_club_id).first()
                term = TeachingPeriod.query.filter_by(id=teaching_period_id, tennis_club_id=current_user.tennis_club_id).first()
                
                if not group or not term:
                    flash('Invalid group or term selected')
                    return redirect(request.url)
                
                for _, row in df.iterrows():
                    try:
                        # Get or create student
                        student_name = row['student_name'].strip()
                        student = Student.query.filter_by(
                            name=student_name,
                            tennis_club_id=current_user.tennis_club_id
                        ).first()
                        
                        if not student:
                            student = Student(
                                name=student_name,
                                age=int(row['age']),
                                tennis_club_id=current_user.tennis_club_id
                            )
                            db.session.add(student)
                            students_created += 1
                        
                        # Create simplified report
                        report = Report(
                            student=student,
                            coach_id=current_user.id,
                            group_id=group_id,
                            teaching_period_id=teaching_period_id,
                            forehand=row['forehand'],
                            backhand=row['backhand'],
                            movement=row['movement'],
                            overall_rating=int(row['overall_rating']),
                            next_group_recommendation=row['next_group_recommendation'],
                            notes=row.get('notes', '')  # Optional field
                        )
                        db.session.add(report)
                        reports_created += 1
                        
                    except Exception as e:
                        db.session.rollback()
                        current_app.logger.error(f"Error processing student: {str(e)}")  # Add logging
                        current_app.logger.error(f'Error processing student {student_name}: {str(e)}')
                        return redirect(request.url)
                
                db.session.commit()
                flash(f'Successfully added {students_created} new students and {reports_created} reports')
                return redirect(url_for('main.dashboard'))
                
            except Exception as e:
                db.session.rollback()
                current_app.logger.error(f"Error processing file: {str(e)}") 
                return redirect(request.url)
                
        else:
            flash('Invalid file type. Please upload a CSV or Excel file')
            return redirect(request.url)
            
    return render_template('pages/upload.html', groups=groups, periods=periods)

@main.route('/reports/<int:report_id>')
@login_required 
@verify_club_access()
def view_report(report_id):
    """Render the view report page"""
    report = Report.query.get_or_404(report_id)
    
    # Check permissions
    if not (current_user.is_admin or current_user.is_super_admin) and report.coach_id != current_user.id:
        flash('You do not have permission to view this report', 'error')
        return redirect(url_for('main.dashboard'))
        
    return render_template('pages/view_report.html', report_id=report_id)

@main.route('/download_single_report/<int:report_id>')
@login_required
@verify_club_access()
def download_single_report(report_id):
    """Download a single report as PDF"""
    try:
        report = Report.query.get_or_404(report_id)
        
        # Allow admins and the coach who created the report to download it
        if not (current_user.is_admin or current_user.is_super_admin) and report.coach_id != current_user.id:
            flash('You do not have permission to download this report')
            return redirect(url_for('main.dashboard'))

        # Get the club name to determine which generator to use
        club_name = current_user.tennis_club.name
        
        # Generate filename
        filename = f"{report.student.name}_{report.teaching_period.name}_{report.tennis_group.name}.pdf".replace(' ', '_')
        
        if 'wilton' in club_name.lower():
            # Use the Wilton report generator for Wilton clubs
            try:
                # Import the Wilton report generator
                from app.utils.wilton_report_generator import EnhancedWiltonReportGenerator
                
                # Get base directory and config path
                base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                config_path = os.path.join(base_dir, 'app', 'utils', 'wilton_group_config.json')
                
                # Create a temporary directory for the output
                import tempfile
                temp_dir = tempfile.mkdtemp()
                
                # Generate the report
                result = EnhancedWiltonReportGenerator.generate_single_report(
                    report_id=report.id,
                    output_dir=temp_dir,
                    config_path=config_path
                )
                
                # Check if generation was successful
                if not result.get('success'):
                    raise Exception("Failed to generate Wilton report")
                    
                # Get the output path
                output_path = result.get('output_path')
                
                # Read the file into memory
                with open(output_path, 'rb') as f:
                    pdf_data = f.read()
                    
                # Clean up the temporary directory
                import shutil
                shutil.rmtree(temp_dir)
                
                # Create response
                response = send_file(
                    BytesIO(pdf_data),
                    mimetype='application/pdf',
                    as_attachment=True,
                    download_name=filename
                )
                
            except Exception as e:
                # If Wilton report generation fails, fall back to standard report
                current_app.logger.error(f"Error generating Wilton report: {str(e)}")
                current_app.logger.error(traceback.format_exc())
                
                # Create PDF in memory buffer
                pdf_buffer = BytesIO()
                from app.utils.report_generator import create_single_report_pdf
                create_single_report_pdf(report, pdf_buffer)
                pdf_buffer.seek(0)
                
                response = send_file(
                    pdf_buffer,
                    mimetype='application/pdf',
                    as_attachment=True,
                    download_name=filename
                )
        else:
            # Use the standard report generator for other clubs
            pdf_buffer = BytesIO()
            from app.utils.report_generator import create_single_report_pdf
            create_single_report_pdf(report, pdf_buffer)
            pdf_buffer.seek(0)
            
            response = send_file(
                pdf_buffer,
                mimetype='application/pdf',
                as_attachment=True,
                download_name=filename
            )
        
        # Add cache control headers to avoid browser caching issues
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        response.headers["Content-Type"] = "application/pdf"
        
        return response
        
    except Exception as e:
        current_app.logger.error(f"Error generating PDF for report {report_id}: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        flash(f"Error generating PDF: {str(e)}", "error")
        return redirect(url_for('main.dashboard'))
    

@main.route('/clubs/manage/<int:club_id>/report-templates', methods=['GET', 'POST'])
@login_required
@verify_club_access()
@admin_required
def manage_report_templates(club_id):
    if club_id != current_user.tennis_club_id:
        flash('Unauthorized access', 'error')
        return redirect(url_for('main.home'))
    
    # If the template exists in pages directory
    return render_template('pages/report_templates.html')

@main.route('/api/debug-routes', methods=['GET'])
@login_required
def debug_routes():
    """Return all registered routes for debugging"""
    if not current_user.is_super_admin:
        return jsonify({'error': 'Unauthorized'}), 403
        
    routes = []
    for rule in current_app.url_map.iter_rules():
        routes.append({
            'endpoint': rule.endpoint,
            'methods': [m for m in rule.methods if m not in ('HEAD', 'OPTIONS')],
            'rule': str(rule)
        })
    
    return jsonify(routes)
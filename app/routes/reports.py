from flask import Blueprint, render_template, request, jsonify, flash, redirect, url_for, current_app, send_file
from flask_login import login_required, current_user
from app.models import (
    Report, TennisGroup, TeachingPeriod, Student, ProgrammePlayers, GroupTemplate, 
    ReportTemplate, TemplateSection, TemplateField, FieldType, TennisGroupTimes, User
)
from app import db
from app.models.core import TennisClub
from app.utils.auth import admin_required
from app.clubs.middleware import verify_club_access
from sqlalchemy import and_, or_, func, case
from io import BytesIO
import os
import shutil
import traceback
from datetime import datetime, timezone
from app.utils.report_generator import create_single_report_pdf
import zipfile
from app.services.email_service import EmailService

report_routes = Blueprint('reports', __name__, url_prefix='/api')


def calculate_age(birth_date):
    """
    Calculate age accurately from date of birth, accounting for leap years and exact dates
    """
    if not birth_date:
        return None
        
    today = datetime.now()
    
    # Calculate age
    age = today.year - birth_date.year
    
    # Adjust age based on month and day
    if (today.month, today.day) < (birth_date.month, birth_date.day):
        age -= 1
        
    return age

@report_routes.route('/reports/<int:report_id>', methods=['GET', 'PUT'])
@login_required
@verify_club_access()
def report_operations(report_id):
    from datetime import datetime
    report = Report.query.get_or_404(report_id)
    
    # Check permissions
    if not current_user.is_admin and report.coach_id != current_user.id:
        return jsonify({'error': 'Permission denied'}), 403

    if request.method == 'GET':
        # Get the template associated with this report
        template = report.template
        
        # Get programme player to access session info
        programme_player = ProgrammePlayers.query.filter_by(
            id=report.programme_player_id
        ).first()
        
        # Get session information
        time_slot = None
        if programme_player and programme_player.group_time_id:
            group_time = TennisGroupTimes.query.get(programme_player.group_time_id)
            if group_time:
                time_slot = {
                    'dayOfWeek': group_time.day_of_week.value if group_time.day_of_week else None,
                    'startTime': group_time.start_time.strftime('%H:%M') if group_time.start_time else None,
                    'endTime': group_time.end_time.strftime('%H:%M') if group_time.end_time else None
                }

        # Get student information for age and date of birth
        date_of_birth = None
        age = None
        if report.student and report.student.date_of_birth:
            date_of_birth = report.student.date_of_birth.isoformat() if report.student.date_of_birth else None
            
            # Calculate age if date of birth is available
            from datetime import datetime
            today = datetime.now()
            age = today.year - report.student.date_of_birth.year
            if (today.month, today.day) < (report.student.date_of_birth.month, report.student.date_of_birth.day):
                age -= 1
                
        # If programme_player exists, try to get student age from there as well (as a fallback)
        if age is None and programme_player and programme_player.student and programme_player.student.date_of_birth:
            from datetime import datetime
            today = datetime.now()
            age = today.year - programme_player.student.date_of_birth.year
            if (today.month, today.day) < (programme_player.student.date_of_birth.month, programme_player.student.date_of_birth.day):
                age -= 1
            date_of_birth = programme_player.student.date_of_birth.isoformat()

        # Normalize the report content if needed
        report_content = report.content
        if isinstance(report_content, dict) and 'content' in report_content:
            report_content = report_content['content']

        # Serialize the report data - explicitly include all fields needed by frontend
        report_data = {
            'id': report.id,
            'studentName': report.student.name,
            'groupName': report.tennis_group.name,
            'content': report_content,
            'recommendedGroupId': report.recommended_group_id,
            'submissionDate': report.date.isoformat() if report.date else None,
            'canEdit': current_user.is_admin or report.coach_id == current_user.id,
            'isDraft': report.is_draft,
            'status': report.status,
            'sessionInfo': time_slot,  # Add session information here
            'dateOfBirth': date_of_birth,
            'age': age,
            'playerId': report.programme_player_id  # Ensure this is included
        }

        # Serialize the template data
        template_data = {
            'id': template.id,
            'name': template.name,
            'description': template.description,
            'sections': [{
                'id': s.id,
                'name': s.name,
                'order': s.order,
                'fields': [{
                    'id': field.id,
                    'name': field.name,
                    'description': field.description,
                    'fieldType': field.field_type.value,
                    'isRequired': field.is_required,
                    'order': field.order,
                    'options': field.options
                } for field in sorted(s.fields, key=lambda x: x.order)]
            } for s in sorted(template.sections, key=lambda x: x.order)]
        }

        return jsonify({
            'report': report_data,
            'template': template_data
        })

    elif request.method == 'PUT':
        try:
            data = request.get_json()
            if not data:
                return jsonify({'error': 'No data provided'}), 400

            # Update report content - should just be the section data
            report.content = data.get('content', {})
            
            # Update draft status if provided
            if 'is_draft' in data:
                report.is_draft = data['is_draft']
                
                # If changing from draft to final, make sure recommendedGroupId is provided
                if not report.is_draft and not data.get('recommendedGroupId'):
                    return jsonify({'error': 'Recommended group is required for final submission'}), 400
                    
                # Mark programme player as having a submitted report if finalising
                if not report.is_draft:
                    programme_player = ProgrammePlayers.query.get(report.programme_player_id)
                    if programme_player:
                        programme_player.report_submitted = True
            
            # Update recommended group
            if 'recommendedGroupId' in data:
                report.recommended_group_id = data.get('recommendedGroupId')
            
            # Record the update time
            report.last_updated = datetime.utcnow()
            
            # Only update the submission date if finalising
            if 'is_draft' in data and not data['is_draft']:
                report.date = datetime.utcnow()
            
            db.session.commit()
            
            return jsonify({
                'message': 'Report updated successfully',
                'report_id': report.id,
                'status': report.status
            })
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error updating report: {str(e)}")
            return jsonify({'error': str(e)}), 500

@report_routes.route('/reports/download-all/<int:period_id>', methods=['GET'])
@login_required
@admin_required
def download_all_reports(period_id):
    """Download all reports for a teaching period with batch processing"""
    
    try:
        # Verify period belongs to user's club
        period = TeachingPeriod.query.filter_by(
            id=period_id,
            tennis_club_id=current_user.tennis_club_id
        ).first_or_404()
        
        # Get the club name and set up directories
        club_name = current_user.tennis_club.name
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        instance_dir = os.path.join(base_dir, 'app', 'instance', 'reports')
        
        # Create period-specific directory path
        period_name = period.name.replace(' ', '_').lower()
        period_dir = os.path.join(instance_dir, f'reports-{period_name}')
        
        # Log the beginning of the process
        current_app.logger.info(f"Starting download_all_reports for period {period_id}, club {club_name}")
        
        # Clear existing reports directory if it exists
        if os.path.exists(period_dir):
            shutil.rmtree(period_dir)
        
        # Create fresh directory
        os.makedirs(instance_dir, exist_ok=True)
        
        # Choose generator based on club name
        if 'wilton' in club_name.lower():
            current_app.logger.info("Using Wilton report generator")
            from app.utils.wilton_report_generator import EnhancedWiltonReportGenerator
            
            config_path = os.path.join(base_dir, 'utils', 'wilton_group_config.json')
            generator = EnhancedWiltonReportGenerator(config_path)
            result = generator.batch_generate_reports(period_id)
            
            # Get the period-specific directory (generated by the report generator)
            reports_dir = period_dir
        else:
            current_app.logger.info("Using standard report generator")
            from app.utils.report_generator import batch_generate_reports
            result = batch_generate_reports(period_id)
            reports_dir = result.get('output_directory')
            
        # Check if generation was successful
        if result.get('success', 0) == 0:
            current_app.logger.error(f"No reports generated. Details: {result.get('error_details', [])}")
            return jsonify({
                'error': 'No reports were generated',
                'details': result.get('error_details', [])
            }), 400
            
        # Verify the reports directory exists
        if not os.path.exists(reports_dir):
            current_app.logger.error(f"Reports directory not found at: {reports_dir}")
            return jsonify({'error': f'No reports were found after generation'}), 500
            
        # Find all PDF files
        pdf_files = []
        for root, dirs, files in os.walk(reports_dir):
            for file in files:
                if file.endswith('.pdf'):
                    file_path = os.path.join(root, file)
                    pdf_files.append(file_path)
        
        # Log the number of files found
        current_app.logger.info(f"Found {len(pdf_files)} PDF files to add to ZIP")
                            
        if len(pdf_files) == 0:
            current_app.logger.error("No PDF files were found to add to ZIP")
            return jsonify({'error': 'No PDF files were generated'}), 400
        
        # Create a ZIP file with batch processing (add files in smaller batches)
        memory_file = BytesIO()
        
        # Process in batches of 20 files each
        BATCH_SIZE = 20
        zip_parts = []
        
        try:
            with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
                # Process PDF files in batches
                for i in range(0, len(pdf_files), BATCH_SIZE):
                    batch = pdf_files[i:i+BATCH_SIZE]
                    current_app.logger.info(f"Processing batch {i//BATCH_SIZE + 1}/{(len(pdf_files)-1)//BATCH_SIZE + 1} with {len(batch)} files")
                    
                    for file_path in batch:
                        try:
                            # Preserve directory structure relative to reports_dir
                            rel_path = os.path.relpath(file_path, reports_dir)
                            with open(file_path, 'rb') as f:
                                # Read in smaller chunks to avoid memory issues
                                zf.writestr(rel_path, f.read())
                        except Exception as e:
                            current_app.logger.error(f"Error adding file to ZIP {file_path}: {str(e)}")
        except Exception as e:
            current_app.logger.error(f"Error creating ZIP file: {str(e)}")
            current_app.logger.error(traceback.format_exc())
            return jsonify({'error': f'Failed to create ZIP: {str(e)}'}), 500
                
        memory_file.seek(0)
        
        # Format filename
        formatted_club_name = club_name.lower().replace(' ', '_')
        formatted_term = period.name.lower().replace(' ', '_')
        filename = f"reports_{formatted_club_name}_{formatted_term}.zip"
        
        current_app.logger.info(f"Successfully created ZIP file with {len(pdf_files)} reports")
        
        # Set response with appropriate headers and send the file
        response = send_file(
            memory_file,
            mimetype='application/zip',
            as_attachment=True,
            download_name=filename
        )
        
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        
        return response
        
    except Exception as e:
        current_app.logger.error(f"Error generating reports ZIP: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@report_routes.route('/reports/create/<int:player_id>', methods=['POST'])
@login_required
def submit_report(player_id):
    """Create a new report, either as draft or final submission"""
    player = ProgrammePlayers.query.get_or_404(player_id)
    
    # Permission check
    if not current_user.is_admin and player.coach_id != current_user.id:
        return jsonify({'error': 'Permission denied'}), 403
        
    try:
        data = request.get_json()
        
        # Check if this is a draft or final submission
        is_draft = data.get('is_draft', False)
        
        # For drafts, the recommended group is optional
        recommended_group_id = data.get('recommendedGroupId')
        
        # If recommendedGroupId is 0 or empty string, treat it as NULL
        if recommended_group_id == 0 or recommended_group_id == '':
            recommended_group_id = None
        
        # Only validate recommended group for final submissions
        if not is_draft and not recommended_group_id:
            return jsonify({'error': 'Recommended group is required for final submission'}), 400

        # Validate that the recommended group exists if provided
        if recommended_group_id:
            recommended_group = TennisGroup.query.filter_by(
                id=recommended_group_id,
                organisation_id=current_user.tennis_club.organisation_id
            ).first()
            
            if not recommended_group:
                return jsonify({'error': 'Invalid recommended group'}), 400

        # Create report with draft status
        report = Report(
            student_id=player.student_id,
            coach_id=current_user.id,
            group_id=player.group_id,
            teaching_period_id=player.teaching_period_id,
            programme_player_id=player.id,
            template_id=data['template_id'],
            content=data['content'],
            recommended_group_id=recommended_group_id,  # Can be None for drafts
            date=datetime.utcnow(),
            is_draft=is_draft,
            last_updated=datetime.utcnow()
        )
        
        # Only mark as submitted if it's not a draft
        if not is_draft:
            player.report_submitted = True
        
        db.session.add(report)
        db.session.commit()
        
        return jsonify({
            'message': 'Report saved successfully' if is_draft else 'Report submitted successfully',
            'report_id': report.id,
            'status': 'draft' if is_draft else 'submitted'
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error saving report: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 400

@report_routes.route('/reports/template/<int:player_id>', methods=['GET'])
@login_required
def get_report_template(player_id):
    player = ProgrammePlayers.query.get_or_404(player_id)
    
    # Permission check
    if not (current_user.is_admin or current_user.is_super_admin) and player.coach_id != current_user.id:
        return jsonify({'error': 'Permission denied'}), 403

    # Get template for the group
    template = (ReportTemplate.query
        .join(GroupTemplate)
        .filter(
            GroupTemplate.group_id == player.group_id,
            GroupTemplate.is_active == True,
            ReportTemplate.is_active == True
        ).first())
    
    if not template:
        return jsonify({'error': 'No template found'}), 404

    # Calculate age from date of birth
    age = calculate_age(player.student.date_of_birth)
    
    # Get session information
    time_slot = None
    if player.group_time_id:
        group_time = TennisGroupTimes.query.get(player.group_time_id)
        if group_time:
            time_slot = {
                'dayOfWeek': group_time.day_of_week.value if group_time.day_of_week else None,
                'startTime': group_time.start_time.strftime('%H:%M') if group_time.start_time else None,
                'endTime': group_time.end_time.strftime('%H:%M') if group_time.end_time else None
            }

    response_data = {
        'template': {
            'id': template.id,
            'name': template.name,
            'description': template.description,
            'sections': [{
                'id': s.id,
                'name': s.name,
                'order': s.order,
                'fields': [{
                    'id': f.id,
                    'name': f.name,
                    'description': f.description,
                    'fieldType': f.field_type.value,
                    'isRequired': f.is_required,
                    'order': f.order,
                    'options': f.options
                } for f in s.fields]
            } for s in template.sections]
        },
        'player': {
            'id': player.id,
            'studentName': player.student.name,
            'dateOfBirth': player.student.date_of_birth.isoformat() if player.student.date_of_birth else None,
            'age': age,
            'groupName': player.tennis_group.name,
            'sessionInfo': time_slot 
        }
    }
    
    return jsonify(response_data) 

@report_routes.route('/reports/print-all/<int:period_id>', methods=['GET'])
@login_required
@admin_required
def print_all_reports(period_id):
    """Generate a single PDF containing all reports for a teaching period with batch processing"""
    try:
        # Verify period belongs to user's tennis club
        period = TeachingPeriod.query.filter_by(
            id=period_id,
            tennis_club_id=current_user.tennis_club_id
        ).first_or_404()
        
        # Get the club name and set up directories
        club_name = current_user.tennis_club.name
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        instance_dir = os.path.join(base_dir, 'app', 'instance', 'reports')
        
        # Create period-specific directory path
        period_name = period.name.replace(' ', '_').lower()
        period_dir = os.path.join(instance_dir, f'reports-{period_name}')
        
        current_app.logger.info(f"Starting print_all_reports for period {period_id}, club {club_name}")
        
        # Clear existing reports directory if it exists
        if os.path.exists(period_dir):
            shutil.rmtree(period_dir)
        
        # Create fresh directory
        os.makedirs(instance_dir, exist_ok=True)
        
        # Choose generator based on club name
        if 'wilton' in club_name.lower():
            current_app.logger.info("Using Wilton report generator")
            from app.utils.wilton_report_generator import EnhancedWiltonReportGenerator
            
            config_path = os.path.join(base_dir, 'utils', 'wilton_group_config.json')
            generator = EnhancedWiltonReportGenerator(config_path)
            result = generator.batch_generate_reports(period_id)
            
            # Get the period-specific directory
            reports_dir = period_dir
        else:
            current_app.logger.info("Using standard report generator")
            from app.utils.report_generator import batch_generate_reports
            result = batch_generate_reports(period_id)
            reports_dir = result.get('output_directory')
        
        if result.get('success', 0) == 0:
            current_app.logger.error(f"No reports generated. Details: {result.get('error_details', [])}")
            return jsonify({
                'error': 'No reports were generated',
                'details': result.get('error_details', [])
            }), 400
        
        # Verify the reports directory exists
        if not os.path.exists(reports_dir):
            current_app.logger.error(f"Reports directory not found at: {reports_dir}")
            return jsonify({'error': 'No reports were found after generation'}), 500
        
        # Get list of PDFs and merge them with batching
        pdf_files = []
        for root, _, files in os.walk(reports_dir):
            for file in sorted(files):
                if file.endswith('.pdf'):
                    file_path = os.path.join(root, file)
                    pdf_files.append(file_path)
        
        if not pdf_files:
            current_app.logger.error("No PDF files found")
            return jsonify({'error': 'No PDF reports were found'}), 404
            
        # Log the number of PDFs for debugging
        current_app.logger.info(f"Attempting to merge {len(pdf_files)} PDF files")
        
        # Create the combined PDF in memory with batching
        output = BytesIO()
        
        # Use smaller batches (20 files per batch) for memory efficiency
        BATCH_SIZE = 20
        temp_files = []
        temp_paths = []
        
        try:
            # First phase: Create batch PDFs in temp files
            from PyPDF2 import PdfMerger, PdfReader
            import tempfile
            
            # Create a temporary directory for the batch files
            temp_dir = tempfile.mkdtemp()
            
            for i in range(0, len(pdf_files), BATCH_SIZE):
                batch = pdf_files[i:i+BATCH_SIZE]
                current_app.logger.info(f"Processing batch {i//BATCH_SIZE + 1}/{(len(pdf_files)-1)//BATCH_SIZE + 1} with {len(batch)} files")
                
                # Create temp file for this batch
                batch_fd, batch_path = tempfile.mkstemp(suffix='.pdf', dir=temp_dir)
                temp_paths.append(batch_path)
                
                batch_merger = PdfMerger()
                
                # Add each file to the batch merger
                for pdf_file in batch:
                    try:
                        with open(pdf_file, 'rb') as f:
                            # Read the PDF
                            reader = PdfReader(f)
                            # Add to merger
                            batch_merger.append(reader)
                    except Exception as e:
                        current_app.logger.error(f"Error adding file {pdf_file} to batch: {str(e)}")
                        # Continue with other files
                        continue
                
                # Write batch to temp file
                with open(batch_path, 'wb') as f:
                    batch_merger.write(f)
                batch_merger.close()
                os.close(batch_fd)
            
            # Second phase: Merge the batches
            current_app.logger.info(f"Merging {len(temp_paths)} batch files into final output")
            final_merger = PdfMerger()
            
            for batch_path in temp_paths:
                try:
                    with open(batch_path, 'rb') as f:
                        reader = PdfReader(f)
                        final_merger.append(reader)
                except Exception as e:
                    current_app.logger.error(f"Error merging batch file {batch_path}: {str(e)}")
            
            # Write the final combined PDF
            final_merger.write(output)
            output.seek(0)
            final_merger.close()
            
            # Clean up temp files and directory
            for path in temp_paths:
                try:
                    os.remove(path)
                except:
                    pass
            try:
                os.rmdir(temp_dir)
            except:
                pass
            
        except Exception as e:
            current_app.logger.error(f"Error during PDF merging: {str(e)}")
            current_app.logger.error(traceback.format_exc())
            
            # Clean up temp resources
            for path in temp_paths:
                try:
                    os.remove(path)
                except:
                    pass
            try:
                os.rmdir(temp_dir)
            except:
                pass
                
            return jsonify({'error': f'Failed to merge PDFs: {str(e)}'}), 500
        
        # Format filename and return file
        formatted_club = club_name.lower().replace(' ', '_')
        formatted_term = period.name.lower().replace(' ', '_')
        filename = f"combined_reports_{formatted_club}_{formatted_term}.pdf"
        
        current_app.logger.info(f"Successfully created combined PDF with {len(pdf_files)} reports")
        
        response = send_file(
            output,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=filename
        )
        
        # Add cache control headers
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        
        return response
        
    except Exception as e:
        current_app.logger.error(f"Error generating reports: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@report_routes.route('/reports/email-status/<int:period_id>')
@login_required
@admin_required
def get_email_status(period_id):
    """Get email status for all reports in a teaching period"""
    try:
        from sqlalchemy.orm import aliased

        # Create aliases for TennisGroup
        CurrentGroup = aliased(TennisGroup)
        RecommendedGroup = aliased(TennisGroup)

        # Verify period belongs to user's club
        period = TeachingPeriod.query.filter_by(
            id=period_id,
            tennis_club_id=current_user.tennis_club_id
        ).first_or_404()

        # Get reports with all necessary relationships loaded
        reports = (Report.query
            .join(Student)
            .join(ProgrammePlayers)
            .join(CurrentGroup, ProgrammePlayers.group_id == CurrentGroup.id)
            .join(User, Report.coach_id == User.id)
            .outerjoin(RecommendedGroup, Report.recommended_group_id == RecommendedGroup.id)
            .filter(
                Report.teaching_period_id == period_id,
                ProgrammePlayers.tennis_club_id == current_user.tennis_club_id
            )
            .all())

        report_data = [{
            'student_name': report.student.name,
            'contact_email': report.student.contact_email,
            'report_id': report.id,
            'email_sent': report.email_sent,
            'email_sent_at': report.email_sent_at.isoformat() if report.email_sent_at else None,
            'last_email_status': report.last_email_status,
            'email_attempts': report.email_attempts,
            'group_name': report.tennis_group.name,
            'recommended_group': report.recommended_group.name if report.recommended_group else '',
            'booking_date': period.next_period_start_date.isoformat() if period.next_period_start_date else None,
            'coach_name': report.coach.name,
            'term_name': period.name,
            'tennis_club': report.programme_player.tennis_club.name
        } for report in reports]

        return jsonify({
            'reports': report_data,
            'total_reports': len(reports)
        })

    except Exception as e:
        current_app.logger.error(f"Error getting email status: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@report_routes.route('/reports/send-email/<int:report_id>', methods=['POST'])
@login_required
@admin_required
def send_report_email(report_id):
    """Send a single report email"""
    try:
        report = Report.query.get_or_404(report_id)
        
        # Check permissions through student's tennis club
        if report.student.tennis_club_id != current_user.tennis_club_id:
            return jsonify({'error': 'Unauthorized'}), 403

        # Individual email check - only checks for contact email
        can_send, reason = report.can_send_email(is_bulk_send=False)
        if not can_send:
            return jsonify({'error': reason}), 400

        # Get email content from request
        data = request.get_json()
        subject = data.get('subject')
        message = data.get('message')

        # Send email with custom template
        email_service = EmailService()
        success, message, message_id = email_service.send_report(
            report=report,
            subject=subject,
            message=message
        )

        if success:
            return jsonify({
                'message': 'Email sent successfully',
                'message_id': message_id,
                'email_sent_at': report.email_sent_at.isoformat() if report.email_sent_at else None,
                'last_email_status': report.last_email_status,
                'email_attempts': report.email_attempts
            })
        else:
            return jsonify({'error': message}), 500

    except Exception as e:
        current_app.logger.error(f"Error sending email: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@report_routes.route('/report-templates', methods=['GET', 'POST'])
@login_required
@admin_required
def manage_templates():
    if request.method == 'POST':
        data = request.get_json()
        try:
            template = ReportTemplate(
                name=data['name'],
                description=data.get('description'),
                organisation_id=current_user.tennis_club.organisation_id,  # CHANGED: use organisation_id
                created_by_id=current_user.id,
                is_active=True
            )
            
            # Add sections and fields (rest remains the same)
            for section_data in data['sections']:
                section = TemplateSection(
                    name=section_data['name'],
                    order=section_data['order']
                )
                
                for field_data in section_data['fields']:
                    field = TemplateField(
                        name=field_data['name'],
                        description=field_data.get('description'),
                        field_type=FieldType[field_data['fieldType'].upper()],
                        is_required=field_data['isRequired'],
                        order=field_data['order'],
                        options=field_data.get('options')
                    )
                    section.fields.append(field)
                
                template.sections.append(section)
            
            # Handle group assignments
            if 'assignedGroups' in data:
                for group_data in data['assignedGroups']:
                    group_assoc = GroupTemplate(
                        group_id=group_data['id'],
                        is_active=True
                    )
                    template.group_associations.append(group_assoc)
            
            db.session.add(template)
            db.session.commit()
            
            return jsonify({
                'id': template.id,
                'message': 'Template created successfully'
            })
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error creating template: {str(e)}")
            return jsonify({'error': str(e)}), 400
    
    # GET - Return all templates for the organisation
    templates = ReportTemplate.query.filter_by(
        organisation_id=current_user.tennis_club.organisation_id,  # CHANGED: use organisation_id
        is_active=True
    ).all()
    
    return jsonify([{
        'id': t.id,
        'name': t.name,
        'description': t.description,
        'assignedGroups': [{
            'id': assoc.group.id,
            'name': assoc.group.name
        } for assoc in t.group_associations if assoc.is_active],
        'sections': [{
            'id': s.id,
            'name': s.name,
            'order': s.order,
            'fields': [{
                'id': f.id,
                'name': f.name,
                'description': f.description,
                'fieldType': f.field_type.value,
                'isRequired': f.is_required,
                'order': f.order,
                'options': f.options
            } for f in s.fields]
        } for s in t.sections]
    } for t in templates])


@report_routes.route('/report-templates/<int:template_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required
@admin_required
def manage_template(template_id):
    template = ReportTemplate.query.filter_by(
        id=template_id,
        organisation_id=current_user.tennis_club.organisation_id  # CHANGED: use organisation_id
    ).first_or_404()
    
    if request.method == 'PUT':
        data = request.get_json()
        try:
            template.name = data['name']
            template.description = data.get('description')
            
            # Update sections and fields
            template.sections = []  # Remove old sections
            
            for section_data in data['sections']:
                section = TemplateSection(
                    name=section_data['name'],
                    order=section_data['order']
                )
                
                for field_data in section_data['fields']:
                    field = TemplateField(
                        name=field_data['name'],
                        description=field_data.get('description'),
                        field_type=FieldType[field_data['fieldType'].upper()],
                        is_required=field_data['isRequired'],
                        order=field_data['order'],
                        options=field_data.get('options')
                    )
                    section.fields.append(field)
                
                template.sections.append(section)
            
            # Update group assignments
            # First deactivate all existing assignments
            for assoc in template.group_associations:
                assoc.is_active = False
            
            # Then create new assignments or reactivate existing ones
            if 'assignedGroups' in data:
                assigned_group_ids = [g['id'] for g in data['assignedGroups']]
                for group_id in assigned_group_ids:
                    existing_assoc = GroupTemplate.query.filter_by(
                        template_id=template.id,
                        group_id=group_id
                    ).first()
                    
                    if existing_assoc:
                        existing_assoc.is_active = True
                    else:
                        new_assoc = GroupTemplate(
                            template_id=template.id,
                            group_id=group_id,
                            is_active=True
                        )
                        db.session.add(new_assoc)
            
            db.session.commit()
            return jsonify({'message': 'Template updated successfully'})
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error updating template: {str(e)}")
            return jsonify({'error': str(e)}), 400
    
    elif request.method == 'DELETE':
        template.is_active = False
        db.session.commit()
        return jsonify({'message': 'Template deactivated successfully'})
    
    # GET - Return single template with group assignments
    return jsonify({
        'id': template.id,
        'name': template.name,
        'description': template.description,
        'assignedGroups': [{
            'id': assoc.group.id,
            'name': assoc.group.name
        } for assoc in template.group_associations if assoc.is_active],
        'sections': [{
            'id': s.id,
            'name': s.name,
            'order': s.order,
            'fields': [{
                'id': f.id,
                'name': f.name,
                'description': f.description,
                'fieldType': f.field_type.value,
                'isRequired': f.is_required,
                'order': f.order,
                'options': f.options
            } for f in s.fields]
        } for s in template.sections]
    })


@report_routes.route('/templates/group-assignments', methods=['GET', 'POST', 'DELETE'])
@login_required
@verify_club_access()
def manage_group_templates():
    if request.method == 'POST':
        try:
            data = request.get_json()
            template_id = data.get('template_id')
            group_id = data.get('group_id')
            
            if not template_id or not group_id:
                return jsonify({'error': 'Template ID and Group ID are required'}), 400
            
            # Verify group and template belong to user's organisation
            group = TennisGroup.query.filter_by(
                id=group_id, 
                organisation_id=current_user.tennis_club.organisation_id
            ).first_or_404()
            
            template = ReportTemplate.query.filter_by(
                id=template_id, 
                tennis_club_id=current_user.tennis_club_id
            ).first_or_404()
            
            # Check if group already has an active template
            existing_assoc = GroupTemplate.query.filter_by(
                group_id=group_id,
                is_active=True
            ).first()
            
            if existing_assoc:
                return jsonify({
                    'error': 'This group already has an active template assigned. Please unassign the current template first.'
                }), 400
            
            # Create new association
            new_assoc = GroupTemplate(
                group_id=group_id,
                template_id=template_id,
                is_active=True
            )
            db.session.add(new_assoc)
            db.session.commit()
            
            # Return updated assignments
            assignments = GroupTemplate.query.join(TennisGroup).filter(
                TennisGroup.organisation_id == current_user.tennis_club.organisation_id,
                GroupTemplate.is_active == True
            ).all()
            
            return jsonify({
                'message': 'Template assigned successfully',
                'assignments': [{
                    'group_id': a.group_id,
                    'template_id': a.template_id,
                    'group_name': a.group.name,
                    'template_name': a.template.name
                } for a in assignments]
            })
            
        except Exception as e:
            db.session.rollback()
            print(f"Error assigning template to group: {str(e)}")
            print(traceback.format_exc())
            return jsonify({'error': str(e)}), 500
            
    elif request.method == 'DELETE':
        try:
            group_id = request.args.get('group_id')
            if not group_id:
                return jsonify({'error': 'Group ID is required'}), 400
            
            # Verify group belongs to user's organisation
            group = TennisGroup.query.filter_by(
                id=group_id, 
                organisation_id=current_user.tennis_club.organisation_id
            ).first_or_404()
            
            # Find and deactivate the assignment
            assignment = GroupTemplate.query.filter_by(
                group_id=group_id,
                is_active=True
            ).first()
            
            if not assignment:
                return jsonify({'error': 'No active template assignment found for this group'}), 404
            
            assignment.is_active = False
            db.session.commit()
            
            return jsonify({
                'message': 'Template unassigned successfully',
                'group_id': group_id
            })
            
        except Exception as e:
            db.session.rollback()
            print(f"Error unassigning template: {str(e)}")
            print(traceback.format_exc())
            return jsonify({'error': str(e)}), 500
    
    # GET - Return all group-template assignments
    try:
        assignments = GroupTemplate.query.join(TennisGroup).filter(
            TennisGroup.organisation_id == current_user.tennis_club.organisation_id,
            GroupTemplate.is_active == True
        ).all()
        
        return jsonify([{
            'groupId': a.group_id,
            'templateId': a.template_id,
            'group_name': a.group.name,
            'template_name': a.template.name
        } for a in assignments])
        
    except Exception as e:
        current_app.logger.error(f"Error fetching group templates: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@report_routes.route('/reports/delete/<int:report_id>', methods=['POST'])
@login_required
@verify_club_access()
def delete_report(report_id):
    report = Report.query.get_or_404(report_id)
    
    if not (current_user.is_admin or current_user.is_super_admin) and report.coach_id != current_user.id:
        return jsonify({'error': 'Permission denied'}), 403

    try:
        db.session.delete(report)
        db.session.commit()
        return jsonify({'message': 'Report deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
    
@report_routes.route('/report/new/<int:player_id>', methods=['GET','POST'])
@login_required
@verify_club_access()
def new_report(player_id):
    player = ProgrammePlayers.query.get_or_404(player_id)
    
    if not current_user.is_admin and player.coach_id != current_user.id:
        flash('You do not have permission to create a report for this player', 'error')
        return redirect(url_for('main.dashboard'))

    template = (ReportTemplate.query
        .join(GroupTemplate)
        .filter(
            GroupTemplate.group_id == player.group_id,
            GroupTemplate.is_active == True,
            ReportTemplate.is_active == True
        ).first())
    
    if not template:
        flash('No active template found for this group', 'error')
        return redirect(url_for('main.dashboard'))

    return render_template('pages/create_report.html', 
                         player_id=player_id,
                         student_name=player.student.name,
                         group_name=player.tennis_group.name)

@report_routes.route('/reports/<int:report_id>/edit')
@login_required
@verify_club_access()
def edit_report_page(report_id):
    """Render the edit report page"""
    report = Report.query.get_or_404(report_id)
    
    # Check permissions
    if not current_user.is_admin and report.coach_id != current_user.id:
        flash('You do not have permission to edit this report', 'error')
        return redirect(url_for('main.dashboard'))
        
    return render_template('pages/edit_report.html', report_id=report_id)

@report_routes.route('/organisation-groups', methods=['GET'])
@login_required
@admin_required
def get_organisation_groups():
    """Get all groups across the organisation with club time slot info"""
    try:
        organisation_id = current_user.tennis_club.organisation_id
        
        #Get groups directly by organisation_id 
        groups = TennisGroup.query.filter_by(organisation_id=organisation_id).all()
        
        # Get all clubs in the organisation for reference
        clubs = TennisClub.query.filter_by(organisation_id=organisation_id).all()
        club_map = {club.id: club.name for club in clubs}
        
        result = []
        for group in groups:
            # Find which clubs have time slots for this group
            clubs_with_times = (db.session.query(TennisGroupTimes.tennis_club_id)
                .filter_by(group_id=group.id)
                .distinct()
                .all())
            
            club_names = [club_map.get(club_id[0]) for club_id in clubs_with_times if club_map.get(club_id[0])]
            
            result.append({
                'id': group.id,
                'name': group.name,
                'description': group.description,
                'club_names': club_names,
                'clubs_with_times': len(club_names) 
            })
        
        # Sort by group name
        result.sort(key=lambda x: x['name'])
        
        return jsonify(result)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching organisation groups: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
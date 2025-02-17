import boto3
from botocore.exceptions import ClientError
from flask import current_app
import logging
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from app.utils.report_generator import create_single_report_pdf
from io import BytesIO
import traceback
from jinja2 import Template
import os
import tempfile

class EmailService:
    def __init__(self):
        self.region = current_app.config['AWS_SES_REGION']
        self.ses_client = boto3.client(
            'ses',
            region_name=self.region,
            aws_access_key_id=current_app.config['AWS_ACCESS_KEY_ID'],
            aws_secret_access_key=current_app.config['AWS_SECRET_ACCESS_KEY']
        )
        self.sender = current_app.config['AWS_SES_SENDER']

    def _generate_wilton_report(self, report, pdf_buffer):
        """Generate a Wilton-specific report"""
        try:
            from app.utils.wilton_report_generator import EnhancedWiltonReportGenerator
            
            # Get config path
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            config_path = os.path.join(base_dir, 'utils', 'wilton_group_config.json')
            
            if not os.path.exists(config_path):
                current_app.logger.warning(f"Wilton config not found at: {config_path}")
                return False

            # Initialize generator
            generator = EnhancedWiltonReportGenerator(config_path)
            
            # Get template path
            template_path = generator.get_template_path(report.tennis_group.name)
            
            # Prepare report data
            data = {
                'player_name': report.student.name,
                'coach_name': report.coach.name,
                'term': report.teaching_period.name,
                'group': report.tennis_group.name,
                'content': report.content,
                'recommended_group': report.recommended_group.name if report.recommended_group else None,
                'teaching_period': {
                    'next_period_start_date': report.teaching_period.next_period_start_date.strftime('%Y-%m-%d') if report.teaching_period.next_period_start_date else None,
                    'bookings_open_date': report.teaching_period.bookings_open_date.strftime('%Y-%m-%d') if report.teaching_period.bookings_open_date else None
                }
            }

            # Check if we have both template and group config
            group_config = generator.get_group_config(data['group'])
            if not template_path or not os.path.exists(template_path) or not group_config:
                return False

            # Create temporary file for generation
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_file:
                try:
                    # Generate the report
                    generator.generate_report(template_path, tmp_file.name, data)
                    
                    # Verify file was created
                    if not os.path.exists(tmp_file.name) or os.path.getsize(tmp_file.name) == 0:
                        raise ValueError("Generated Wilton report is empty")
                    
                    # Copy to buffer
                    with open(tmp_file.name, 'rb') as f:
                        pdf_buffer.write(f.read())
                        pdf_buffer.seek(0)
                    
                    return True
                    
                finally:
                    # Clean up temporary file
                    if os.path.exists(tmp_file.name):
                        os.unlink(tmp_file.name)
                        
        except Exception as e:
            current_app.logger.warning(f"Error in Wilton report generation: {str(e)}")
            current_app.logger.debug(traceback.format_exc())
            return False

    def _generate_report_pdf(self, report, pdf_buffer):
        """Generate appropriate PDF report based on tennis club"""
        try:
            # Check if this is a Wilton report
            club_name = report.programme_player.tennis_club.name.lower()
            
            if 'wilton' in club_name:
                # Try Wilton report first
                success = self._generate_wilton_report(report, pdf_buffer)
                if success:
                    return
                
                pdf_buffer.seek(0)
                pdf_buffer.truncate()

            # Generate generic report
            create_single_report_pdf(report, pdf_buffer)
            
        except Exception as e:
            current_app.logger.error(f"Error in report generation: {str(e)}")
            current_app.logger.error(traceback.format_exc())
            raise

    def _create_raw_email_with_attachment(self, recipient, subject, message, pdf_data, student_name):
        """Create a raw email with PDF attachment"""
        msg = MIMEMultipart('mixed')
        msg['Subject'] = subject
        msg['From'] = self.sender
        msg['To'] = recipient

        # Add the message
        text_part = MIMEText(message, 'plain', 'utf-8')
        msg.attach(text_part)

        # Add the PDF attachment
        pdf_attachment = MIMEApplication(pdf_data, _subtype='pdf')
        pdf_attachment.add_header(
            'Content-Disposition',
            'attachment',
            filename=f'{student_name}_Tennis_Report.pdf'
        )
        msg.attach(pdf_attachment)

        return msg.as_string()

    def _prepare_email_content(self, report):
        """Prepare email subject and body using report template"""
        # Get recommended group name
        recommended_group = report.recommended_group.name if report.recommended_group else "Same group"

        # Create context for replacements
        context = {
            'student_name': report.student.name,
            'recommended_group': recommended_group,
            'booking_date': report.teaching_period.next_period_start_date.strftime('%A %d %B') if report.teaching_period.next_period_start_date else 'TBC',
            'coach_name': report.coach.name,
            'tennis_club': report.programme_player.tennis_club.name,
        }

        # Define default templates
        subject = f"Tennis Report for {context['student_name']}"
        body = f"""Dear Parent/Guardian,

Please find attached the tennis report for {context['student_name']}.

Recommended Group: {context['recommended_group']}

Best regards,
{context['coach_name']}
{context['tennis_club']}"""

        return subject, body

    def send_report(self, report, subject=None, message=None):
        """Send a single report with PDF attachment"""
        try:
            if not report.student.contact_email:
                return False, "No email address available for this student", None

            # Generate PDF using appropriate generator
            pdf_buffer = BytesIO()
            self._generate_report_pdf(report, pdf_buffer)
            pdf_buffer.seek(0)
            pdf_data = pdf_buffer.getvalue()

            # Create context for template replacements
            context = {
                'student_name': report.student.name,
                'recommended_group': report.recommended_group.name if report.recommended_group else "Same group",
                'booking_date': report.teaching_period.next_period_start_date.strftime('%A %d %B') if report.teaching_period.next_period_start_date else 'TBC',
                'coach_name': report.coach.name,
                'tennis_club': report.programme_player.tennis_club.name,
                'group_name': report.tennis_group.name,
                'term_name': report.teaching_period.name
            }

            try:
                # Render email content
                if subject and message:
                    email_subject = subject.format(**context)
                    email_body = message.format(**context)
                else:
                    email_subject, email_body = self._prepare_email_content(report)

                # Create and send email
                raw_email = self._create_raw_email_with_attachment(
                    recipient=report.student.contact_email,
                    subject=email_subject,
                    message=email_body,
                    pdf_data=pdf_data,
                    student_name=report.student.name
                )

                response = self.ses_client.send_raw_email(
                    Source=self.sender,
                    RawMessage={'Data': raw_email}
                )
                
                message_id = response.get('MessageId', '')

                # Record successful attempt
                report.record_email_attempt(
                    status='success',
                    recipients=[report.student.contact_email],
                    subject=email_subject,
                    message_id=message_id
                )

                return True, "Email sent successfully", message_id

            except ClientError as e:
                error_code = e.response['Error']['Code']
                if error_code == 'MessageRejected' and 'not verified' in str(e):
                    # Record skipped email
                    report.record_email_attempt(
                        status='skipped',
                        recipients=[report.student.contact_email],
                        subject=email_subject,
                        error='Email address not verified'
                    )
                    return False, f"Email skipped - address not verified: {report.student.contact_email}", None
                else:
                    raise

        except Exception as e:
            error_msg = str(e)
            # Record failed attempt
            report.record_email_attempt(
                status='failed',
                recipients=[report.student.contact_email] if report.student.contact_email else [],
                subject=subject,
                error=error_msg
            )
            current_app.logger.error(f"Error sending email: {error_msg}")
            current_app.logger.error(traceback.format_exc())
            return False, f"Failed to send email: {error_msg}", None
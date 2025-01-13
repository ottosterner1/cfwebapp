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

    def _render_template(self, template_str: str, context: dict) -> str:
        """Render a template string using Jinja2"""
        if not template_str:
            return ""
        template = Template(template_str)
        return template.render(**context)

    def _prepare_email_content(self, report):
        """Prepare email subject and body using report template"""
        template = report.template
        
        # Default templates if none specified
        default_subject = f"Tennis Report for {report.student.name}"
        default_body = f"""Dear Parent,

Please find attached the tennis report for {report.student.name}.

Best regards,
{report.coach.name}
{report.programme_player.tennis_club.name}"""

        # Create context with all available data
        context = {
            'student_name': report.student.name,
            'group_name': report.tennis_group.name,
            'coach_name': report.coach.name,
            'tennis_club': report.programme_player.tennis_club.name,
            'date': report.date.strftime('%B %d, %Y'),
            'content': report.content  # The structured JSON content
        }

        # Render subject and body
        subject = self._render_template(template.email_subject_template, context) if template.email_subject_template else default_subject
        body = self._render_template(template.email_body_template, context) if template.email_body_template else default_body

        return subject, body

    def send_reports_batch(self, reports, subject=None, message=None):
        """Send batch of reports with PDF attachments"""
        success_count = 0
        error_count = 0
        errors = []

        for report in reports:
            try:
                if not report.student.contact_email:
                    error_count += 1
                    errors.append(f"No email for student: {report.student.name}")
                    continue

                # Generate PDF
                pdf_buffer = BytesIO()
                create_single_report_pdf(report, pdf_buffer)
                pdf_buffer.seek(0)
                pdf_data = pdf_buffer.getvalue()

                # Get email content from template if not provided
                email_subject, email_body = (
                    (subject, message) if subject and message
                    else self._prepare_email_content(report)
                )

                # Create raw email with attachment
                raw_email = self._create_raw_email_with_attachment(
                    recipient=report.student.contact_email,
                    subject=email_subject,
                    message=email_body,
                    pdf_data=pdf_data,
                    student_name=report.student.name
                )

                # Send email
                self.ses_client.send_raw_email(
                    Source=self.sender,
                    RawMessage={'Data': raw_email}
                )

                # Update report status
                if hasattr(report, 'email_sent'):
                    report.mark_as_sent('Success')

                success_count += 1
                
            except ClientError as e:
                error_count += 1
                error_msg = f"Failed to send to {report.student.name}: {str(e)}"
                errors.append(error_msg)
                logging.error(error_msg)
                logging.error(traceback.format_exc())
                if hasattr(report, 'email_sent'):
                    report.mark_as_sent(f'Error: {str(e)}')
                
            except Exception as e:
                error_count += 1
                error_msg = f"Unexpected error for {report.student.name}: {str(e)}"
                errors.append(error_msg)
                logging.error(error_msg)
                logging.error(traceback.format_exc())
                if hasattr(report, 'email_sent'):
                    report.mark_as_sent(f'Error: {str(e)}')

        return success_count, error_count, errors
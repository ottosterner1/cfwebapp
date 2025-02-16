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

            # Check if email has already been sent
            if report.email_sent:
                return False, "Email has already been sent to this recipient", None

            # Generate PDF
            pdf_buffer = BytesIO()
            create_single_report_pdf(report, pdf_buffer)
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
            return False, f"Failed to send email: {error_msg}", None
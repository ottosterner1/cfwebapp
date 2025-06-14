import boto3
from botocore.exceptions import ClientError
from flask import current_app, url_for
import logging
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from app.utils.report_generator import create_single_report_pdf
from io import BytesIO
import traceback
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

    def _create_raw_email_with_attachment(self, recipient, subject, message, pdf_data, student_name, club_name):
        """Create a raw email with PDF attachment and improved headers for better deliverability"""
        msg = MIMEMultipart('mixed')
        msg['Subject'] = subject
        msg['From'] = f'"{club_name}" <{self.sender}>'  # Display name as the tennis club
        msg['To'] = recipient
        
        # Add custom headers to improve deliverability
        msg.add_header('X-Auto-Response-Suppress', 'OOF')
        msg.add_header('X-Report-Type', 'Tennis-Student-Report')
        msg.add_header('X-Priority', '1')  # High priority
        
        # Create alternative part for plain text and HTML
        alt_part = MIMEMultipart('alternative')
        
        # Plain text part - always include this for better compatibility
        text_plain = message.replace('<br>', '\n').replace('<br/>', '\n')
        # Remove HTML tags for plain text version
        for tag in ['<p>', '</p>', '<div>', '</div>', '<html>', '</html>', '<body>', '</body>']:
            text_plain = text_plain.replace(tag, '')
        text_part = MIMEText(text_plain, 'plain', 'utf-8')
        alt_part.attach(text_part)
        
        # HTML part - if message contains HTML format, use it directly
        if '<html>' in message or '<body>' in message or '<p>' in message or '<br>' in message:
            html_part = MIMEText(message, 'html', 'utf-8')
            alt_part.attach(html_part)
        else:
            # If plain text is provided, convert newlines to <br> for HTML version
            html_content = """
            <html>
            <body style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto;">
                    <div style="margin-bottom: 30px;">
                        {content}
                    </div>
                    <div style="font-size: 0.9em; color: #666; border-top: 1px solid #eee; padding-top: 15px;">
                        <p>Please do not reply to this email.</p>
                        <p>To ensure you receive our emails, please add {sender} to your contacts or primary inbox.</p>
                    </div>
                </div>
            </body>
            </html>
            """.format(
                club=club_name,
                content=message.replace('\n', '<br>'),
                sender=self.sender
            )
            html_part = MIMEText(html_content, 'html', 'utf-8')
            alt_part.attach(html_part)
        
        # Attach the multipart/alternative to the message
        msg.attach(alt_part)

        # Add the PDF attachment
        pdf_attachment = MIMEApplication(pdf_data, _subtype='pdf')
        pdf_attachment.add_header(
            'Content-Disposition',
            'attachment',
            filename=f'{student_name}_Tennis_Report.pdf'
        )
        msg.attach(pdf_attachment)

        return msg.as_string()

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

            # Get club name
            club_name = report.programme_player.tennis_club.name
            
            # Create context for template replacements
            context = {
                'student_name': report.student.name,
                'recommended_group': report.recommended_group.name if report.recommended_group else "Same group",
                'booking_date': report.teaching_period.next_period_start_date.strftime('%A %d %B') if report.teaching_period.next_period_start_date else 'TBC',
                'coach_name': report.coach.name,
                'tennis_club': club_name,
                'group_name': report.tennis_group.name,
                'term_name': report.teaching_period.name
            }
            
            # Use provided subject and message or set defaults
            if not subject:
                subject = f"Tennis Report for {report.student.name} - {report.teaching_period.name}"
            else:
                # Replace placeholders in subject
                for key, value in context.items():
                    subject = subject.replace(f"{{{key}}}", str(value))
                    
            if not message:
                message = f"Please find attached the tennis report for {report.student.name}."
            else:
                # Replace placeholders in message
                for key, value in context.items():
                    message = message.replace(f"{{{key}}}", str(value))

            try:
                # Create and send email with improved headers
                raw_email = self._create_raw_email_with_attachment(
                    recipient=report.student.contact_email,
                    subject=subject,
                    message=message,
                    pdf_data=pdf_data,
                    student_name=report.student.name,
                    club_name=club_name
                )

                response = self.ses_client.send_raw_email(
                    Source=f'"{club_name}" <{self.sender}>',  # Show tennis club name in sender
                    RawMessage={'Data': raw_email}
                )
                
                message_id = response.get('MessageId', '')

                # Record successful attempt
                report.record_email_attempt(
                    status='success',
                    recipients=[report.student.contact_email],
                    subject=subject,
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
                        subject=subject,
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

    # ============================================================================
    # SURVEY EMAIL METHODS (NEW)
    # ============================================================================

    def send_survey_invitation(self, recipient_email: str, survey_url: str, opt_out_url: str,
                             club_name: str, recipient_name: str = None, student_name: str = None,
                             template_name: str = None):
        """Send survey invitation email using legitimate interests"""
        try:
            # Create personalized subject
            if student_name:
                subject = f"Quick feedback about {student_name}'s tennis coaching - {club_name}"
            else:
                subject = f"Your feedback would help us improve - {club_name}"
            
            # Create greeting
            greeting = f"Dear {recipient_name}" if recipient_name else "Dear Parent/Guardian"
            
            # Template matching GDPR-compliant example
            html_content = f"""
            <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h3 style="color: #2c5aa0;">Help us improve our tennis coaching</h3>
                    
                    <p>{greeting},</p>
                    
                    <p>As part of our commitment to improving coaching quality, 
                    we'd like your feedback on {student_name + "'s" if student_name else "your child's"} recent tennis sessions.</p>
                    
                    <p style="margin: 20px 0;">
                        <a href="{survey_url}" style="background-color: #4CAF50; color: white; 
                           padding: 12px 24px; text-decoration: none; border-radius: 4px; 
                           display: inline-block; font-weight: bold;">
                            Take 2-Minute Survey
                        </a>
                    </p>
                    
                    <p>We use this feedback to enhance our coaching methods and facilities.</p>
                    
                    <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
                    
                    <div style="font-size: 0.9em; color: #666;">
                        <p>If you prefer not to receive these surveys, you can 
                        <a href="{opt_out_url}" style="color: #666;">opt out here</a>.</p>
                        
                        <p>This survey is part of our legitimate interest in service improvement, 
                        as explained in our privacy policy. We respect your privacy and will only 
                        use your feedback to improve our tennis coaching services.</p>
                        
                        <p>Thank you for helping us provide the best possible tennis coaching experience.</p>
                        
                        <p style="margin-top: 20px;">
                            Best regards,<br>
                            The {club_name} Team
                        </p>
                    </div>
                </div>
            </body>
            </html>
            """
            
            # Create plain text version
            plain_text = f"""
            {greeting},
            
            As part of our commitment to improving coaching quality, we'd like your feedback on {student_name + "'s" if student_name else "your child's"} recent tennis sessions.
            
            Please take our 2-minute survey: {survey_url}
            
            We use this feedback to enhance our coaching methods and facilities.
            
            If you prefer not to receive these surveys, you can opt out here: {opt_out_url}
            
            This survey is part of our legitimate interest in service improvement. We respect your privacy and will only use your feedback to improve our tennis coaching services.
            
            Thank you for helping us provide the best possible tennis coaching experience.
            
            Best regards,
            The {club_name} Team
            """
            
            return self.send_generic_email(
                recipient_email=recipient_email,
                subject=subject,
                html_content=html_content,
                text_content=plain_text,
                sender_name=club_name
            )
            
        except Exception as e:
            current_app.logger.error(f"Error sending survey invitation: {str(e)}")
            current_app.logger.error(traceback.format_exc())
            return False, f"Failed to send survey invitation: {str(e)}"

    def send_survey_reminder(self, recipient_email: str, survey_url: str, opt_out_url: str,
                           club_name: str, recipient_name: str = None, student_name: str = None,
                           days_remaining: int = 7):
        """Send survey reminder email"""
        try:
            subject = f"Reminder: Your feedback requested - {club_name}"
            greeting = f"Dear {recipient_name}" if recipient_name else "Dear Parent/Guardian"
            
            html_content = f"""
            <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h3 style="color: #2c5aa0;">Reminder: Your feedback is still needed</h3>
                    
                    <p>{greeting},</p>
                    
                    <p>We sent you a brief survey about {student_name + "'s" if student_name else "your child's"} tennis coaching experience, 
                    and we'd still love to hear from you.</p>
                    
                    <p>Your feedback helps us provide better coaching for all our students.</p>
                    
                    <p style="margin: 20px 0;">
                        <a href="{survey_url}" style="background-color: #4CAF50; color: white; 
                           padding: 12px 24px; text-decoration: none; border-radius: 4px; 
                           display: inline-block; font-weight: bold;">
                            Complete Survey (2 minutes)
                        </a>
                    </p>
                    
                    <p><small>This survey link will expire in {days_remaining} days.</small></p>
                    
                    <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
                    
                    <div style="font-size: 0.9em; color: #666;">
                        <p>If you prefer not to receive these reminders, you can 
                        <a href="{opt_out_url}" style="color: #666;">opt out here</a>.</p>
                        
                        <p>Thank you,<br>
                        The {club_name} Team</p>
                    </div>
                </div>
            </body>
            </html>
            """
            
            plain_text = f"""
            {greeting},
            
            We sent you a brief survey about {student_name + "'s" if student_name else "your child's"} tennis coaching experience, and we'd still love to hear from you.
            
            Your feedback helps us provide better coaching for all our students.
            
            Please take our 2-minute survey: {survey_url}
            
            This survey link will expire in {days_remaining} days.
            
            If you prefer not to receive these reminders, you can opt out here: {opt_out_url}
            
            Thank you,
            The {club_name} Team
            """
            
            return self.send_generic_email(
                recipient_email=recipient_email,
                subject=subject,
                html_content=html_content,
                text_content=plain_text,
                sender_name=club_name
            )
            
        except Exception as e:
            current_app.logger.error(f"Error sending survey reminder: {str(e)}")
            return False, f"Failed to send survey reminder: {str(e)}"

    def send_opt_out_confirmation(self, recipient_email: str, club_name: str):
        """Send confirmation email after opt-out"""
        try:
            subject = f"Unsubscribed from surveys - {club_name}"
            
            html_content = f"""
            <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h3 style="color: #2c5aa0;">You've been unsubscribed</h3>
                    
                    <p>This confirms that you have been removed from our survey mailing list.</p>
                    
                    <p>You will no longer receive feedback surveys from {club_name}.</p>
                    
                    <p>You will continue to receive essential communications about your tennis coaching 
                    (such as reports, schedule changes, and important updates).</p>
                    
                    <p>If you change your mind and would like to receive our surveys again in the future, 
                    please contact us directly.</p>
                    
                    <p>Thank you,<br>
                    The {club_name} Team</p>
                </div>
            </body>
            </html>
            """
            
            plain_text = f"""
            You've been unsubscribed
            
            This confirms that you have been removed from our survey mailing list.
            
            You will no longer receive feedback surveys from {club_name}.
            
            You will continue to receive essential communications about your tennis coaching (such as reports, schedule changes, and important updates).
            
            If you change your mind and would like to receive our surveys again in the future, please contact us directly.
            
            Thank you,
            The {club_name} Team
            """
            
            return self.send_generic_email(
                recipient_email=recipient_email,
                subject=subject,
                html_content=html_content,
                text_content=plain_text,
                sender_name=club_name
            )
            
        except Exception as e:
            current_app.logger.error(f"Error sending opt-out confirmation: {str(e)}")
            return False, f"Failed to send opt-out confirmation: {str(e)}"

    # ============================================================================
    # EXISTING METHODS (UNCHANGED)
    # ============================================================================
            
    def send_accreditation_reminder(self, email, coach_name, expiring_accreditations):
        """Send reminder email for expiring coaching accreditations"""
        try:
            # Create accreditation list
            accreditation_list = "\n".join([
                f"- {name}: {days} days remaining" if days > 0 else
                f"- {name}: Expired" 
                for name, days in expiring_accreditations
            ])
            
            subject = "Action Required: Coaching Accreditation Update"
            
            message = f"""Dear {coach_name},

This is a reminder that the following coaching accreditations need attention:

{accreditation_list}

Please update your accreditations as soon as possible to maintain compliance with LTA requirements.

Thank you,
CourtFlow Platform
"""
            
            # Send simple email without attachment
            response = self.ses_client.send_email(
                Source=self.sender,
                Destination={'ToAddresses': [email]},
                Message={
                    'Subject': {'Data': subject},
                    'Body': {'Text': {'Data': message}}
                }
            )
            
            return True, "Reminder sent successfully", response.get('MessageId', '')
            
        except Exception as e:
            current_app.logger.error(f"Error sending accreditation reminder: {str(e)}")
            current_app.logger.error(traceback.format_exc())
            return False, f"Failed to send reminder: {str(e)}", None
            
    def send_coach_invitation(self, invitation, club_name):
        """Send an invitation email to a coach using raw email format for better deliverability"""
        try:
            
            # Generate the invitation URL
            invite_url = url_for('club_management.accept_invitation',
                            token=invitation.token,
                            _external=True)
            
            # Email content
            subject = f'Invitation to join {club_name} on CourtFlow'
            
            # HTML version
            body_html = f"""
            <html>
                <body style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto;">
                        <div style="margin-bottom: 30px;">
                            <h2>Welcome to CourtFlow!</h2>
                            <p>You have been invited to join {club_name} as a coach.</p>
                            <p>Click the link below to accept the invitation and set up your account:</p>
                            <p><a href="{invite_url}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Accept Invitation</a></p>
                            <p>This invitation will expire in 48 hours.</p>
                            <p>If you did not expect this invitation, please ignore this email.</p>
                        </div>
                        <div style="font-size: 0.9em; color: #666; border-top: 1px solid #eee; padding-top: 15px;">
                            <p>Please do not reply to this email.</p>
                            <p>To ensure you receive our emails, please add {self.sender} to your contacts or primary inbox.</p>
                        </div>
                    </div>
                </body>
            </html>
            """
            
            # Plain text version
            body_text = f"""
            Welcome to CourtFlow!
            
            You have been invited to join {club_name} as a coach.
            
            Click the link below to accept the invitation and set up your account:
            {invite_url}
            
            This invitation will expire in 48 hours.
            
            If you did not expect this invitation, please ignore this email.
            
            ---
            Please do not reply to this email.
            To ensure you receive our emails, please add {self.sender} to your contacts or primary inbox.
            """
            
            # Create multipart message
            msg = MIMEMultipart('mixed')
            msg['Subject'] = subject
            msg['From'] = f'"{club_name}" <{self.sender}>'  # Display name as the tennis club
            msg['To'] = invitation.email
            
            # Add custom headers to improve deliverability
            msg.add_header('X-Auto-Response-Suppress', 'OOF')
            msg.add_header('X-Invitation-Type', 'Coach-Invitation')
            msg.add_header('X-Priority', '1')  # High priority
            
            # Create alternative part for plain text and HTML
            alt_part = MIMEMultipart('alternative')
            
            # Plain text part
            text_part = MIMEText(body_text, 'plain', 'utf-8')
            alt_part.attach(text_part)
            
            # HTML part
            html_part = MIMEText(body_html, 'html', 'utf-8')
            alt_part.attach(html_part)
            
            # Attach the multipart/alternative to the message
            msg.attach(alt_part)
            
            # Log email content preview
            raw_email = msg.as_string()
            
            # Send the raw email
            response = self.ses_client.send_raw_email(
                Source=f'"{club_name}" <{self.sender}>',
                RawMessage={'Data': raw_email}
            )

            return True, response.get('MessageId', '')
            
        except ClientError as e:
            current_app.logger.error(f"AWS SES ClientError: {str(e)}")
            if hasattr(e, 'response') and 'Error' in e.response:
                error_code = e.response['Error'].get('Code', 'Unknown')
                error_message = e.response['Error'].get('Message', 'No message')
                current_app.logger.error(f"Error Code: {error_code}")
                current_app.logger.error(f"Error Message: {error_message}")
            return False, str(e)
        except Exception as e:
            current_app.logger.error(f"Unexpected error sending invitation: {str(e)}")
            current_app.logger.error(traceback.format_exc())
            return False, f"Failed to send invitation: {str(e)}"
        
    def send_generic_email(self, recipient_email, subject, html_content, text_content=None, sender_name=None):
        """Send a generic email with HTML and plain text content"""
        try:
            # If no plain text content is provided, create it from HTML
            if not text_content:
                text_content = html_content.replace('<br>', '\n').replace('<br/>', '\n')
                for tag in ['<p>', '</p>', '<div>', '</div>', '<html>', '</html>', '<body>', '</body>', '<h2>', '</h2>', '<a href="', '">', '</a>']:
                    text_content = text_content.replace(tag, '')
            
            # Use the provided sender name or default
            from_address = f'"{sender_name}" <{self.sender}>' if sender_name else self.sender
            
            # Create multipart message
            msg = MIMEMultipart('mixed')
            msg['Subject'] = subject
            msg['From'] = from_address
            msg['To'] = recipient_email
            
            # Add custom headers to improve deliverability
            msg.add_header('X-Auto-Response-Suppress', 'OOF')
            
            # Create alternative part for plain text and HTML
            alt_part = MIMEMultipart('alternative')
            
            # Plain text part
            text_part = MIMEText(text_content, 'plain', 'utf-8')
            alt_part.attach(text_part)
            
            # HTML part
            html_part = MIMEText(html_content, 'html', 'utf-8')
            alt_part.attach(html_part)
            
            # Attach the multipart/alternative to the message
            msg.attach(alt_part)
            
            # Send the raw email
            raw_email = msg.as_string()
            response = self.ses_client.send_raw_email(
                Source=from_address,
                RawMessage={'Data': raw_email}
            )
            
            return True, response.get('MessageId', '')
            
        except ClientError as e:
            current_app.logger.error(f"AWS SES ClientError: {str(e)}")
            if hasattr(e, 'response') and 'Error' in e.response:
                error_code = e.response['Error'].get('Code', 'Unknown')
                error_message = e.response['Error'].get('Message', 'No message')
                current_app.logger.error(f"Error Code: {error_code}")
                current_app.logger.error(f"Error Message: {error_message}")
            return False, str(e)
        except Exception as e:
            current_app.logger.error(f"Unexpected error sending email: {str(e)}")
            current_app.logger.error(traceback.format_exc())
            return False, f"Failed to send email: {str(e)}"
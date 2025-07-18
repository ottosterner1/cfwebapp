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

    def get_report_sender_info(self, club):
        """Get the appropriate sender email and name for report emails from club"""
        organisation = club.organisation
        
        if organisation and organisation.sender_email:
            # Check if the custom sender email is verified in SES
            if self._is_email_verified(organisation.sender_email):
                sender_email = organisation.sender_email
                sender_name = club.name  # CHANGED: Use club name instead of organisation name
                current_app.logger.info(f"Using custom sender for {club.name}: {sender_email}")
                return sender_email, sender_name
            else:
                # Log warning but continue with default
                current_app.logger.warning(
                    f"Custom sender email {organisation.sender_email} for {organisation.name} "
                    f"is not verified in SES. Using default sender."
                )
        
        # Fallback to default sender with club name
        current_app.logger.info(f"Using default sender for {club.name}")
        return self.sender, club.name 

    def _is_email_verified(self, email):
        """Check if an email address is verified in SES"""
        try:
            response = self.ses_client.get_identity_verification_attributes(
                Identities=[email]
            )
            
            verification_attrs = response.get('VerificationAttributes', {})
            email_attrs = verification_attrs.get(email, {})
            
            return email_attrs.get('VerificationStatus') == 'Success'
            
        except ClientError as e:
            current_app.logger.error(f"Error checking email verification for {email}: {str(e)}")
            return False

    def send_verification_email(self, email):
        """Send a verification email through SES for a custom sender address"""
        try:
            response = self.ses_client.verify_email_identity(EmailAddress=email)
            current_app.logger.info(f"Verification email sent to {email}")
            return True, "Verification email sent successfully"
        except ClientError as e:
            current_app.logger.error(f"Error sending verification email to {email}: {str(e)}")
            return False, str(e)

    def get_verification_status(self, email):
        """Get the verification status of an email address"""
        try:
            response = self.ses_client.get_identity_verification_attributes(
                Identities=[email]
            )
            
            verification_attrs = response.get('VerificationAttributes', {})
            email_attrs = verification_attrs.get(email, {})
            
            status = email_attrs.get('VerificationStatus', 'NotStarted')
            return {
                'status': status,
                'is_verified': status == 'Success',
                'is_pending': status == 'Pending'
            }
            
        except ClientError as e:
            current_app.logger.error(f"Error getting verification status for {email}: {str(e)}")
            return {
                'status': 'Error',
                'is_verified': False,
                'is_pending': False,
                'error': str(e)
            }

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

    def _create_raw_email_with_attachment(self, recipient, subject, message, pdf_data, student_name, sender_email, sender_name):
        """Create a raw email with PDF attachment using specified sender"""
        msg = MIMEMultipart('mixed')
        msg['Subject'] = subject
        msg['From'] = f'"{sender_name}" <{sender_email}>'
        msg['To'] = recipient
        
        # Add custom headers to improve deliverability
        msg.add_header('X-Auto-Response-Suppress', 'OOF')
        msg.add_header('X-Report-Type', 'Tennis-Student-Report')
        msg.add_header('X-Priority', '1')
        
        # Create alternative part for plain text and HTML
        alt_part = MIMEMultipart('alternative')
        
        # Plain text part
        text_plain = message.replace('<br>', '\n').replace('<br/>', '\n')
        for tag in ['<p>', '</p>', '<div>', '</div>', '<html>', '</html>', '<body>', '</body>']:
            text_plain = text_plain.replace(tag, '')
        text_part = MIMEText(text_plain, 'plain', 'utf-8')
        alt_part.attach(text_part)
        
        # HTML part
        if '<html>' in message or '<body>' in message or '<p>' in message or '<br>' in message:
            html_part = MIMEText(message, 'html', 'utf-8')
            alt_part.attach(html_part)
        else:
            html_content = """
            <html>
            <body style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto;">
                    <div style="margin-bottom: 30px;">
                        {content}
                    </div>
                    <div style="font-size: 0.9em; color: #666; border-top: 1px solid #eee; padding-top: 15px;">
                        <p>To ensure you receive our emails, please add {sender} to your contacts or primary inbox.</p>
                    </div>
                </div>
            </body>
            </html>
            """.format(
                content=message.replace('\n', '<br>'),
                sender=sender_email
            )
            html_part = MIMEText(html_content, 'html', 'utf-8')
            alt_part.attach(html_part)
        
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
        """Send a single report with PDF attachment using organisation-specific sender"""
        try:
            if not report.student.contact_email:
                return False, "No email address available for this student", None

            # Get club and appropriate sender info
            club = report.programme_player.tennis_club
            sender_email, sender_name = self.get_report_sender_info(club)  # CHANGED: Pass club instead of organisation

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
                'tennis_club': club.name,  # CHANGED: Use club directly
                'group_name': report.tennis_group.name,
                'term_name': report.teaching_period.name
            }
            
            # Use provided subject and message or set defaults
            if not subject:
                subject = f"Tennis Report for {report.student.name} - {report.teaching_period.name}"
            else:
                for key, value in context.items():
                    subject = subject.replace(f"{{{key}}}", str(value))
                    
            if not message:
                message = f"Please find attached the tennis report for {report.student.name}."
            else:
                for key, value in context.items():
                    message = message.replace(f"{{{key}}}", str(value))

            try:
                # Create and send email with club-specific sender name
                raw_email = self._create_raw_email_with_attachment(
                    recipient=report.student.contact_email,
                    subject=subject,
                    message=message,
                    pdf_data=pdf_data,
                    student_name=report.student.name,
                    sender_email=sender_email,
                    sender_name=sender_name  # This will now be the club name
                )

                response = self.ses_client.send_raw_email(
                    Source=f'"{sender_name}" <{sender_email}>',  # Club name in sender
                    RawMessage={'Data': raw_email}
                )

                current_app.logger.info(f"SES Response: {response}")
                current_app.logger.info(f"Message ID: {response.get('MessageId')}")
                current_app.logger.info(f"Sent to: {report.student.contact_email}")
                current_app.logger.info(f"From: {sender_email}")
                current_app.logger.info(f"Sender Name: {sender_name}")  # Log the club name
                current_app.logger.info(f"Subject: {subject}")
                
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
                    # If custom sender fails verification, try with default sender
                    if sender_email != self.sender:
                        current_app.logger.warning(
                            f"Custom sender {sender_email} failed, retrying with default sender"
                        )
                        return self._retry_report_with_default_sender(
                            report, subject, message, pdf_data, club.name  # Pass club name
                        )
                    else:
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
                subject=subject or "Tennis Report",
                error=error_msg
            )
            current_app.logger.error(f"Error sending email: {error_msg}")
            current_app.logger.error(traceback.format_exc())
            return False, f"Failed to send email: {error_msg}", None


    def _retry_report_with_default_sender(self, report, subject, message, pdf_data, club_name):
        """Retry sending report email with default sender as fallback"""
        try:
            raw_email = self._create_raw_email_with_attachment(
                recipient=report.student.contact_email,
                subject=subject,
                message=message,
                pdf_data=pdf_data,
                student_name=report.student.name,
                sender_email=self.sender,
                sender_name=club_name  # CHANGED: Use club name instead of "CourtFlow"
            )

            response = self.ses_client.send_raw_email(
                Source=f'"{club_name}" <{self.sender}>',  # CHANGED: Use club name
                RawMessage={'Data': raw_email}
            )
            
            message_id = response.get('MessageId', '')

            # Record successful attempt with fallback note
            report.record_email_attempt(
                status='success',
                recipients=[report.student.contact_email],
                subject=subject,
                message_id=message_id,
                error='Sent with default sender (custom sender failed verification)'
            )

            return True, "Email sent successfully (using default sender)", message_id
            
        except Exception as e:
            error_msg = f"Fallback also failed: {str(e)}"
            report.record_email_attempt(
                status='failed',
                recipients=[report.student.contact_email],
                subject=subject,
                error=error_msg
            )
            return False, error_msg, None

    # ALL OTHER EMAIL METHODS USE DEFAULT COURTFLOW SENDER UNCHANGED

    def send_accreditation_reminder(self, email, coach_name, expiring_accreditations):
        """Send reminder email for expiring coaching accreditations using default CourtFlow sender"""
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
            
            # Send simple email without attachment using default sender
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
        """Send an invitation email to a coach using default CourtFlow sender"""
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
            
            # Create multipart message using default CourtFlow sender
            msg = MIMEMultipart('mixed')
            msg['Subject'] = subject
            msg['From'] = f'"CourtFlow" <{self.sender}>'  # Always use CourtFlow for invitations
            msg['To'] = invitation.email
            
            # Add custom headers to improve deliverability
            msg.add_header('X-Auto-Response-Suppress', 'OOF')
            msg.add_header('X-Invitation-Type', 'Coach-Invitation')
            msg.add_header('X-Priority', '1')
            
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
            
            # Send the raw email using default sender
            raw_email = msg.as_string()
            response = self.ses_client.send_raw_email(
                Source=f'"CourtFlow" <{self.sender}>',
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
        """Send a generic email with HTML and plain text content using default CourtFlow sender"""
        try:
            # If no plain text content is provided, create it from HTML
            if not text_content:
                text_content = html_content.replace('<br>', '\n').replace('<br/>', '\n')
                for tag in ['<p>', '</p>', '<div>', '</div>', '<html>', '</html>', '<body>', '</body>', '<h2>', '</h2>', '<a href="', '">', '</a>']:
                    text_content = text_content.replace(tag, '')
            
            # Always use default CourtFlow sender for generic emails
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
            
            # Send the raw email using default sender
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
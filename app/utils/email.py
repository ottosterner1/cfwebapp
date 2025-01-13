# In app/utils/email.py

import boto3
from botocore.exceptions import ClientError
from flask import current_app, url_for

def get_ses_client():
    return boto3.client('ses',
        region_name=current_app.config['AWS_SES_REGION'],
        aws_access_key_id=current_app.config['AWS_SES_ACCESS_KEY'],
        aws_secret_access_key=current_app.config['AWS_SES_SECRET_KEY']
    )

def send_coach_invitation(invitation, club_name):
    try:
        ses_client = get_ses_client()
        
        # Generate the invitation URL
        invite_url = url_for('club_management.accept_invitation',
                           token=invitation.token,
                           _external=True)
        
        # Email content
        subject = f'Invitation to join {club_name} on Tennis Coach App'
        body_html = f"""
        <html>
            <body>
                <h2>Welcome to Tennis Coach App!</h2>
                <p>You have been invited to join {club_name} as a coach.</p>
                <p>Click the link below to accept the invitation and set up your account:</p>
                <p><a href="{invite_url}">Accept Invitation</a></p>
                <p>This invitation will expire in 48 hours.</p>
                <p>If you did not expect this invitation, please ignore this email.</p>
            </body>
        </html>
        """
        
        body_text = f"""
        Welcome to Tennis Coach App!
        
        You have been invited to join {club_name} as a coach.
        
        Click the link below to accept the invitation and set up your account:
        {invite_url}
        
        This invitation will expire in 48 hours.
        
        If you did not expect this invitation, please ignore this email.
        """
        
        response = ses_client.send_email(
            Source=current_app.config['AWS_SES_SENDER'],
            Destination={
                'ToAddresses': [invitation.email]
            },
            Message={
                'Subject': {
                    'Data': subject
                },
                'Body': {
                    'Text': {
                        'Data': body_text
                    },
                    'Html': {
                        'Data': body_html
                    }
                }
            }
        )
        
        return True, response['MessageId']
        
    except ClientError as e:
        print(f"Error sending email: {e.response['Error']['Message']}")
        return False, str(e)
from flask import Blueprint, make_response, render_template, request, redirect, url_for, flash, session, current_app
from flask_login import login_required, login_user, logout_user
from app.models import User, UserRole, CoachInvitation
from app import db
from app.auth import oauth
import secrets
from base64 import b64encode
import requests
import traceback
from datetime import datetime, timezone

auth_routes = Blueprint('auth', __name__)

@auth_routes.route('/signup')
def signup():
    try:
        # Generate secure tokens for both state and nonce
        state = secrets.token_urlsafe(32)
        nonce = secrets.token_urlsafe(32)
        
        # Store both in session
        session['oauth_state'] = state
        session['oauth_nonce'] = nonce
        
        redirect_uri = url_for('auth.auth_callback', _external=True)
        
        authorize_params = {
            'redirect_uri': redirect_uri,
            'response_type': 'code',
            'state': state,
            'nonce': nonce,
            'scope': 'openid email profile',
            # Add any additional parameters needed for signup vs login
            'identity_provider': 'Google',
        }
        
        # Redirect to Cognito signup endpoint
        return oauth.cognito.authorize_redirect(**authorize_params)
        
    except Exception as e:
        current_app.logger.error(f"Signup error: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return f"Signup error: {str(e)}", 500

@auth_routes.route('/login')
def login():
    state = secrets.token_urlsafe(32)
    
    # Store state in session instead of cookie
    session['oauth_state'] = state
    
    redirect_uri = url_for('auth.auth_callback', _external=True, _scheme='https')
    
    # Create and return response without setting cookie
    return redirect(
        f"https://{current_app.config['COGNITO_DOMAIN']}/login"
        f"?client_id={current_app.config['AWS_COGNITO_CLIENT_ID']}"
        f"&response_type=code&scope=openid+email+profile"
        f"&redirect_uri={redirect_uri}"
        f"&state={state}"
    )

@auth_routes.route('/auth/callback')
def auth_callback():
    try:
        state_in_request = request.args.get('state')
        state_in_session = session.get('oauth_state')
        code = request.args.get('code')
        
        if not state_in_session or state_in_session != state_in_request:
            current_app.logger.error(f"State mismatch: session={state_in_session}, request={state_in_request}")
            session.clear()  # Clear the session on mismatch
            return redirect(url_for('auth.login'))

        if not code:
            current_app.logger.error("No authorization code received")
            return redirect(url_for('auth.login'))

        # Create basic auth header
        client_id = current_app.config['AWS_COGNITO_CLIENT_ID']
        client_secret = current_app.config['AWS_COGNITO_CLIENT_SECRET']
        auth_string = f"{client_id}:{client_secret}"
        auth_bytes = auth_string.encode('utf-8')
        auth_header = b64encode(auth_bytes).decode('utf-8')

        # Exchange the code for tokens
        token_endpoint = f"https://{current_app.config['COGNITO_DOMAIN']}/oauth2/token"
        redirect_uri = url_for('auth.auth_callback', _external=True, _scheme='https')
        
        token_response = requests.post(
            token_endpoint,
            headers={
                'Authorization': f'Basic {auth_header}',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data={
                'grant_type': 'authorization_code',
                'code': code,
                'redirect_uri': redirect_uri
            }
        )
        
        if token_response.status_code != 200:
            current_app.logger.error(f"Token exchange failed: {token_response.text}")
            return redirect(url_for('auth.login'))

        token_data = token_response.json()

        # Get user info using the access token
        userinfo_endpoint = f"https://{current_app.config['COGNITO_DOMAIN']}/oauth2/userInfo"
        userinfo_response = requests.get(
            userinfo_endpoint,
            headers={'Authorization': f"Bearer {token_data['access_token']}"}
        )
        
        if userinfo_response.status_code != 200:
            current_app.logger.error(f"Userinfo failed: {userinfo_response.text}")
            return redirect(url_for('auth.login'))

        userinfo = userinfo_response.json()
        email = userinfo.get('email')
        name = userinfo.get('name')
        provider_id = userinfo.get('sub')

        if not email:
            current_app.logger.error("No email provided in user info")
            return redirect(url_for('auth.login'))

        user = User.query.filter_by(email=email).first()
        
        # Check for pending coach invitation
        pending_invitation = session.get('pending_invitation')
        if pending_invitation:
            # Process coach invitation
            invitation_token = pending_invitation.get('token')
            tennis_club_id = pending_invitation.get('tennis_club_id')
            invitation_email = pending_invitation.get('email')
            
            # Verify the invitation is valid and matches the authenticated email
            if email.lower() == invitation_email.lower():
                invitation = CoachInvitation.query.filter_by(
                    token=invitation_token, 
                    used=False,
                    tennis_club_id=tennis_club_id,
                    email=invitation_email
                ).first()
                
                if invitation and not invitation.is_expired:
                    # If user doesn't exist yet, create them
                    if not user:
                        # Generate a unique username
                        base_username = f"coach_{email.split('@')[0]}"
                        username = base_username
                        counter = 1
                        
                        # Keep checking until we find a unique username
                        while User.query.filter_by(username=username).first():
                            username = f"{base_username}_{counter}"
                            counter += 1
                        
                        user = User(
                            email=email,
                            username=username,
                            name=name,
                            role=UserRole.COACH,
                            auth_provider='cognito',
                            auth_provider_id=provider_id,
                            is_active=True,
                            tennis_club_id=tennis_club_id
                        )
                        db.session.add(user)
                    else:
                        # Update existing user with tennis club info
                        user.tennis_club_id = tennis_club_id
                        user.auth_provider = 'cognito'
                        user.auth_provider_id = provider_id
                    
                    # Mark invitation as used
                    invitation.used = True
                    db.session.commit()
                    
                    # Login the user
                    login_user(user, remember=True)
                    
                    # Clear the pending invitation
                    session.pop('pending_invitation', None)
                    session.pop('oauth_state', None)
                    
                    flash('You have successfully joined the tennis club!', 'success')
                    return redirect(url_for('main.home'))
                else:
                    # Invalid or expired invitation
                    session.pop('pending_invitation', None)
                    flash('Invalid or expired invitation', 'error')
                    return redirect(url_for('auth.login'))
            else:
                # Email mismatch
                current_app.logger.warning(f"Email mismatch: invitation for {invitation_email}, but logged in as {email}")
                session.pop('pending_invitation', None)
                flash('The email you logged in with does not match the invitation', 'error')
                return redirect(url_for('auth.login'))
        
        # Check for club invitation (new section)
        club_invitation = session.get('club_invitation')
        if club_invitation:
            # Process club invitation
            invitation_token = club_invitation.get('token')
            invitation_email = club_invitation.get('email')
            
            # Verify the invitation email matches the authenticated email
            if email.lower() == invitation_email.lower():
                from app.models import ClubInvitation
                
                invitation = ClubInvitation.query.filter_by(
                    token=invitation_token,
                    used=False,
                    email=invitation_email
                ).first()
                
                if invitation and not invitation.is_expired:
                    # Store user info in session for club onboarding
                    session['temp_user_info'] = {
                        'email': email,
                        'name': name,
                        'provider_id': provider_id
                    }
                    
                    # Clear the club invitation from session but keep temp_user_info
                    session.pop('club_invitation', None)
                    session.pop('oauth_state', None)
                    
                    # Redirect to club onboarding
                    return redirect(url_for('club_management.onboard_club'))
                else:
                    # Invalid or expired invitation
                    session.pop('club_invitation', None)
                    flash('Invalid or expired club invitation', 'error')
                    return redirect(url_for('auth.login'))
            else:
                # Email mismatch
                current_app.logger.warning(f"Email mismatch: club invitation for {invitation_email}, but logged in as {email}")
                session.pop('club_invitation', None)
                flash('The email you logged in with does not match the invitation', 'error')
                return redirect(url_for('auth.login'))

        # Normal flow for existing users
        if user and user.tennis_club_id:
            login_user(user, remember=True)
            response = redirect(url_for('main.home'))
            
            # Set session data
            session.permanent = True
            session['user_id'] = user.id
            session.modified = True  # Ensure session is saved
            
            # Clean up oauth state
            session.pop('oauth_state', None)
            
            # Set response headers
            response.headers.update({
                'Access-Control-Allow-Credentials': 'true',
                'Access-Control-Allow-Origin': request.headers.get('Origin', 'https://cfwebapp.local'),
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie, X-Requested-With',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            })
            
            return response
        else:
            # User is not associated with any tennis club and doesn't have a pending invitation
            # Check if there's an unused invitation for this email
            current_time = datetime.now(timezone.utc)
            invitation = CoachInvitation.query.filter_by(
                email=email.lower(),
                used=False
            ).filter(CoachInvitation.expires_at > current_time).first()
            
            if invitation:
                # Store invitation in session and process it directly
                invitation.used = True
                
                if not user:
                    # Create new user
                    base_username = f"coach_{email.split('@')[0]}"
                    username = base_username
                    counter = 1
                    
                    while User.query.filter_by(username=username).first():
                        username = f"{base_username}_{counter}"
                        counter += 1
                    
                    user = User(
                        email=email,
                        username=username,
                        name=name,
                        role=UserRole.COACH,
                        auth_provider='cognito',
                        auth_provider_id=provider_id,
                        is_active=True,
                        tennis_club_id=invitation.tennis_club_id
                    )
                    db.session.add(user)
                else:
                    # Update existing user 
                    user.tennis_club_id = invitation.tennis_club_id
                    user.auth_provider = 'cognito'
                    user.auth_provider_id = provider_id
                
                db.session.commit()
                
                # Login the user
                login_user(user, remember=True)
                flash('You have successfully joined the tennis club!', 'success')
                return redirect(url_for('main.home'))
            else:
                # No valid invitation found - redirect to login with error
                flash('You need an invitation to access this application', 'error')
                return redirect(url_for('auth.login'))  # Send back to login page

    except requests.exceptions.RequestException as e:
        current_app.logger.error(f"Network error during authentication: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return redirect(url_for('auth.login'))
    except Exception as e:
        current_app.logger.error(f"Auth callback error: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        
        error_context = {
            'token_response_status': getattr(token_response, 'status_code', None) if 'token_response' in locals() else None,
            'token_response_text': getattr(token_response, 'text', None) if 'token_response' in locals() else None,
            'userinfo_response_status': getattr(userinfo_response, 'status_code', None) if 'userinfo_response' in locals() else None,
            'userinfo_response_text': getattr(userinfo_response, 'text', None) if 'userinfo_response' in locals() else None
        }
        current_app.logger.error(f"Error context: {error_context}")
        
        flash('Authentication failed')
        return redirect(url_for('auth.login'))

@auth_routes.route('/logout')
@login_required
def logout():
    # Clear Flask-Login session
    logout_user()
    
    # Clear all session data
    session.clear()
    
    # Build the Cognito logout URL
    cognito_domain = current_app.config['COGNITO_DOMAIN']
    client_id = current_app.config['AWS_COGNITO_CLIENT_ID']
    logout_uri = url_for('main.index', _external=True)
    
    # Create response
    response = make_response(redirect(
        f"https://{cognito_domain}/logout?"
        f"client_id={client_id}&"
        f"logout_uri={logout_uri}"
    ))
    
    # Clear all cookies
    response.delete_cookie('oauth_state')
    response.delete_cookie('session')
    response.delete_cookie('remember_token')
    
    return response
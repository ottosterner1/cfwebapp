from flask import current_app, redirect, url_for, request
from urllib.parse import urlparse

def init_subdomain_handler(app):
    """Initialize subdomain handling for the application"""
    app.config.update(
        SERVER_NAME='cfwebapp.local:5000' if app.debug else 'courtflow.co.uk',
        PREFERRED_URL_SCHEME='https'
    )

def get_subdomain():
    """Extract subdomain from request"""
    host = request.host.split(':')[0]
    parts = host.split('.')
    
    # Handle development environment
    if 'cfwebapp.local' in host:
        return parts[0] if len(parts) > 2 else None
    
    # Production environment
    if 'courtflow.co.uk' in host:
        return parts[0] if len(parts) > 2 else None
        
    return None

def redirect_to_subdomain(subdomain, endpoint='main.index', **kwargs):
    """Generate a subdomain redirect"""
    if current_app.debug:
        # Development - use cfwebapp.local
        kwargs['_external'] = True
        kwargs['_scheme'] = 'https'
        target = url_for(endpoint, **kwargs)
        url_parts = list(urlparse(target))
        url_parts[1] = f"{subdomain}.cfwebapp.local:5000"
        return redirect(''.join(str(x) for x in url_parts))
    else:
        # Production - use courtflow.co.uk
        kwargs['_external'] = True
        kwargs['_scheme'] = 'https'
        target = url_for(endpoint, **kwargs)
        url_parts = list(urlparse(target))
        url_parts[1] = f"{subdomain}.courtflow.co.uk"
        return redirect(''.join(str(x) for x in url_parts))
# app/services/__init__.py

from app.services.email_service import EmailService

# This allows you to import EmailService directly from app.services
__all__ = ['EmailService']
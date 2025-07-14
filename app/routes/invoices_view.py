from flask import Blueprint, render_template
from flask_login import login_required, current_user
from app.utils.auth import admin_required
from app.clubs.middleware import verify_club_access

invoice_views = Blueprint('invoice_views', __name__, url_prefix='/invoices')

@invoice_views.route('/')
@login_required
@verify_club_access()
def invoice_list():
    """Render the invoice list page"""
    return render_template('pages/invoices.html')

@invoice_views.route('/admin')
@login_required
@admin_required
@verify_club_access()
def admin_invoices():
    """Render the admin invoice approval page"""
    return render_template('pages/invoices.html')

@invoice_views.route('/coach')
@login_required
@verify_club_access()
def coach_invoices():
    """Render the coach invoices page"""
    return render_template('pages/invoices.html')
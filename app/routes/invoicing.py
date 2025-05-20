from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from app.models import Invoice, InvoiceLineItem, CoachingRate, Register, User, UserRole
from app.models.invoice import InvoiceStatus
from app.utils.auth import admin_required
from app import db
from datetime import datetime, timedelta, timezone
from sqlalchemy import extract, func
from app.services.email_service import EmailService
import calendar
import uuid
import math

invoice_routes = Blueprint('invoices', __name__, url_prefix='/api/invoices')

# Helper to generate invoice number
def generate_invoice_number(coach, month, year):
    """Generate a unique invoice number"""
    coach_initials = ''.join([n[0] for n in coach.name.split() if n]).upper()
    timestamp = datetime.now().strftime('%Y%m%d%H%M')
    unique_id = str(uuid.uuid4())[:8]
    return f"INV-{coach_initials}-{year}{month:02d}-{unique_id}"

@invoice_routes.route('/rates', methods=['GET', 'POST'])
@login_required
def manage_rates():
    """Get or set coach rates"""
    if request.method == 'GET':
        # Get rates for current coach
        rates = CoachingRate.query.filter_by(
            coach_id=current_user.id,
            tennis_club_id=current_user.tennis_club_id
        ).all()
        
        return jsonify([{
            'id': rate.id,
            'rate_name': rate.rate_name,
            'hourly_rate': rate.hourly_rate
        } for rate in rates])
    
    elif request.method == 'POST':
        # Set or update rate
        data = request.json
        rate_name = data.get('rate_name')
        hourly_rate = data.get('hourly_rate')
        
        if not rate_name or not hourly_rate:
            return jsonify({'error': 'Rate name and hourly rate are required'}), 400
        
        # Find existing rate or create new one
        rate = CoachingRate.query.filter_by(
            coach_id=current_user.id,
            tennis_club_id=current_user.tennis_club_id,
            rate_name=rate_name
        ).first()
        
        if not rate:
            rate = CoachingRate(
                coach_id=current_user.id,
                tennis_club_id=current_user.tennis_club_id,
                rate_name=rate_name,
                hourly_rate=float(hourly_rate)
            )
            db.session.add(rate)
        else:
            rate.hourly_rate = float(hourly_rate)
        
        db.session.commit()
        return jsonify({'id': rate.id, 'rate_name': rate.rate_name, 'hourly_rate': rate.hourly_rate})

@invoice_routes.route('/generate/<int:year>/<int:month>', methods=['POST'])
@login_required
def generate_invoice(year, month):
    """Generate or retrieve an invoice for specified month"""
    # Check if invoice already exists
    existing_invoice = Invoice.query.filter_by(
        coach_id=current_user.id,
        tennis_club_id=current_user.tennis_club_id,
        year=year,
        month=month
    ).first()
    
    if existing_invoice:
        # Return existing invoice data
        return jsonify({
            'invoice_id': existing_invoice.id,
            'status': existing_invoice.status.value,
            'message': 'Invoice already exists for this period'
        })
    
    # Create new invoice
    invoice = Invoice(
        coach_id=current_user.id,
        tennis_club_id=current_user.tennis_club_id,
        year=year,
        month=month,
        status=InvoiceStatus.DRAFT,
        invoice_number=generate_invoice_number(current_user, month, year)
    )
    db.session.add(invoice)
    db.session.flush()  # Get invoice ID
    
    # Get date range for the month
    last_day = calendar.monthrange(year, month)[1]
    start_date = datetime(year, month, 1).date()
    end_date = datetime(year, month, last_day).date()
    
    # Find all registers for this coach in this date range
    registers = Register.query.filter(
        Register.coach_id == current_user.id,
        Register.tennis_club_id == current_user.tennis_club_id,
        Register.date >= start_date,
        Register.date <= end_date
    ).all()
    
    # Create line items from registers
    for register in registers:
        # Calculate duration in hours
        group_time = register.group_time
        if not group_time:
            continue
            
        start_time = group_time.start_time
        end_time = group_time.end_time
        
        # Calculate hours
        start_datetime = datetime.combine(register.date, start_time)
        end_datetime = datetime.combine(register.date, end_time)
        duration_in_minutes = (end_datetime - start_datetime).total_seconds() / 60  # minutes
        
        # Round up to a full hour if greater than 45 minutes
        if duration_in_minutes > 45:
            # Round up to nearest hour
            duration_in_hours = math.ceil(duration_in_minutes / 60)
        else:
            # Keep the exact duration in hours
            duration_in_hours = duration_in_minutes / 60
        
        # Try to find a specific coaching rate for this group
        group_name = group_time.tennis_group.name if group_time.tennis_group else "Unknown Group"
        coaching_rate = CoachingRate.query.filter_by(
            coach_id=current_user.id,
            tennis_club_id=current_user.tennis_club_id,
            rate_name=group_name  # Look for rate matching the group name
        ).first()
        
        # If no rate for this specific group, try the generic 'Group Coaching' rate
        if not coaching_rate:
            coaching_rate = CoachingRate.query.filter_by(
                coach_id=current_user.id,
                tennis_club_id=current_user.tennis_club_id,
                rate_name='Group Coaching'
            ).first()
        
        # Set rate and amount values
        if coaching_rate:
            rate_value = coaching_rate.hourly_rate
            amount_value = duration_in_hours * rate_value
            notes = "Auto-generated from register"
        else:
            # Include entry with zero rate for manual input later
            rate_value = 0.0
            amount_value = 0.0
            notes = "Rate needs to be set manually"
            
            # Log a warning for admin awareness
            current_app.logger.warning(
                f"No coaching rate found for coach {current_user.id} and group {group_name}. "
                f"Creating line item with zero rate for register {register.id}."
            )
        
        # Create line item
        line_item = InvoiceLineItem(
            invoice_id=invoice.id,
            register_id=register.id,
            item_type='session',
            is_deduction=False,
            description=f"{group_name} - {group_time.day_of_week.value}",
            date=register.date,
            hours=duration_in_hours,
            rate=rate_value,
            amount=amount_value,
            notes=notes
        )
        db.session.add(line_item)
    
    # Get assistant coaches from registers
    assistant_coach_registers = {}
    for register in registers:
        for assistant in register.assistant_coaches:
            if assistant.coach_id not in assistant_coach_registers:
                assistant_coach_registers[assistant.coach_id] = []
            assistant_coach_registers[assistant.coach_id].append(register)
    
    # Calculate totals
    invoice.calculate_totals()
    db.session.commit()
    
    return jsonify({
        'invoice_id': invoice.id,
        'status': invoice.status.value,
        'message': 'Invoice generated successfully'
    })

@invoice_routes.route('/<int:invoice_id>', methods=['GET', 'PUT'])
@login_required
def manage_invoice(invoice_id):
    """Get or update invoice details"""
    invoice = Invoice.query.get_or_404(invoice_id)
    
    # Verify ownership or admin status
    if invoice.coach_id != current_user.id and not current_user.is_admin:
        return jsonify({'error': 'Unauthorized access'}), 403
    
    if request.method == 'GET':
        # Return invoice with line items
        line_items = [{
            'id': item.id,
            'item_type': item.item_type,
            'is_deduction': item.is_deduction,
            'description': item.description,
            'date': item.date.strftime('%Y-%m-%d'),
            'hours': item.hours,
            'rate': item.rate,
            'amount': item.amount,
            'notes': item.notes,
            'register_id': item.register_id
        } for item in invoice.line_items]
        
        return jsonify({
            'id': invoice.id,
            'invoice_number': invoice.invoice_number,
            'month': invoice.month,
            'year': invoice.year,
            'status': invoice.status.value,
            'subtotal': invoice.subtotal,
            'deductions': invoice.deductions,
            'total': invoice.total,
            'notes': invoice.notes,
            'created_at': invoice.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            'submitted_at': invoice.submitted_at.strftime('%Y-%m-%d %H:%M:%S') if invoice.submitted_at else None,
            'approved_at': invoice.approved_at.strftime('%Y-%m-%d %H:%M:%S') if invoice.approved_at else None,
            'paid_at': invoice.paid_at.strftime('%Y-%m-%d %H:%M:%S') if invoice.paid_at else None,
            'line_items': line_items
        })
    
    elif request.method == 'PUT':
        # Update invoice data
        data = request.json
        
        # Don't allow non-admins to update approved invoices
        if invoice.status == InvoiceStatus.APPROVED and not current_user.is_admin:
            return jsonify({'error': 'Cannot modify an approved invoice. Admin privileges required.'}), 400
        
        # Don't allow anyone to update paid invoices
        if invoice.status == InvoiceStatus.PAID:
            return jsonify({'error': 'Cannot modify a paid invoice.'}), 400
        
        # Update fields if provided
        if 'notes' in data:
            invoice.notes = data['notes']
        
        # Handle line items updates
        if 'line_items' in data:
            # Clear existing line items if requested
            if data.get('clear_items', False):
                for item in invoice.line_items:
                    db.session.delete(item)
            
            # Add new line items
            for item_data in data['line_items']:
                if 'id' in item_data and item_data['id']:
                    # Update existing line item
                    line_item = InvoiceLineItem.query.get(item_data['id'])
                    if line_item and line_item.invoice_id == invoice.id:
                        line_item.description = item_data['description']
                        line_item.date = datetime.strptime(item_data['date'], '%Y-%m-%d').date()
                        line_item.hours = float(item_data['hours'])
                        line_item.rate = float(item_data['rate'])
                        line_item.amount = float(item_data['hours']) * float(item_data['rate'])
                        line_item.is_deduction = bool(item_data.get('is_deduction', False))
                        line_item.notes = item_data.get('notes')
                else:
                    # Create new line item
                    line_item = InvoiceLineItem(
                        invoice_id=invoice.id,
                        register_id=item_data.get('register_id'),
                        item_type=item_data['item_type'],
                        is_deduction=bool(item_data.get('is_deduction', False)),
                        description=item_data['description'],
                        date=datetime.strptime(item_data['date'], '%Y-%m-%d').date(),
                        hours=float(item_data['hours']),
                        rate=float(item_data['rate']),
                        amount=float(item_data['hours']) * float(item_data['rate']),
                        notes=item_data.get('notes')
                    )
                    db.session.add(line_item)
        
        # Recalculate totals
        invoice.calculate_totals()
        db.session.commit()
        
        return jsonify({
            'id': invoice.id,
            'status': invoice.status.value,
            'subtotal': invoice.subtotal,
            'deductions': invoice.deductions,
            'total': invoice.total,
            'message': 'Invoice updated successfully'
        })

@invoice_routes.route('/<int:invoice_id>/submit', methods=['POST'])
@login_required
def submit_invoice(invoice_id):
    """Submit invoice for approval"""
    invoice = Invoice.query.get_or_404(invoice_id)
    
    # Verify ownership
    if invoice.coach_id != current_user.id:
        return jsonify({'error': 'Unauthorized access'}), 403
    
    # Allow submitting only if in draft or rejected status
    if invoice.status not in [InvoiceStatus.DRAFT, InvoiceStatus.REJECTED]:
        return jsonify({'error': f'Invoice cannot be submitted. Current status: {invoice.status.value}'}), 400
    
    # Track if this is a resubmission
    is_resubmission = invoice.status == InvoiceStatus.REJECTED
    
    # Update status
    invoice.status = InvoiceStatus.SUBMITTED
    invoice.submitted_at = datetime.now(timezone.utc)
    db.session.commit()
    
    # # Notify admin
    # admin_users = User.query.filter_by(
    #     tennis_club_id=current_user.tennis_club_id,
    #     role=UserRole.ADMIN
    # ).all()
    
    # email_service = EmailService()
    # for admin in admin_users:
    #     # Send email notification
    #     email_subject = f"{'Resubmitted' if is_resubmission else 'New'} Invoice - {current_user.name} - {invoice.month}/{invoice.year}"
    #     email_body = f"""
    #     <p>Hello {admin.name},</p>
    #     <p>{current_user.name} has {'resubmitted' if is_resubmission else 'submitted'} an invoice for {calendar.month_name[invoice.month]} {invoice.year}.</p>
    #     <p>Invoice #: {invoice.invoice_number}</p>
    #     <p>Total amount: £{invoice.total:.2f}</p>
    #     <p>Please log in to the system to review and approve this invoice.</p>
    #     """
        
    #     # Use your existing email service
    #     email_service.send_generic_email(
    #         recipient_email=admin.email,
    #         subject=email_subject,
    #         html_content=email_body,
    #         sender_name="CourtFlow Invoicing"
    #     )
    
    return jsonify({
        'status': invoice.status.value,
        'message': 'Invoice resubmitted successfully' if is_resubmission else 'Invoice submitted successfully'
    })

@invoice_routes.route('/<int:invoice_id>/approve', methods=['POST'])
@login_required
@admin_required
def approve_invoice(invoice_id):
    """Approve submitted invoice"""
    invoice = Invoice.query.get_or_404(invoice_id)
    
    # Verify club
    if invoice.tennis_club_id != current_user.tennis_club_id:
        return jsonify({'error': 'Unauthorized access'}), 403
    
    # Check that invoice is submitted
    if invoice.status != InvoiceStatus.SUBMITTED:
        return jsonify({'error': f'Invoice must be submitted first (current status: {invoice.status.value})'}), 400
    
    # Update status
    invoice.status = InvoiceStatus.APPROVED
    invoice.approved_at = datetime.now(timezone.utc)
    invoice.approved_by_id = current_user.id
    db.session.commit()
    
    # Notify coach
    coach = User.query.get(invoice.coach_id)
    email_service = EmailService()
    
    email_subject = f"Invoice Approved - {calendar.month_name[invoice.month]} {invoice.year}"
    email_body = f"""
    <p>Hello {coach.name},</p>
    <p>Your invoice for {calendar.month_name[invoice.month]} {invoice.year} has been approved.</p>
    <p>Invoice #: {invoice.invoice_number}</p>
    <p>Total amount: £{invoice.total:.2f}</p>
    <p>Payment will be processed according to the club's payment schedule.</p>
    <p>Thank you.</p>
    """
    
    email_service.send_generic_email(
        recipient_email=coach.email,
        subject=email_subject,
        html_content=email_body,
        sender_name="CourtFlow Invoicing"
    )
    
    return jsonify({
        'status': invoice.status.value,
        'message': 'Invoice approved successfully'
    })

@invoice_routes.route('/<int:invoice_id>/reject', methods=['POST'])
@login_required
@admin_required
def reject_invoice(invoice_id):
    """Reject submitted invoice"""
    invoice = Invoice.query.get_or_404(invoice_id)
    data = request.json
    rejection_reason = data.get('reason', 'No reason provided')
    
    # Verify club
    if invoice.tennis_club_id != current_user.tennis_club_id:
        return jsonify({'error': 'Unauthorized access'}), 403
    
    # Check that invoice is submitted
    if invoice.status != InvoiceStatus.SUBMITTED:
        return jsonify({'error': f'Invoice must be submitted first (current status: {invoice.status.value})'}), 400
    
    # Update status
    invoice.status = InvoiceStatus.REJECTED
    db.session.commit()
    
    # Notify coach
    coach = User.query.get(invoice.coach_id)
    email_service = EmailService()
    
    email_subject = f"Invoice Rejected - {calendar.month_name[invoice.month]} {invoice.year}"
    email_body = f"""
    <p>Hello {coach.name},</p>
    <p>Your invoice for {calendar.month_name[invoice.month]} {invoice.year} has been rejected.</p>
    <p>Invoice #: {invoice.invoice_number}</p>
    <p>Reason: {rejection_reason}</p>
    <p>Please review and resubmit your invoice.</p>
    """
    
    email_service.send_generic_email(
        recipient_email=coach.email,
        subject=email_subject,
        html_content=email_body,
        sender_name="CourtFlow Invoicing"
    )
    
    return jsonify({
        'status': invoice.status.value,
        'message': 'Invoice rejected successfully'
    })

@invoice_routes.route('/<int:invoice_id>/mark_paid', methods=['POST'])
@login_required
@admin_required
def mark_invoice_paid(invoice_id):
    """Mark an approved invoice as paid"""
    invoice = Invoice.query.get_or_404(invoice_id)
    
    # Verify club
    if invoice.tennis_club_id != current_user.tennis_club_id:
        return jsonify({'error': 'Unauthorized access'}), 403
    
    # Check that invoice is approved
    if invoice.status != InvoiceStatus.APPROVED:
        return jsonify({'error': f'Invoice must be approved before marking as paid (current status: {invoice.status.value})'}), 400
    
    # Update status
    invoice.status = InvoiceStatus.PAID
    invoice.paid_at = datetime.now(timezone.utc)
    invoice.paid_by_id = current_user.id
    db.session.commit()
    
    # Notify coach
    coach = User.query.get(invoice.coach_id)
    email_service = EmailService()
    
    # Format dates and time for email
    payment_date = invoice.paid_at.strftime('%d %B %Y')
    
    email_subject = f"Payment Processed - Invoice #{invoice.invoice_number}"
    email_body = f"""
    <p>Hello {coach.name},</p>
    <p>Your invoice for {calendar.month_name[invoice.month]} {invoice.year} has been paid.</p>
    <p>Invoice #: {invoice.invoice_number}</p>
    <p>Amount: £{invoice.total:.2f}</p>
    <p>Payment date: {payment_date}</p>
    <p>Thank you.</p>
    """
    
    email_service.send_generic_email(
        recipient_email=coach.email,
        subject=email_subject,
        html_content=email_body,
        sender_name="CourtFlow Invoicing"
    )
    
    return jsonify({
        'status': invoice.status.value,
        'message': 'Invoice marked as paid successfully'
    })

@invoice_routes.route('/list', methods=['GET'])
@login_required
def list_invoices():
    """List invoices for the current user"""
    # Default to current year if not specified
    year = request.args.get('year', datetime.now().year, type=int)
    
    # Filter by coach_id if admin and specified
    coach_id = None
    if current_user.is_admin and 'coach_id' in request.args:
        coach_id = request.args.get('coach_id', type=int)
    
    query = Invoice.query.filter_by(tennis_club_id=current_user.tennis_club_id)
    
    if year:
        query = query.filter_by(year=year)
    
    if coach_id and current_user.is_admin:
        query = query.filter_by(coach_id=coach_id)
    elif not current_user.is_admin:
        query = query.filter_by(coach_id=current_user.id)
    
    invoices = query.order_by(Invoice.year.desc(), Invoice.month.desc()).all()
    
    result = [{
        'id': invoice.id,
        'invoice_number': invoice.invoice_number,
        'coach_name': invoice.coach.name,
        'month': invoice.month,
        'month_name': calendar.month_name[invoice.month],
        'year': invoice.year,
        'status': invoice.status.value,
        'total': invoice.total,
        'created_at': invoice.created_at.strftime('%Y-%m-%d'),
        'submitted_at': invoice.submitted_at.strftime('%Y-%m-%d') if invoice.submitted_at else None,
        'paid_at': invoice.paid_at.strftime('%Y-%m-%d') if invoice.paid_at else None
    } for invoice in invoices]
    
    return jsonify(result)

@invoice_routes.route('/export/<int:invoice_id>', methods=['GET'])
@login_required
def export_invoice(invoice_id):
    """Export invoice as JSON for frontend to generate PDF/Excel"""
    invoice = Invoice.query.get_or_404(invoice_id)
    
    # Verify ownership or admin status
    if invoice.coach_id != current_user.id and not current_user.is_admin:
        return jsonify({'error': 'Unauthorized access'}), 403
    
    coach = User.query.get(invoice.coach_id)
    tennis_club = invoice.tennis_club
    
    # Format line items
    line_items = [{
        'description': item.description,
        'date': item.date.strftime('%Y-%m-%d'),
        'hours': item.hours,
        'rate': item.rate,
        'amount': item.amount,
        'is_deduction': item.is_deduction,
        'notes': item.notes,
        'register_id': item.register_id
    } for item in invoice.line_items]
    
    # Prepare export data
    export_data = {
        'invoice_number': invoice.invoice_number,
        'month': invoice.month,
        'month_name': calendar.month_name[invoice.month],
        'year': invoice.year,
        'status': invoice.status.value,
        'coach': {
            'name': coach.name,
            'email': coach.email
        },
        'tennis_club': {
            'name': tennis_club.name,
            'logo_url': tennis_club.logo_presigned_url if hasattr(tennis_club, 'logo_presigned_url') else None
        },
        'dates': {
            'created_at': invoice.created_at.strftime('%Y-%m-%d'),
            'submitted_at': invoice.submitted_at.strftime('%Y-%m-%d') if invoice.submitted_at else None,
            'approved_at': invoice.approved_at.strftime('%Y-%m-%d') if invoice.approved_at else None,
            'paid_at': invoice.paid_at.strftime('%Y-%m-%d') if invoice.paid_at else None
        },
        'financial': {
            'subtotal': invoice.subtotal,
            'deductions': invoice.deductions,
            'total': invoice.total
        },
        'line_items': line_items,
        'notes': invoice.notes
    }
    
    return jsonify(export_data)

@invoice_routes.route('/month-summaries', methods=['GET'])
@login_required
def get_month_summaries():
    """Get summaries for each month of a year, showing if invoice exists and register counts"""
    year = request.args.get('year', datetime.now().year, type=int)
    
    # Get all months and initialize response
    months = []
    for month_num in range(1, 13):
        months.append({
            'month': month_num,
            'month_name': calendar.month_name[month_num],
            'year': year,
            'total_registers': 0,
            'total_hours': 0.0,
            'has_invoice': False,
            'invoice_id': None,
            'invoice_status': None
        })
    
    # Get date range for the year
    start_date = datetime(year, 1, 1).date()
    end_date = datetime(year, 12, 31).date()
    
    # Get all registers for this coach in this year
    registers = Register.query.filter(
        Register.coach_id == current_user.id,
        Register.tennis_club_id == current_user.tennis_club_id,
        Register.date >= start_date,
        Register.date <= end_date
    ).all()
    
    # Calculate hours and count for each month
    for register in registers:
        month = register.date.month
        
        # Calculate duration in hours
        group_time = register.group_time
        if not group_time:
            continue
            
        start_time = group_time.start_time
        end_time = group_time.end_time
        
        # Calculate hours
        start_datetime = datetime.combine(register.date, start_time)
        end_datetime = datetime.combine(register.date, end_time)
        duration = (end_datetime - start_datetime).total_seconds() / 3600
        
        # Update month summary
        months[month-1]['total_registers'] += 1
        months[month-1]['total_hours'] += duration
    
    # Check which months have invoices already
    invoices = Invoice.query.filter(
        Invoice.coach_id == current_user.id,
        Invoice.tennis_club_id == current_user.tennis_club_id,
        Invoice.year == year
    ).all()
    
    for invoice in invoices:
        month_idx = invoice.month - 1
        months[month_idx]['has_invoice'] = True
        months[month_idx]['invoice_id'] = invoice.id
        months[month_idx]['invoice_status'] = invoice.status.value
    
    return jsonify(months)


@invoice_routes.route('/years-with-invoices', methods=['GET'])
@login_required
def get_years_with_invoices():
    """Get a list of years where the user has invoices plus the current year"""
    # Query unique years where invoices exist
    years_query = db.session.query(db.func.distinct(Invoice.year))\
        .filter(Invoice.coach_id == current_user.id,
                Invoice.tennis_club_id == current_user.tennis_club_id)\
        .order_by(Invoice.year.desc())\
        .all()
    
    # Extract years from query result
    years = [year[0] for year in years_query]
    
    # Always include the current year
    current_year = datetime.now().year
    if not years or current_year not in years:
        if years:
            years.insert(0, current_year)
        else:
            years = [current_year]
    
    return jsonify(years)

@invoice_routes.route('/<int:invoice_id>/delete', methods=['DELETE'])
@login_required
def delete_invoice(invoice_id):
    """Delete an invoice based on user permissions and invoice status"""
    invoice = Invoice.query.get_or_404(invoice_id)
    
    # Check if the user has permission to delete this invoice
    if invoice.coach_id != current_user.id and not current_user.is_admin:
        return jsonify({'error': 'Unauthorized access'}), 403
    
    # Check status-based permissions
    if invoice.status == InvoiceStatus.DRAFT:
        # Draft invoices can be deleted by the owner or any admin (already checked above)
        pass
    elif invoice.status in [InvoiceStatus.SUBMITTED, InvoiceStatus.APPROVED, InvoiceStatus.REJECTED]:
        # These statuses require admin privileges
        if not current_user.is_admin:
            return jsonify({'error': 'Only administrators can delete submitted, approved, or rejected invoices'}), 403
    elif invoice.status == InvoiceStatus.PAID:
        # Paid invoices require super admin privileges
        if not current_user.is_super_admin:
            return jsonify({'error': 'Only super administrators can delete paid invoices'}), 403
    
    # If we get here, the user has permission to delete the invoice
    try:
        # Delete all line items first (should be handled by cascade, but being explicit)
        for line_item in invoice.line_items:
            db.session.delete(line_item)
        
        # Delete the invoice
        db.session.delete(invoice)
        db.session.commit()
        
        return jsonify({'message': 'Invoice deleted successfully'})
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error deleting invoice: {str(e)}")
        return jsonify({'error': f'Failed to delete invoice: {str(e)}'}), 500
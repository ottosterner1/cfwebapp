from flask import Blueprint, render_template, request, jsonify, current_app
from flask_login import login_required, current_user
from werkzeug.exceptions import BadRequest
from app.extensions import db
from app.models import User, Document, TennisClub, DocumentAcknowledgment
from app.services.document_service import DocumentService
from app.utils.auth import admin_required
import traceback
from datetime import datetime

bp = Blueprint('communication', __name__, url_prefix='/communication')

# Initialize document service
document_service = DocumentService()

@bp.route('/')
@login_required
def hub():
    """Communication hub - handles all sub-views in React"""
    return render_template('communication/hub.html')

@bp.route('/api/test', methods=['GET'])
@login_required
def test_endpoint():
    """Test endpoint to verify routes are working"""
    try:
        return jsonify({
            'message': 'Communication API is working',
            'user': current_user.name,
            'club': current_user.tennis_club.name,
            'organisation': current_user.tennis_club.organisation.name if current_user.tennis_club.organisation else None
        })
    except Exception as e:
        current_app.logger.error(f"Error in test endpoint: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Document API Routes

@bp.route('/api/documents', methods=['GET'])
@login_required
def get_documents():
    """Get documents for a specific coach"""
    try:
        coach_id = request.args.get('coach_id', type=int)
        current_app.logger.info(f"Fetching documents for coach_id: {coach_id}")
        
        if not coach_id:
            return jsonify({'error': 'Coach ID is required'}), 400
        
        # Get coach and verify access
        coach = User.query.get(coach_id)
        if not coach:
            return jsonify({'error': 'Coach not found'}), 404
        
        if coach.tennis_club.organisation_id != current_user.tennis_club.organisation_id:
            return jsonify({'error': 'Coach not found or not accessible'}), 404
        
        # Get documents for this specific coach only
        documents = document_service.get_documents_for_coach(
            coach_id, 
            current_user.tennis_club.organisation_id
        )
        
        # Include acknowledgment status for current user
        result = [doc.to_dict(user_id=current_user.id) for doc in documents]
        return jsonify(result)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching documents: {str(e)}")
        return jsonify({'error': 'Failed to fetch documents'}), 500

@bp.route('/api/documents', methods=['POST'])
@login_required
def upload_document():
    """Upload document(s) to selected coaches"""
    try:
        current_app.logger.info("Starting document upload")
        
        # Check if files were uploaded
        if 'files' not in request.files:
            return jsonify({'error': 'No files uploaded'}), 400
        
        files = request.files.getlist('files')
        if not files or all(f.filename == '' for f in files):
            return jsonify({'error': 'No files selected'}), 400
        
        # Get upload parameters
        coach_ids_str = request.form.get('coach_ids', '')
        requires_acknowledgment = request.form.get('requires_acknowledgment', 'false').lower() == 'true'
        acknowledgment_deadline = request.form.get('acknowledgment_deadline')
        
        # Parse coach IDs
        if not coach_ids_str:
            return jsonify({'error': 'At least one coach must be selected'}), 400
            
        try:
            coach_ids = [int(id.strip()) for id in coach_ids_str.split(',') if id.strip()]
        except ValueError:
            return jsonify({'error': 'Invalid coach IDs format'}), 400
            
        if not coach_ids:
            return jsonify({'error': 'At least one coach must be selected'}), 400
        
        current_app.logger.info(f"Upload params: coach_ids={coach_ids}, requires_acknowledgment={requires_acknowledgment}")
        
        # Parse deadline if provided
        deadline_dt = None
        if acknowledgment_deadline:
            try:
                # Handle both ISO string and date-only formats
                if 'T' in acknowledgment_deadline:
                    deadline_dt = datetime.fromisoformat(acknowledgment_deadline.replace('Z', '+00:00'))
                else:
                    # Date only - set to end of day
                    date_part = datetime.strptime(acknowledgment_deadline, '%Y-%m-%d').date()
                    deadline_dt = datetime.combine(date_part, datetime.max.time().replace(microsecond=0))
            except ValueError:
                return jsonify({'error': 'Invalid deadline format'}), 400
        
        # Get metadata
        metadata = {
            'category': request.form.get('category', 'General'),
            'description': request.form.get('description', ''),
            'requires_acknowledgment': requires_acknowledgment,
            'acknowledgment_deadline': deadline_dt
        }
        
        # Validate category
        if metadata['category'] not in document_service.get_document_categories():
            metadata['category'] = 'General'
        
        # Verify all coaches exist and belong to the same organisation
        coaches = []
        for coach_id in coach_ids:
            coach = User.query.get(coach_id)
            if not coach:
                return jsonify({'error': f'Coach with ID {coach_id} not found'}), 404
                
            if coach.tennis_club.organisation_id != current_user.tennis_club.organisation_id:
                return jsonify({'error': f'Coach {coach.name} not accessible'}), 404
                
            coaches.append(coach)
        
        # Validate files
        for file in files:
            if file and file.filename != '':
                if not _is_allowed_file(file.filename):
                    return jsonify({'error': f'File type not allowed: {file.filename}'}), 400
                
                if not _is_valid_file_size_safe(file):
                    return jsonify({'error': f'File too large: {file.filename}'}), 400
        
        # Upload documents to all selected coaches
        uploaded_documents = []
        
        for file in files:
            if file and file.filename != '':
                # Upload to multiple coaches
                docs = document_service.upload_to_multiple_coaches(
                    file=file,
                    metadata=metadata,
                    uploaded_by_user=current_user,
                    coaches=coaches
                )
                uploaded_documents.extend(docs)
        
        coach_names = [coach.name for coach in coaches]
        success_message = f"Successfully uploaded {len(files)} document(s) to {len(coaches)} coach(es): {', '.join(coach_names)}"
        
        return jsonify({
            'message': success_message,
            'documents': [doc.to_dict() for doc in uploaded_documents],
            'count': len(uploaded_documents)
        }), 201
        
    except Exception as e:
        current_app.logger.error(f"Error uploading documents: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': f'Failed to upload documents: {str(e)}'}), 500

@bp.route('/api/documents/<int:document_id>/acknowledge', methods=['POST'])
@login_required
def acknowledge_document(document_id):
    """Mark a document as read/acknowledged by current user"""
    try:
        current_app.logger.info(f"User {current_user.id} acknowledging document {document_id}")
        
        # Get document and verify access
        document = document_service.get_document_by_id(
            document_id, 
            current_user.tennis_club.organisation_id
        )
        
        if not document:
            return jsonify({'error': 'Document not found'}), 404
        
        # Verify the document was uploaded for the current user
        if document.uploaded_for_coach_id != current_user.id:
            # Provide helpful error message for admins
            if current_user.is_admin:
                coach_name = document.uploaded_for_coach.name if document.uploaded_for_coach else "Unknown"
                return jsonify({
                    'error': f'This document was uploaded for {coach_name}. Only they can acknowledge it. If you want to acknowledge documents uploaded for yourself, make sure you select the document with your name.'
                }), 403
            else:
                return jsonify({'error': 'You can only acknowledge documents uploaded for you'}), 403
        
        # Check if document requires acknowledgment
        if not document.requires_acknowledgment:
            return jsonify({'error': 'Document does not require acknowledgment'}), 400
        
        # Check if already acknowledged
        existing_ack = DocumentAcknowledgment.query.filter_by(
            document_id=document_id,
            user_id=current_user.id
        ).first()
        
        if existing_ack:
            return jsonify({'error': 'Document already acknowledged'}), 400
        
        # Get acknowledgment data
        data = request.get_json() or {}
        signature = data.get('signature', current_user.name)
        notes = data.get('notes', '')
        
        # Create acknowledgment record
        acknowledgment = DocumentAcknowledgment(
            document_id=document_id,
            user_id=current_user.id,
            ip_address=request.remote_addr,
            user_agent=request.headers.get('User-Agent'),
            signature=signature,
            notes=notes
        )
        
        db.session.add(acknowledgment)
        db.session.commit()
        
        current_app.logger.info(f"Document {document_id} acknowledged by user {current_user.id}")
        
        return jsonify({
            'message': 'Document acknowledged successfully',
            'acknowledgment': acknowledgment.to_dict()
        })
        
    except Exception as e:
        current_app.logger.error(f"Error acknowledging document: {str(e)}")
        db.session.rollback()
        return jsonify({'error': 'Failed to acknowledge document'}), 500
        
    except Exception as e:
        current_app.logger.error(f"Error acknowledging document: {str(e)}")
        db.session.rollback()
        return jsonify({'error': 'Failed to acknowledge document'}), 500

@bp.route('/api/documents/<int:document_id>/acknowledgments', methods=['GET'])
@login_required
def get_document_acknowledgments(document_id):
    """Get all acknowledgments for a document (admin only)"""
    try:
        if not current_user.is_admin:
            return jsonify({'error': 'Admin access required'}), 403
        
        # Get document and verify access
        document = document_service.get_document_by_id(
            document_id, 
            current_user.tennis_club.organisation_id
        )
        
        if not document:
            return jsonify({'error': 'Document not found'}), 404
        
        acknowledgments = DocumentAcknowledgment.query.filter_by(
            document_id=document_id
        ).order_by(DocumentAcknowledgment.acknowledged_at.desc()).all()
        
        return jsonify({
            'acknowledgments': [ack.to_dict() for ack in acknowledgments],
            'total_count': len(acknowledgments)
        })
        
    except Exception as e:
        current_app.logger.error(f"Error getting acknowledgments: {str(e)}")
        return jsonify({'error': 'Failed to get acknowledgments'}), 500

@bp.route('/api/documents/<int:document_id>/preview', methods=['GET'])
@login_required
def preview_document(document_id):
    """Generate preview content or URL for a document"""
    try:
        current_app.logger.info(f"Generating preview for document {document_id}")
        
        # Get document and verify access
        document = document_service.get_document_by_id(
            document_id, 
            current_user.tennis_club.organisation_id
        )
        
        if not document:
            return jsonify({'error': 'Document not found'}), 404
        
        # Verify access: admins can preview any document, users can only preview their own
        if not current_user.is_admin and document.uploaded_for_coach_id != current_user.id:
            return jsonify({'error': 'You can only preview your own documents'}), 403
        
        # Log that user opened the document (for tracking purposes)
        document_service.log_preview(
            document_id=document_id,
            user_id=current_user.id,
            ip_address=request.remote_addr,
            user_agent=request.headers.get('User-Agent')
        )
        
        # Generate preview based on file type
        file_extension = document.filename.split('.')[-1].lower() if '.' in document.filename else ''
        
        if file_extension in ['jpg', 'jpeg', 'png', 'gif', 'webp']:
            preview_url = document_service.generate_preview_url(document, expires_in=3600)
            if not preview_url:
                return jsonify({'error': 'Failed to generate preview URL'}), 500
            
            return jsonify({
                'type': 'image',
                'preview_url': preview_url,
                'document': document.to_dict(user_id=current_user.id)
            })
            
        elif file_extension == 'pdf':
            preview_url = document_service.generate_preview_url(document, expires_in=3600)
            if not preview_url:
                return jsonify({'error': 'Failed to generate preview URL'}), 500
            
            return jsonify({
                'type': 'pdf',
                'preview_url': preview_url,
                'document': document.to_dict(user_id=current_user.id)
            })
            
        elif file_extension == 'csv':
            try:
                csv_content = document_service.get_file_content(document)
                if not csv_content:
                    return jsonify({'error': 'Failed to read CSV file'}), 500
                
                import csv
                import io
                
                if isinstance(csv_content, bytes):
                    csv_content = csv_content.decode('utf-8')
                
                csv_reader = csv.DictReader(io.StringIO(csv_content))
                rows = list(csv_reader)
                
                return jsonify({
                    'type': 'csv',
                    'content': rows[:500],
                    'document': document.to_dict(user_id=current_user.id)
                })
                
            except Exception as e:
                current_app.logger.error(f"Error parsing CSV: {str(e)}")
                return jsonify({'error': 'Failed to parse CSV file'}), 500
                
        elif file_extension == 'txt':
            try:
                text_content = document_service.get_file_content(document)
                if not text_content:
                    return jsonify({'error': 'Failed to read text file'}), 500
                
                if isinstance(text_content, bytes):
                    text_content = text_content.decode('utf-8')
                
                if len(text_content) > 50000:
                    text_content = text_content[:50000] + "\n\n... (Content truncated)"
                
                return jsonify({
                    'type': 'text',
                    'content': text_content,
                    'document': document.to_dict(user_id=current_user.id)
                })
                
            except Exception as e:
                current_app.logger.error(f"Error reading text file: {str(e)}")
                return jsonify({'error': 'Failed to read text file'}), 500
        
        else:
            return jsonify({'error': 'Preview not supported for this file type'}), 400
            
    except Exception as e:
        current_app.logger.error(f"Error generating preview: {str(e)}")
        return jsonify({'error': 'Failed to generate preview'}), 500

@bp.route('/api/documents/<int:document_id>/download', methods=['GET'])
@login_required
def download_document(document_id):
    """Generate download URL for a document"""
    try:
        # Get document and verify access
        document = document_service.get_document_by_id(
            document_id, 
            current_user.tennis_club.organisation_id
        )
        
        if not document:
            return jsonify({'error': 'Document not found'}), 404
        
        # Verify access: admins can download any document, users can only download their own
        if not current_user.is_admin and document.uploaded_for_coach_id != current_user.id:
            return jsonify({'error': 'You can only download your own documents'}), 403
        
        # Generate presigned URL
        download_url = document_service.generate_download_url(document)
        
        if not download_url:
            return jsonify({'error': 'Failed to generate download URL'}), 500
        
        # Log the download
        document_service.log_download(
            document_id=document_id,
            user_id=current_user.id,
            ip_address=request.remote_addr,
            user_agent=request.headers.get('User-Agent')
        )
        
        return jsonify({
            'download_url': download_url,
            'filename': document.filename
        })
        
    except Exception as e:
        current_app.logger.error(f"Error generating download URL: {str(e)}")
        return jsonify({'error': 'Failed to generate download URL'}), 500

@bp.route('/api/documents/<int:document_id>', methods=['DELETE'])
@login_required
def delete_document(document_id):
    """Delete a document"""
    try:
        # Get document and verify access
        document = document_service.get_document_by_id(
            document_id,
            current_user.tennis_club.organisation_id
        )
        
        if not document:
            return jsonify({'error': 'Document not found'}), 404
        
        # Check permissions - only admin or uploader can delete, but must be for current user's documents
        if not (current_user.is_admin or document.uploaded_by_id == current_user.id):
            return jsonify({'error': 'Permission denied'}), 403
            
        # Non-admin users can only delete their own documents
        if not current_user.is_admin and document.uploaded_for_coach_id != current_user.id:
            return jsonify({'error': 'You can only delete your own documents'}), 403
        
        # Delete document
        success = document_service.delete_document(
            document_id,
            current_user.tennis_club.organisation_id,
            current_user.id
        )
        
        if success:
            return jsonify({'message': 'Document deleted successfully'})
        else:
            return jsonify({'error': 'Failed to delete document'}), 500
            
    except Exception as e:
        current_app.logger.error(f"Error deleting document: {str(e)}")
        return jsonify({'error': 'Failed to delete document'}), 500

@bp.route('/api/documents/categories', methods=['GET'])
@login_required
def get_document_categories():
    """Get available document categories"""
    try:
        categories = document_service.get_document_categories()
        return jsonify(categories)
    except Exception as e:
        current_app.logger.error(f"Error getting categories: {str(e)}")
        return jsonify({'error': 'Failed to get categories'}), 500

@bp.route('/api/organisation/coaches', methods=['GET'])
@login_required
def get_organisation_coaches():
    """Get all coaches in the organisation"""
    try:
        coaches = User.query.join(TennisClub).filter(
            TennisClub.organisation_id == current_user.tennis_club.organisation_id,
            User.is_active == True
        ).order_by(User.name).all()
        
        coach_data = []
        for coach in coaches:
            coach_data.append({
                'id': coach.id,
                'name': coach.name,
                'email': coach.email,
                'club_name': coach.tennis_club.name,
                'role': coach.role.value if coach.role else 'coach'
            })
        
        return jsonify(coach_data)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching organisation coaches: {str(e)}")
        return jsonify({'error': 'Failed to fetch coaches'}), 500

# Helper functions
def _is_valid_file_size_safe(file):
    """Safely check if file size is within limits (10MB)"""
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB in bytes
    
    try:
        current_pos = file.tell()
        file.seek(0, 2)
        size = file.tell()
        file.seek(current_pos)
        return size <= MAX_FILE_SIZE
    except Exception as e:
        current_app.logger.error(f"Error checking file size: {str(e)}")
        return False

def _is_allowed_file(filename):
    """Check if file type is allowed"""
    ALLOWED_EXTENSIONS = {
        'pdf', 'doc', 'docx', 'xls', 'csv', 'xlsx', 'ppt', 'pptx',
        'txt', 'rtf', 'odt', 'ods', 'odp',
        'jpg', 'jpeg', 'png', 'gif', 'webp',
        'mp4', 'avi', 'mov', 'wmv', 'flv',
        'mp3', 'wav', 'aac', 'flac',
        'zip', 'rar', '7z', 'tar', 'gz'
    }
    
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS
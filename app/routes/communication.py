from flask import Blueprint, render_template, request, jsonify, current_app
from flask_login import login_required, current_user
from werkzeug.exceptions import BadRequest
from app.extensions import db
from app.models import User, Document, TennisClub
from app.services.document_service import DocumentService
from app.utils.auth import admin_required
import traceback

bp = Blueprint('communication', __name__, url_prefix='/communication')

# Initialize document service
document_service = DocumentService()

@bp.route('/')
@login_required
def hub():
    """Communication hub - handles all sub-views in React"""
    return render_template('communication/hub.html')

# Test endpoint to verify routes are working
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
    """Get documents, optionally filtered by coach"""
    try:
        coach_id = request.args.get('coach_id', type=int)
        current_app.logger.info(f"Fetching documents for coach_id: {coach_id}")
        current_app.logger.info(f"Current user: {current_user.id}, club: {current_user.tennis_club_id}")
        
        if coach_id:
            # Get documents for specific coach
            # First verify coach exists
            coach = User.query.get(coach_id)
            current_app.logger.info(f"Found coach: {coach}")
            
            if not coach:
                current_app.logger.error(f"Coach {coach_id} not found")
                return jsonify({'error': 'Coach not found'}), 404
            
            current_app.logger.info(f"Coach club org: {coach.tennis_club.organisation_id}")
            current_app.logger.info(f"Current user club org: {current_user.tennis_club.organisation_id}")
            
            # Verify coach belongs to same organisation
            if coach.tennis_club.organisation_id != current_user.tennis_club.organisation_id:
                current_app.logger.error(f"Coach not in same organisation")
                return jsonify({'error': 'Coach not found or not accessible'}), 404
            
            current_app.logger.info(f"Getting documents for coach {coach_id} in club {current_user.tennis_club_id}")
            documents = document_service.get_documents_for_coach(
                coach_id, 
                current_user.tennis_club_id
            )
            current_app.logger.info(f"Found {len(documents)} documents")
        else:
            # Get all documents for the club
            current_app.logger.info(f"Getting all documents for club {current_user.tennis_club_id}")
            documents = Document.query.filter_by(
                tennis_club_id=current_user.tennis_club_id,
                is_active=True
            ).order_by(Document.created_at.desc()).all()
        
        result = [doc.to_dict() for doc in documents]
        current_app.logger.info(f"Returning {len(result)} documents")
        return jsonify(result)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching documents: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': 'Failed to fetch documents'}), 500

@bp.route('/api/documents', methods=['POST'])
@login_required
def upload_document():
    """Upload a new document"""
    try:
        current_app.logger.info("Starting document upload")
        current_app.logger.info(f"Request files: {list(request.files.keys())}")
        current_app.logger.info(f"Request form: {dict(request.form)}")
        
        # Check if file was uploaded
        if 'file' not in request.files:
            current_app.logger.error("No file in request")
            return jsonify({'error': 'No file uploaded'}), 400
        
        file = request.files['file']
        if file.filename == '':
            current_app.logger.error("Empty filename")
            return jsonify({'error': 'No file selected'}), 400
        
        current_app.logger.info(f"File received: {file.filename}")
        current_app.logger.info(f"File content type: {file.content_type}")
        
        # Check file status
        if hasattr(file, 'closed'):
            current_app.logger.info(f"File closed status: {file.closed}")
        
        # Ensure file is at beginning
        try:
            file.seek(0)
            current_app.logger.info("Successfully reset file to beginning")
        except Exception as e:
            current_app.logger.error(f"Cannot seek file: {e}")
            return jsonify({'error': 'File handling error'}), 400
        
        # Get coach ID from form data
        coach_id = request.form.get('coach_id', type=int)
        if not coach_id:
            current_app.logger.error("No coach_id provided")
            return jsonify({'error': 'Coach ID is required'}), 400
        
        current_app.logger.info(f"Coach ID: {coach_id}")
        
        # Verify coach exists
        coach = User.query.get(coach_id)
        if not coach:
            current_app.logger.error(f"Coach {coach_id} not found")
            return jsonify({'error': 'Coach not found'}), 404
            
        current_app.logger.info(f"Found coach: {coach.name}")
        
        # Verify coach belongs to same organisation
        if coach.tennis_club.organisation_id != current_user.tennis_club.organisation_id:
            current_app.logger.error(f"Coach not in same organisation")
            return jsonify({'error': 'Coach not found or not accessible'}), 404
        
        # Validate file type - DO NOT use the file stream for this
        if not _is_allowed_file(file.filename):
            current_app.logger.error(f"File type not allowed: {file.filename}")
            return jsonify({'error': 'File type not allowed'}), 400
        
        # Validate file size with better error handling
        try:
            file.seek(0)  # Ensure we're at the beginning
            if not _is_valid_file_size_safe(file):
                current_app.logger.error(f"File too large")
                return jsonify({'error': 'File size too large (max 10MB)'}), 400
        except Exception as e:
            current_app.logger.error(f"Error validating file size: {e}")
            return jsonify({'error': 'File validation error'}), 400
        
        # Get metadata
        metadata = {
            'category': request.form.get('category', 'General'),
            'description': request.form.get('description', '')
        }
        
        current_app.logger.info(f"Metadata: {metadata}")
        
        # Validate category
        if metadata['category'] not in document_service.get_document_categories():
            metadata['category'] = 'General'
        
        # Final file position check before upload
        try:
            file.seek(0)
            current_app.logger.info("Final file reset successful")
            
            # Check if we can read from the file
            current_pos = file.tell()
            current_app.logger.info(f"File position before upload: {current_pos}")
            
            # Quick check - try to read first byte and reset
            first_byte = file.read(1)
            file.seek(0)
            current_app.logger.info(f"File is readable, first byte check passed")
            
        except Exception as e:
            current_app.logger.error(f"File is not accessible before upload: {e}")
            return jsonify({'error': 'File is not accessible'}), 400
        
        # Upload document
        current_app.logger.info("Calling document service upload")
        document = document_service.upload_document(
            file=file,
            metadata=metadata,
            uploaded_by_user=current_user,
            coach_user=coach
        )
        
        current_app.logger.info(f"Document uploaded successfully: {document.id}")
        
        return jsonify({
            'message': 'Document uploaded successfully',
            'document': document.to_dict()
        }), 201
        
    except Exception as e:
        current_app.logger.error(f"Error uploading document: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': f'Failed to upload document: {str(e)}'}), 500




@bp.route('/api/documents/<int:document_id>/download', methods=['GET'])
@login_required
def download_document(document_id):
    """Generate download URL for a document"""
    try:
        current_app.logger.info(f"Generating download URL for document {document_id}")
        
        # Get document and verify access
        document = document_service.get_document_by_id(
            document_id, 
            current_user.tennis_club_id
        )
        
        if not document:
            current_app.logger.error(f"Document {document_id} not found")
            return jsonify({'error': 'Document not found'}), 404
        
        # Generate presigned URL
        download_url = document_service.generate_download_url(document)
        
        if not download_url:
            current_app.logger.error(f"Failed to generate download URL for document {document_id}")
            return jsonify({'error': 'Failed to generate download URL'}), 500
        
        # Log the download
        document_service.log_download(
            document_id=document_id,
            user_id=current_user.id,
            ip_address=request.remote_addr,
            user_agent=request.headers.get('User-Agent')
        )
        
        current_app.logger.info(f"Download URL generated successfully for document {document_id}")
        
        return jsonify({
            'download_url': download_url,
            'filename': document.filename
        })
        
    except Exception as e:
        current_app.logger.error(f"Error generating download URL: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': 'Failed to generate download URL'}), 500

@bp.route('/api/documents/<int:document_id>', methods=['DELETE'])
@login_required
def delete_document(document_id):
    """Delete a document"""
    try:
        current_app.logger.info(f"Deleting document {document_id}")
        
        # Get document and verify access
        document = document_service.get_document_by_id(
            document_id,
            current_user.tennis_club_id
        )
        
        if not document:
            return jsonify({'error': 'Document not found'}), 404
        
        # Check permissions
        if not (current_user.is_admin or document.uploaded_by_id == current_user.id):
            current_app.logger.error(f"Permission denied for user {current_user.id} to delete document {document_id}")
            return jsonify({'error': 'Permission denied'}), 403
        
        # Delete document
        success = document_service.delete_document(
            document_id,
            current_user.tennis_club_id,
            current_user.id
        )
        
        if success:
            current_app.logger.info(f"Document {document_id} deleted successfully")
            return jsonify({'message': 'Document deleted successfully'})
        else:
            return jsonify({'error': 'Failed to delete document'}), 500
            
    except Exception as e:
        current_app.logger.error(f"Error deleting document: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': 'Failed to delete document'}), 500

@bp.route('/api/documents/<int:document_id>', methods=['PUT'])
@login_required
def update_document(document_id):
    """Update document metadata"""
    try:
        current_app.logger.info(f"Updating document {document_id}")
        
        # Get document and verify access
        document = document_service.get_document_by_id(
            document_id,
            current_user.tennis_club_id
        )
        
        if not document:
            return jsonify({'error': 'Document not found'}), 404
        
        # Check permissions
        if not (current_user.is_admin or document.uploaded_by_id == current_user.id):
            return jsonify({'error': 'Permission denied'}), 403
        
        # Get updated metadata
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        metadata = {}
        if 'category' in data:
            if data['category'] in document_service.get_document_categories():
                metadata['category'] = data['category']
        
        if 'description' in data:
            metadata['description'] = data['description']
        
        # Update document
        updated_document = document_service.update_document_metadata(
            document_id,
            current_user.tennis_club_id,
            metadata
        )
        
        if updated_document:
            current_app.logger.info(f"Document {document_id} updated successfully")
            return jsonify({
                'message': 'Document updated successfully',
                'document': updated_document.to_dict()
            })
        else:
            return jsonify({'error': 'Failed to update document'}), 500
            
    except Exception as e:
        current_app.logger.error(f"Error updating document: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': 'Failed to update document'}), 500

@bp.route('/api/documents/categories', methods=['GET'])
@login_required
def get_document_categories():
    """Get available document categories"""
    try:
        categories = document_service.get_document_categories()
        current_app.logger.info(f"Returning {len(categories)} categories")
        return jsonify(categories)
    except Exception as e:
        current_app.logger.error(f"Error getting categories: {str(e)}")
        return jsonify({'error': 'Failed to get categories'}), 500

@bp.route('/api/documents/stats', methods=['GET'])
@login_required
def get_document_stats():
    """Get document statistics for the club"""
    try:
        stats = document_service.get_club_document_stats(current_user.tennis_club_id)
        return jsonify(stats)
    except Exception as e:
        current_app.logger.error(f"Error getting document stats: {str(e)}")
        return jsonify({'error': 'Failed to get statistics'}), 500

# Helper functions

def _is_valid_file_size_safe(file):
    """Safely check if file size is within limits (10MB)"""
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB in bytes
    
    try:
        # Check if file is closed
        if hasattr(file, 'closed') and file.closed:
            current_app.logger.error("File is closed in size validation")
            return False
        
        # Get current position
        current_pos = file.tell()
        current_app.logger.debug(f"Current position in size validation: {current_pos}")
        
        # Seek to end to get size
        file.seek(0, 2)
        size = file.tell()
        current_app.logger.debug(f"File size in validation: {size} bytes")
        
        # Reset to original position
        file.seek(current_pos)
        
        is_valid = size <= MAX_FILE_SIZE
        current_app.logger.debug(f"File size validation result: {is_valid}")
        return is_valid
        
    except Exception as e:
        current_app.logger.error(f"Error checking file size: {str(e)}")
        # Reset to beginning as fallback
        try:
            file.seek(0)
        except:
            current_app.logger.error("Cannot reset file position in size validation")
        return False


def _is_allowed_file(filename):
    """Check if file type is allowed - filename only, no file stream access"""
    ALLOWED_EXTENSIONS = {
        'pdf', 'doc', 'docx', 'xls', 'csv', 'xlsx', 'ppt', 'pptx',
        'txt', 'rtf', 'odt', 'ods', 'odp',
        'jpg', 'jpeg', 'png', 'gif', 'webp',
        'mp4', 'avi', 'mov', 'wmv', 'flv',
        'mp3', 'wav', 'aac', 'flac',
        'zip', 'rar', '7z', 'tar', 'gz'
    }
    
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS
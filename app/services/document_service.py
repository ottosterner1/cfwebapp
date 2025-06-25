import os
import boto3
import uuid
from datetime import datetime, timedelta
from flask import current_app
from werkzeug.utils import secure_filename
from app.extensions import db
from app.models.communication import Document, DocumentDownloadLog
from app.models import User

class DocumentService:
    """Service class for document management operations"""
    
    def __init__(self):
        self.s3_client = boto3.client(
            's3',
            aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY'),
            region_name=os.environ.get('AWS_S3_REGION')
        )
        self.bucket_name = os.environ.get('AWS_S3_BUCKET')
    
    def upload_document(self, file, metadata, uploaded_by_user, coach_user):
        """
        Upload a document to S3 and create database record
        
        Args:
            file: FileStorage object from request
            metadata: dict with category, description
            uploaded_by_user: User who uploaded the document
            coach_user: User for whom the document is intended
            
        Returns:
            Document: Created document record
        """
        s3_key = None
        try:
            current_app.logger.info("Starting document upload process")
            
            # Secure the filename
            filename = secure_filename(file.filename)
            current_app.logger.info(f"Secured filename: {filename}")
            
            # Get file size FIRST, before any other operations
            current_app.logger.info("Getting file size...")
            file_size = self._get_file_size_safe(file)
            current_app.logger.info(f"File size: {file_size} bytes")
            
            if file_size == 0:
                current_app.logger.warning("File size is 0, this might indicate an issue")
            
            # Ensure file is at beginning
            file.seek(0)
            current_app.logger.info("Reset file pointer to beginning")
            
            # Generate unique S3 key
            file_extension = filename.split('.')[-1] if '.' in filename else ''
            unique_filename = f"{uuid.uuid4()}.{file_extension}" if file_extension else str(uuid.uuid4())
            
            # CHANGED: Create S3 key structure using organisation: documents/org_id/coach_id/year/month/unique_filename
            now = datetime.now()
            organisation_id = coach_user.tennis_club.organisation_id
            s3_key = f"documents/org_{organisation_id}/{coach_user.id}/{now.year}/{now.month:02d}/{unique_filename}"
            current_app.logger.info(f"Generated S3 key: {s3_key}")
            
            # Read file content into memory to avoid stream issues
            current_app.logger.info("Reading file content into memory...")
            file.seek(0)  # Ensure we're at the beginning
            file_content = file.read()
            file_actual_size = len(file_content)
            current_app.logger.info(f"Actual content size: {file_actual_size} bytes")
            
            # Create a BytesIO object for S3 upload
            from io import BytesIO
            file_obj = BytesIO(file_content)
            
            # Upload to S3
            current_app.logger.info("Uploading to S3...")
            self.s3_client.upload_fileobj(
                file_obj,
                self.bucket_name,
                s3_key,
                ExtraArgs={
                    'ContentType': file.content_type or 'application/octet-stream',
                    'Metadata': {
                        'original_filename': filename,
                        'uploaded_by': str(uploaded_by_user.id),
                        'coach_id': str(coach_user.id),
                        'organisation_id': str(organisation_id),  # CHANGED: use organisation_id instead of club_id
                        'club_id': str(coach_user.tennis_club_id)  # Keep for reference
                    }
                }
            )
            current_app.logger.info("S3 upload successful")
            
            # CHANGED: Create database record using organisation_id
            current_app.logger.info("Creating database record...")
            document = Document(
                filename=filename,
                file_key=s3_key,
                file_size=file_actual_size,  # Use actual content size
                mime_type=file.content_type or 'application/octet-stream',
                category=metadata.get('category', 'General'),
                description=metadata.get('description', ''),
                uploaded_by_id=uploaded_by_user.id,
                uploaded_for_coach_id=coach_user.id,
                organisation_id=organisation_id  # CHANGED: use organisation_id instead of tennis_club_id
            )
            
            db.session.add(document)
            db.session.commit()
            current_app.logger.info(f"Document record created with ID: {document.id}")
            
            current_app.logger.info(f"Document uploaded successfully: {filename} for coach {coach_user.id}")
            return document
            
        except Exception as e:
            current_app.logger.error(f"Error uploading document: {str(e)}")
            current_app.logger.error(f"Exception type: {type(e).__name__}")
            db.session.rollback()
            
            # Try to clean up S3 if upload succeeded but DB failed
            if s3_key:
                try:
                    current_app.logger.info(f"Cleaning up S3 object: {s3_key}")
                    self.s3_client.delete_object(Bucket=self.bucket_name, Key=s3_key)
                except Exception as cleanup_error:
                    current_app.logger.error(f"Failed to cleanup S3 object: {cleanup_error}")
            
            raise e
    
    def _get_file_size_safe(self, file):
        """Safely get file size with better error handling"""
        try:
            current_app.logger.debug("Getting file size safely...")
            
            # Check if file is closed
            if hasattr(file, 'closed') and file.closed:
                current_app.logger.error("File is already closed!")
                return 0
            
            # Store current position
            try:
                current_pos = file.tell()
                current_app.logger.debug(f"Current file position: {current_pos}")
            except Exception as e:
                current_app.logger.error(f"Cannot get current position: {e}")
                current_pos = 0
            
            # Seek to end to get size
            try:
                file.seek(0, 2)  # Seek to end
                size = file.tell()
                current_app.logger.debug(f"File size from seek: {size}")
            except Exception as e:
                current_app.logger.error(f"Cannot seek to end: {e}")
                return 0
            
            # Reset to original position
            try:
                file.seek(current_pos)
                current_app.logger.debug(f"Reset to position: {current_pos}")
            except Exception as e:
                current_app.logger.error(f"Cannot reset position: {e}")
                # Try to at least go to beginning
                try:
                    file.seek(0)
                except:
                    pass
            
            return size
            
        except Exception as e:
            current_app.logger.error(f"Error in _get_file_size_safe: {str(e)}")
            current_app.logger.error(f"Exception type: {type(e).__name__}")
            # Try to reset to beginning as fallback
            try:
                file.seek(0)
            except:
                pass
            return 0
    
    def get_documents_for_coach(self, coach_id, organisation_id):
        """
        Get all documents for a specific coach in an organisation
        
        Args:
            coach_id: ID of the coach
            organisation_id: ID of the organisation (for security)
            
        Returns:
            List[Document]: List of documents
        """
        return Document.query.filter_by(
            uploaded_for_coach_id=coach_id,
            organisation_id=organisation_id,  # CHANGED: use organisation_id
            is_active=True
        ).order_by(Document.created_at.desc()).all()
    
    def get_document_by_id(self, document_id, organisation_id):
        """
        Get a document by ID with organisation verification
        
        Args:
            document_id: ID of the document
            organisation_id: ID of the organisation (for security)
            
        Returns:
            Document or None
        """
        return Document.query.filter_by(
            id=document_id,
            organisation_id=organisation_id,  # CHANGED: use organisation_id
            is_active=True
        ).first()
    
    def generate_download_url(self, document, expires_in=3600):
        """
        Generate a presigned URL for downloading a document
        
        Args:
            document: Document model instance
            expires_in: URL expiration time in seconds (default 1 hour)
            
        Returns:
            str: Presigned download URL
        """
        try:
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': self.bucket_name,
                    'Key': document.file_key,
                    'ResponseContentDisposition': f'attachment; filename="{document.filename}"',
                    'ResponseContentType': document.mime_type
                },
                ExpiresIn=expires_in
            )
            return url
        except Exception as e:
            current_app.logger.error(f"Error generating download URL: {str(e)}")
            return None
    
    def log_download(self, document_id, user_id, ip_address=None, user_agent=None):
        """
        Log a document download
        
        Args:
            document_id: ID of the downloaded document
            user_id: ID of the user who downloaded
            ip_address: IP address of the user
            user_agent: User agent string
        """
        try:
            log_entry = DocumentDownloadLog(
                document_id=document_id,
                downloaded_by_id=user_id,
                ip_address=ip_address,
                user_agent=user_agent
            )
            db.session.add(log_entry)
            db.session.commit()
        except Exception as e:
            current_app.logger.error(f"Error logging download: {str(e)}")
            db.session.rollback()
    
    def delete_document(self, document_id, organisation_id, user_id):
        """
        Simple immediate deletion - no grace period, no complexity
        
        Args:
            document_id: ID of the document to delete
            organisation_id: ID of the organisation (for security)
            user_id: ID of the user performing deletion
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            document = self.get_document_by_id(document_id, organisation_id)  # CHANGED: use organisation_id
            if not document:
                return False
            
            # Delete from S3
            self.s3_client.delete_object(
                Bucket=self.bucket_name,
                Key=document.file_key
            )
            
            # Delete from database
            db.session.delete(document)
            db.session.commit()
            
            current_app.logger.info(f"Document {document.filename} deleted by user {user_id}")
            return True
            
        except Exception as e:
            current_app.logger.error(f"Error deleting document: {str(e)}")
            db.session.rollback()
            return False
    
    def update_document_metadata(self, document_id, organisation_id, metadata):
        """
        Update document metadata
        
        Args:
            document_id: ID of the document
            organisation_id: Organisation ID for security
            metadata: dict with category, description
            
        Returns:
            Document or None: Updated document or None if failed
        """
        try:
            document = self.get_document_by_id(document_id, organisation_id)  # CHANGED: use organisation_id
            if not document:
                return None
            
            if 'category' in metadata:
                document.category = metadata['category']
            if 'description' in metadata:
                document.description = metadata['description']
            
            # Update timestamp
            document.updated_at = datetime.now()
            
            db.session.commit()
            return document
            
        except Exception as e:
            current_app.logger.error(f"Error updating document metadata: {str(e)}")
            db.session.rollback()
            return None
    
    def get_document_categories(self):
        """Get list of available document categories"""
        return [
            'Certificates',
            'Meeting Notes', 
            'Policies',
            'General',
            'Training Materials',  # ADDED: Additional categories for organisation-wide use
            'Safety Documents',
            'Forms',
            'Photos',
            'Videos'
        ]
    
    def get_organisation_document_stats(self, organisation_id):
        """
        Get document statistics for an organisation
        
        Args:
            organisation_id: ID of the organisation
            
        Returns:
            dict: Statistics including total documents, by category, etc.
        """
        try:
            # Total documents in organisation
            total_docs = Document.query.filter_by(
                organisation_id=organisation_id,  # CHANGED: use organisation_id
                is_active=True
            ).count()
            
            # Get document count by category
            category_stats = db.session.query(
                Document.category,
                db.func.count(Document.id).label('count')
            ).filter_by(
                organisation_id=organisation_id,  # CHANGED: use organisation_id
                is_active=True
            ).group_by(Document.category).all()
            
            # Recent uploads (last 30 days)
            thirty_days_ago = datetime.now() - timedelta(days=30)
            recent_uploads = Document.query.filter(
                Document.organisation_id == organisation_id,  # CHANGED: use organisation_id
                Document.is_active == True,
                Document.created_at >= thirty_days_ago
            ).count()
            
            # Total storage used (in bytes)
            total_size = db.session.query(
                db.func.sum(Document.file_size)
            ).filter_by(
                organisation_id=organisation_id,  # CHANGED: use organisation_id
                is_active=True
            ).scalar() or 0
            
            # ADDED: Get stats by coach
            coach_stats = db.session.query(
                Document.uploaded_for_coach_id,
                db.func.count(Document.id).label('count')
            ).filter_by(
                organisation_id=organisation_id,
                is_active=True
            ).group_by(Document.uploaded_for_coach_id).all()
            
            # ADDED: Get stats by club within organisation
            from app.models import TennisClub
            club_stats = db.session.query(
                TennisClub.name.label('club_name'),
                db.func.count(Document.id).label('count')
            ).join(User, User.tennis_club_id == TennisClub.id)\
             .join(Document, Document.uploaded_for_coach_id == User.id)\
             .filter(
                TennisClub.organisation_id == organisation_id,
                Document.is_active == True
             ).group_by(TennisClub.id, TennisClub.name).all()
            
            return {
                'total_documents': total_docs,
                'by_category': {stat.category: stat.count for stat in category_stats},
                'recent_uploads': recent_uploads,
                'total_size_bytes': total_size,
                'total_size_mb': round(total_size / (1024 * 1024), 2) if total_size > 0 else 0,
                'by_coach': {stat.uploaded_for_coach_id: stat.count for stat in coach_stats},
                'by_club': {stat.club_name: stat.count for stat in club_stats}
            }
            
        except Exception as e:
            current_app.logger.error(f"Error getting organisation document stats: {str(e)}")
            return {
                'total_documents': 0, 
                'by_category': {},
                'recent_uploads': 0,
                'total_size_bytes': 0,
                'total_size_mb': 0,
                'by_coach': {},
                'by_club': {}
            }
    
    # ADDED: New method for getting all documents in organisation
    def get_all_organisation_documents(self, organisation_id, limit=None, offset=None):
        """
        Get all documents in an organisation with optional pagination
        
        Args:
            organisation_id: ID of the organisation
            limit: Maximum number of documents to return
            offset: Number of documents to skip
            
        Returns:
            List[Document]: List of documents
        """
        try:
            query = Document.query.filter_by(
                organisation_id=organisation_id,
                is_active=True
            ).order_by(Document.created_at.desc())
            
            if offset:
                query = query.offset(offset)
            if limit:
                query = query.limit(limit)
                
            return query.all()
            
        except Exception as e:
            current_app.logger.error(f"Error getting organisation documents: {str(e)}")
            return []
    
    # ADDED: New method for searching documents across organisation
    def search_organisation_documents(self, organisation_id, search_term, category=None):
        """
        Search documents across an organisation
        
        Args:
            organisation_id: ID of the organisation
            search_term: Text to search for in filename and description
            category: Optional category filter
            
        Returns:
            List[Document]: List of matching documents
        """
        try:
            query = Document.query.filter(
                Document.organisation_id == organisation_id,
                Document.is_active == True,
                db.or_(
                    Document.filename.ilike(f'%{search_term}%'),
                    Document.description.ilike(f'%{search_term}%')
                )
            )
            
            if category:
                query = query.filter(Document.category == category)
                
            return query.order_by(Document.created_at.desc()).all()
            
        except Exception as e:
            current_app.logger.error(f"Error searching organisation documents: {str(e)}")
            return []
    
    # ADDED: New method for getting documents by club within organisation
    def get_documents_by_club(self, organisation_id, club_id):
        """
        Get all documents for coaches in a specific club within an organisation
        
        Args:
            organisation_id: ID of the organisation
            club_id: ID of the specific club
            
        Returns:
            List[Document]: List of documents for coaches in the club
        """
        try:
            return db.session.query(Document)\
                .join(User, Document.uploaded_for_coach_id == User.id)\
                .filter(
                    Document.organisation_id == organisation_id,
                    User.tennis_club_id == club_id,
                    Document.is_active == True
                ).order_by(Document.created_at.desc()).all()
                
        except Exception as e:
            current_app.logger.error(f"Error getting club documents: {str(e)}")
            return []
    
    # BACKWARD COMPATIBILITY: Keep old method name for existing code
    def get_club_document_stats(self, tennis_club_id):
        """
        DEPRECATED: Use get_organisation_document_stats instead
        Get document statistics for a club (backward compatibility)
        """
        try:
            # Get the organisation_id from the club
            from app.models import TennisClub
            club = TennisClub.query.get(tennis_club_id)
            if not club:
                return {'total_documents': 0, 'by_category': {}}
                
            # Get organisation stats and filter for this club
            org_stats = self.get_organisation_document_stats(club.organisation_id)
            
            # Filter stats for just this club's coaches
            club_docs = self.get_documents_by_club(club.organisation_id, tennis_club_id)
            
            # Count by category for this club only
            category_counts = {}
            for doc in club_docs:
                category_counts[doc.category] = category_counts.get(doc.category, 0) + 1
            
            return {
                'total_documents': len(club_docs),
                'by_category': category_counts
            }
            
        except Exception as e:
            current_app.logger.error(f"Error getting club document stats: {str(e)}")
            return {'total_documents': 0, 'by_category': {}}
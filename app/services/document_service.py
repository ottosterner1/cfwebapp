import os
import boto3
import uuid
from datetime import datetime, timedelta
from flask import current_app
from werkzeug.utils import secure_filename
from app.extensions import db
from app.models.communication import Document, DocumentDownloadLog, DocumentAcknowledgment
from app.models import User
from io import BytesIO

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
    
    def upload_to_multiple_coaches(self, file, metadata, uploaded_by_user, coaches):
        """
        Upload the same document to multiple coaches individually
        
        Args:
            file: FileStorage object from request
            metadata: dict with category, description, etc.
            uploaded_by_user: User who uploaded the document
            coaches: List of User objects to upload to
            
        Returns:
            List[Document]: Created document records
        """
        
        # First, upload the file to S3 once with a shared key
        s3_key = self._upload_file_to_s3(file, uploaded_by_user)
        
        # Create individual document records for each coach
        documents = []
        try:
            # Get file info
            filename = secure_filename(file.filename)
            file_size = self._get_file_size_safe(file)
            
            for coach in coaches:
                
                document = Document(
                    filename=filename,
                    file_key=s3_key,  # Same S3 key for all coaches
                    file_size=file_size,
                    mime_type=file.content_type or 'application/octet-stream',
                    category=metadata.get('category', 'General'),
                    description=metadata.get('description', ''),
                    uploaded_by_id=uploaded_by_user.id,
                    uploaded_for_coach_id=coach.id,  # Individual coach
                    organisation_id=uploaded_by_user.tennis_club.organisation_id,
                    requires_acknowledgment=metadata.get('requires_acknowledgment', False),
                    acknowledgment_deadline=metadata.get('acknowledgment_deadline')
                )
                
                db.session.add(document)
                documents.append(document)
            
            db.session.commit()
            return documents
            
        except Exception as e:
            current_app.logger.error(f"Error creating document records: {str(e)}")
            db.session.rollback()
            
            # Cleanup S3 if database operations failed
            try:
                self.s3_client.delete_object(Bucket=self.bucket_name, Key=s3_key)
            except Exception as cleanup_error:
                current_app.logger.error(f"Failed to cleanup S3 object: {cleanup_error}")
            
            raise e
    
    def _upload_file_to_s3(self, file, uploaded_by_user):
        """
        Upload file content to S3 and return the S3 key
        
        Args:
            file: FileStorage object
            uploaded_by_user: User uploading the file
            
        Returns:
            str: S3 key for the uploaded file
        """
        # Secure the filename
        filename = secure_filename(file.filename)
        
        # Ensure file is at beginning
        file.seek(0)
        
        # Generate unique S3 key
        file_extension = filename.split('.')[-1] if '.' in filename else ''
        unique_filename = f"{uuid.uuid4()}.{file_extension}" if file_extension else str(uuid.uuid4())
        
        # Create S3 key structure
        now = datetime.now()
        organisation_id = uploaded_by_user.tennis_club.organisation_id
        s3_key = f"documents/org_{organisation_id}/shared/{now.year}/{now.month:02d}/{unique_filename}"
        
        
        # Read file content into memory
        file.seek(0)
        file_content = file.read()
        file_actual_size = len(file_content)
        
        # Create BytesIO object for S3 upload
        file_obj = BytesIO(file_content)
        
        # Upload to S3
        s3_metadata = {
            'original_filename': filename,
            'uploaded_by': str(uploaded_by_user.id),
            'organisation_id': str(organisation_id),
            'upload_type': 'multi_coach'
        }
        
        self.s3_client.upload_fileobj(
            file_obj,
            self.bucket_name,
            s3_key,
            ExtraArgs={
                'ContentType': file.content_type or 'application/octet-stream',
                'Metadata': s3_metadata
            }
        )
        
        return s3_key
    
    def get_documents_for_coach(self, coach_id, organisation_id):
        """
        Get all documents for a specific coach
        
        Args:
            coach_id: ID of the coach
            organisation_id: ID of the organisation
            
        Returns:
            List[Document]: List of documents for the coach
        """
        documents = Document.query.filter_by(
            uploaded_for_coach_id=coach_id,
            organisation_id=organisation_id,
            is_active=True
        ).order_by(Document.created_at.desc()).all()
        
        return documents
    
    def get_unacknowledged_documents_for_user(self, user_id, organisation_id):
        """
        Get documents that require acknowledgment but haven't been acknowledged by user
        
        Args:
            user_id: ID of the user
            organisation_id: ID of the organisation
            
        Returns:
            List[Document]: Documents requiring acknowledgment
        """
        try:
            # Get all documents that require acknowledgment for this specific user
            documents_requiring_ack = Document.query.filter_by(
                uploaded_for_coach_id=user_id,
                organisation_id=organisation_id,
                requires_acknowledgment=True,
                is_active=True
            ).all()
            
            # Filter out already acknowledged documents
            unacknowledged = []
            for doc in documents_requiring_ack:
                existing_ack = DocumentAcknowledgment.query.filter_by(
                    document_id=doc.id,
                    user_id=user_id
                ).first()
                
                if not existing_ack:
                    unacknowledged.append(doc)
            
            return unacknowledged
            
        except Exception as e:
            current_app.logger.error(f"Error getting unacknowledged documents: {str(e)}")
            return []
    
    def get_overdue_acknowledgments(self, organisation_id):
        """
        Get documents with overdue acknowledgment deadlines
        
        Args:
            organisation_id: ID of the organisation
            
        Returns:
            List[Dict]: Documents with overdue acknowledgments and missing users
        """
        try:
            now = datetime.now()
            
            # Get documents with past deadlines
            overdue_docs = Document.query.filter(
                Document.organisation_id == organisation_id,
                Document.requires_acknowledgment == True,
                Document.acknowledgment_deadline < now,
                Document.is_active == True
            ).all()
            
            overdue_info = []
            
            for doc in overdue_docs:
                # Check if the specific coach has acknowledged
                existing_ack = DocumentAcknowledgment.query.filter_by(
                    document_id=doc.id,
                    user_id=doc.uploaded_for_coach_id
                ).first()
                
                if not existing_ack:
                    overdue_info.append({
                        'document': doc.to_dict(),
                        'missing_acknowledgments': [{
                            'user_id': doc.uploaded_for_coach.id,
                            'user_name': doc.uploaded_for_coach.name,
                            'user_email': doc.uploaded_for_coach.email
                        }],
                        'days_overdue': (now - doc.acknowledgment_deadline).days
                    })
            
            return overdue_info
            
        except Exception as e:
            current_app.logger.error(f"Error getting overdue acknowledgments: {str(e)}")
            return []
    
    def log_preview(self, document_id, user_id, ip_address=None, user_agent=None):
        """
        Log when a user previews/opens a document
        
        Args:
            document_id: ID of the previewed document
            user_id: ID of the user who previewed
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
            current_app.logger.error(f"Error logging preview: {str(e)}")
            db.session.rollback()
    
    def _get_file_size_safe(self, file):
        """Safely get file size with better error handling"""
        try:
            if hasattr(file, 'closed') and file.closed:
                return 0
            
            current_pos = file.tell()
            file.seek(0, 2)
            size = file.tell()
            file.seek(current_pos)
            return size
        except Exception as e:
            current_app.logger.error(f"Error in _get_file_size_safe: {str(e)}")
            try:
                file.seek(0)
            except:
                pass
            return 0
    
    def get_document_by_id(self, document_id, organisation_id):
        """Get a document by ID with organisation verification"""
        return Document.query.filter_by(
            id=document_id,
            organisation_id=organisation_id,
            is_active=True
        ).first()
    
    def generate_download_url(self, document, expires_in=3600):
        """Generate a presigned URL for downloading a document"""
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
    
    def generate_preview_url(self, document, expires_in=3600):
        """Generate a presigned URL for previewing a document"""
        try:
            presigned_url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': self.bucket_name,
                    'Key': document.file_key
                },
                ExpiresIn=expires_in,
                HttpMethod='GET'
            )
            return presigned_url
        except Exception as e:
            current_app.logger.error(f"Error generating preview URL: {str(e)}")
            return None
    
    def get_file_content(self, document, max_size=10 * 1024 * 1024):
        """Download and return the content of a file from S3"""
        try:
            # Check file size first
            response = self.s3_client.head_object(Bucket=self.bucket_name, Key=document.file_key)
            file_size = response.get('ContentLength', 0)
            
            if file_size > max_size:
                current_app.logger.error(f"File too large for content reading: {file_size} bytes")
                return None
            
            # Download the file content
            response = self.s3_client.get_object(Bucket=self.bucket_name, Key=document.file_key)
            content = response['Body'].read()
            
            return content
        except Exception as e:
            current_app.logger.error(f"Error retrieving file content: {str(e)}")
            return None
    
    def log_download(self, document_id, user_id, ip_address=None, user_agent=None):
        """Log a document download"""
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
        """Delete a document"""
        try:
            document = self.get_document_by_id(document_id, organisation_id)
            if not document:
                return False
            
            # Check if this is the last reference to the S3 file
            other_docs_with_same_key = Document.query.filter(
                Document.file_key == document.file_key,
                Document.id != document_id,
                Document.is_active == True
            ).count()
            
            # Delete from database first (cascade will handle acknowledgments)
            db.session.delete(document)
            db.session.commit()
            
            # Only delete from S3 if no other documents reference this file
            if other_docs_with_same_key == 0:
                try:
                    self.s3_client.delete_object(Bucket=self.bucket_name, Key=document.file_key)
                except Exception as s3_error:
                    current_app.logger.error(f"Failed to delete S3 object: {s3_error}")
                    # Don't fail the entire operation if S3 deletion fails
            else:
                current_app.logger.info(f"S3 file {document.file_key} kept (referenced by {other_docs_with_same_key} other documents)")
            
            current_app.logger.info(f"Document {document.filename} deleted by user {user_id}")
            return True
            
        except Exception as e:
            current_app.logger.error(f"Error deleting document: {str(e)}")
            db.session.rollback()
            return False
    
    def update_document_metadata(self, document_id, organisation_id, metadata):
        """Update document metadata"""
        try:
            document = self.get_document_by_id(document_id, organisation_id)
            if not document:
                return None
            
            if 'category' in metadata:
                document.category = metadata['category']
            if 'description' in metadata:
                document.description = metadata['description']
            if 'requires_acknowledgment' in metadata:
                document.requires_acknowledgment = metadata['requires_acknowledgment']
            if 'acknowledgment_deadline' in metadata:
                document.acknowledgment_deadline = metadata['acknowledgment_deadline']
            
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
            'Training Materials',
            'Safety Documents',
            'Forms',
            'Photos',
            'Videos',
            'Announcements'
        ]
    
    def get_organisation_document_stats(self, organisation_id):
        """Get document statistics for an organisation"""
        try:
            # Total documents
            total_docs = Document.query.filter_by(
                organisation_id=organisation_id,
                is_active=True
            ).count()
            
            # Documents requiring acknowledgment
            ack_required_docs = Document.query.filter_by(
                organisation_id=organisation_id,
                is_active=True,
                requires_acknowledgment=True
            ).count()
            
            # Overdue acknowledgments
            overdue_acks = self.get_overdue_acknowledgments(organisation_id)
            
            # Category stats
            category_stats = db.session.query(
                Document.category,
                db.func.count(Document.id).label('count')
            ).filter_by(
                organisation_id=organisation_id,
                is_active=True
            ).group_by(Document.category).all()
            
            # Recent uploads (last 30 days)
            thirty_days_ago = datetime.now() - timedelta(days=30)
            recent_uploads = Document.query.filter(
                Document.organisation_id == organisation_id,
                Document.is_active == True,
                Document.created_at >= thirty_days_ago
            ).count()
            
            # Total storage used
            total_size = db.session.query(
                db.func.sum(Document.file_size)
            ).filter_by(
                organisation_id=organisation_id,
                is_active=True
            ).scalar() or 0
            
            # Unique coaches with documents
            unique_coaches = db.session.query(
                Document.uploaded_for_coach_id
            ).filter_by(
                organisation_id=organisation_id,
                is_active=True
            ).distinct().count()
            
            return {
                'total_documents': total_docs,
                'acknowledgment_required': ack_required_docs,
                'overdue_acknowledgments': len(overdue_acks),
                'by_category': {stat.category: stat.count for stat in category_stats},
                'recent_uploads': recent_uploads,
                'total_size_bytes': total_size,
                'total_size_mb': round(total_size / (1024 * 1024), 2) if total_size > 0 else 0,
                'coaches_with_documents': unique_coaches
            }
        except Exception as e:
            current_app.logger.error(f"Error getting organisation document stats: {str(e)}")
            return {
                'total_documents': 0,
                'acknowledgment_required': 0,
                'overdue_acknowledgments': 0,
                'by_category': {},
                'recent_uploads': 0,
                'total_size_bytes': 0,
                'total_size_mb': 0,
                'coaches_with_documents': 0
            }
# app/utils/s3.py
import traceback
import boto3
from botocore.exceptions import ClientError
import os
from flask import current_app
from werkzeug.utils import secure_filename
import uuid

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in {'png', 'jpg', 'jpeg', 'gif'}

def upload_file_to_s3(file, bucket_name, subdomain):
    current_app.logger.info("Starting S3 upload")
    current_app.logger.info(f"File: {file.filename}")
    current_app.logger.info(f"Bucket: {bucket_name}")
    current_app.logger.info(f"Subdomain: {subdomain}")
    
    try:
        s3_client = boto3.client(
            's3',
            aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY'),
            region_name=os.environ.get('AWS_S3_REGION')
        )
        
        # Test S3 connection
        try:
            s3_client.head_bucket(Bucket=bucket_name)
            current_app.logger.info("Successfully connected to S3 bucket")
        except Exception as e:
            current_app.logger.error(f"Error connecting to bucket: {str(e)}")
            raise

        # Generate unique filename - removed the duplicated path
        ext = file.filename.rsplit('.', 1)[1].lower()
        unique_filename = f"logo_{str(uuid.uuid4())}.{ext}"
        object_key = f"clubs/{subdomain}/{unique_filename}"  # Single path construction
        
        current_app.logger.info(f"Generated object key: {object_key}")
        
        # Store file position
        file.seek(0)
        
        # Upload file
        s3_client.upload_fileobj(
            file,
            bucket_name,
            object_key,  # Use the object_key here
            ExtraArgs={
                "ContentType": file.content_type
            }
        )
        
        # Test if file exists
        try:
            s3_client.head_object(Bucket=bucket_name, Key=object_key)
            current_app.logger.info("File successfully uploaded and verified in S3")
        except Exception as e:
            current_app.logger.error(f"File upload verification failed: {str(e)}")
            raise

        # Return just the object key as the URL
        return object_key  # This is what gets stored in the database
        
    except Exception as e:
        current_app.logger.error(f"S3 upload error: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return None
    
def get_presigned_url(bucket_name, object_key, expiration=3600):
    """Generate a presigned URL for an S3 object"""
    try:
        s3_client = boto3.client(
            's3',
            aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY'),
            region_name=os.environ.get('AWS_S3_REGION')
        )
        
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': bucket_name,
                'Key': object_key
            },
            ExpiresIn=expiration
        )
        return url
    except Exception as e:
        current_app.logger.error(f"Error generating presigned URL: {str(e)}")
        return None
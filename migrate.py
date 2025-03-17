#!/usr/bin/env python
import os
import sys
import subprocess
import time
from flask import Flask
from flask_migrate import Migrate
from app import create_app, db

def run_migrations():
    """Run database migrations with retry logic."""
    print("Starting database migration process...")
    
    # Maximum number of retries
    max_retries = 5
    retry_delay = 5  # seconds
    
    # Create app context for migrations
    app = create_app()
    
    # Initialize migration with app context
    with app.app_context():
        for attempt in range(max_retries):
            try:
                print(f"Migration attempt {attempt + 1} of {max_retries}")
                
                # Run migrations using Flask-Migrate
                migrate = Migrate(app, db)
                
                # Run the upgrade command
                from flask_migrate import upgrade as flask_upgrade
                flask_upgrade()
                
                print("Database migration completed successfully!")
                return True
            except Exception as e:
                print(f"Migration attempt {attempt + 1} failed with error: {str(e)}")
                if attempt < max_retries - 1:
                    print(f"Retrying in {retry_delay} seconds...")
                    time.sleep(retry_delay)
                else:
                    print("Maximum retry attempts reached. Migration failed.")
                    raise

if __name__ == "__main__":
    run_migrations()
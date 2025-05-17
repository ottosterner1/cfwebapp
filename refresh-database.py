import os
import psycopg2
import psycopg2.extras
import json
import argparse
import getpass
import sys
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

def migrate_database(source_db_url, target_db_url, target_name):
    # Connect to both databases
    print(f"Connecting to production and {target_name} databases...")
    
    try:
        source_conn = psycopg2.connect(source_db_url)
        source_conn.set_session(autocommit=True)
        source_cursor = source_conn.cursor()

        target_conn = psycopg2.connect(target_db_url)
        target_conn.set_session(autocommit=True)
        target_cursor = target_conn.cursor()
    except Exception as e:
        print(f"Error connecting to databases: {str(e)}")
        return False

    # Get a list of all tables (excluding alembic_version)
    print("Getting list of tables...")
    source_cursor.execute("""
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    AND table_name != 'alembic_version'
    ORDER BY table_name
    """)
    tables = [row[0] for row in source_cursor.fetchall()]
    print(f"Found {len(tables)} tables: {', '.join(tables)}")

    # Define a specific order for tables based on dependencies
    table_order = [
        "tennis_club",  
        "user",      
        "teaching_period", 
        "tennis_group",
        "tennis_group_times",
        "student",
        "report_template",
        "template_section",
        "template_field",
        "programme_players",
        "report", 
        "register",  
        "register_entry", 
        "group_template",
        "coach_details",
        "coach_invitation",
        "club_feature" 
    ]

    # Validate all tables from DB are in our list
    missing_tables = set(tables) - set(table_order)
    if missing_tables:
        print(f"WARNING: These tables are missing from our order list: {', '.join(missing_tables)}")
        # Add missing tables to the end
        table_order.extend(list(missing_tables))

    extra_tables = set(table_order) - set(tables)
    if extra_tables:
        print(f"WARNING: These tables in our order list don't exist in the DB: {', '.join(extra_tables)}")
        # Remove non-existent tables
        table_order = [t for t in table_order if t in tables]

    # Clear out target tables in reverse dependency order
    print(f"Clearing {target_name} tables...")
    target_cursor.execute("SET session_replication_role = 'replica';")  # Disable constraints temporarily
    for table in reversed(table_order):
        print(f"  Truncating table {table}...")
        target_cursor.execute(f'TRUNCATE TABLE "{table}" CASCADE;')
    target_cursor.execute("SET session_replication_role = 'origin';")  # Re-enable constraints

    # Copy data from source to target in the correct dependency order
    print(f"Copying data from production to {target_name}...")
    for table in table_order:
        # Get column names for the table
        source_cursor.execute(f"""
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = '{table}'
        ORDER BY ordinal_position
        """)
        columns_info = source_cursor.fetchall()
        columns = [col[0] for col in columns_info]
        columns_str = ', '.join([f'"{col}"' for col in columns])
        
        # Check if table has JSONB columns
        jsonb_columns = [col[0] for col in columns_info if col[1] in ('json', 'jsonb')]
        has_jsonb = len(jsonb_columns) > 0
        
        # Get data from source
        print(f"  Copying table {table}...")
        
        if has_jsonb:
            # For tables with JSONB, handle rows individually
            source_cursor.execute(f'SELECT {columns_str} FROM "{table}"')
            rows = []
            for row in source_cursor:
                processed_row = list(row)
                # Convert Python dicts to JSON strings for JSONB columns
                for i, col in enumerate(columns):
                    if col in jsonb_columns and processed_row[i] is not None:
                        processed_row[i] = json.dumps(processed_row[i])
                rows.append(processed_row)
        else:
            # For normal tables, fetch all rows at once
            source_cursor.execute(f'SELECT {columns_str} FROM "{table}"')
            rows = source_cursor.fetchall()
        
        if rows:
            # Prepare placeholders for insert statement
            placeholders = ', '.join(['%s'] * len(columns))
            
            # Insert data into target in batches
            batch_size = 1000
            for i in range(0, len(rows), batch_size):
                batch = rows[i:i+batch_size]
                try:
                    target_cursor.executemany(
                        f'INSERT INTO "{table}" ({columns_str}) VALUES ({placeholders})',
                        batch
                    )
                    print(f"    Inserted {len(batch)} rows (batch {i//batch_size + 1})")
                except Exception as e:
                    print(f"    Error inserting into {table}: {str(e)}")
                    # Try inserting rows one by one to identify problematic rows
                    if table == "template_field" or table == "report":
                        print("    Attempting row-by-row insert for problematic table...")
                        for j, row_data in enumerate(batch):
                            try:
                                target_cursor.execute(
                                    f'INSERT INTO "{table}" ({columns_str}) VALUES ({placeholders})',
                                    row_data
                                )
                            except Exception as row_error:
                                print(f"    Error on row {j}: {str(row_error)}")
                    # Continue with next table
                    break
        else:
            print(f"    No data to copy for table {table}")

    # Reset sequences in target
    print("Resetting sequences...")
    target_cursor.execute("""
    SELECT 'SELECT SETVAL(' ||
           quote_literal(quote_ident(PGT.schemaname) || '.' || quote_ident(S.relname)) ||
           ', COALESCE(MAX(' ||quote_ident(C.attname)|| '), 1) ) FROM ' ||
           quote_ident(PGT.schemaname)|| '.'||quote_ident(T.relname)|| ';'
    FROM pg_class AS S
    JOIN pg_depend AS D ON S.oid = D.objid
    JOIN pg_class AS T ON D.refobjid = T.oid
    JOIN pg_attribute AS C ON D.refobjid = C.attrelid AND D.refobjsubid = C.attnum
    JOIN pg_tables AS PGT ON PGT.tablename = T.relname
    WHERE S.relkind = 'S'
      AND PGT.schemaname = 'public'
    """)
    seq_updates = target_cursor.fetchall()

    for seq_update in seq_updates:
        try:
            target_cursor.execute(seq_update[0])
        except Exception as e:
            print(f"Error resetting sequence: {str(e)}")

    print("Closing connections...")
    source_cursor.close()
    source_conn.close()
    target_cursor.close()
    target_conn.close()

    print(f"Data migration to {target_name} completed successfully!")
    return True

if __name__ == "__main__":
    # Get database connection details from environment variables
    PROD_DB_URL = os.getenv("PROD_DATABASE_URL")
    STAGING_DB_URL = os.getenv("STAGING_DATABASE_URL")
    
    # Check if environment variables are set
    if not PROD_DB_URL:
        print("Error: PROD_DATABASE_URL environment variable is not set.")
        sys.exit(1)
    
    if not STAGING_DB_URL:
        print("Warning: STAGING_DATABASE_URL environment variable is not set.")
    
    # Set up argument parser
    parser = argparse.ArgumentParser(description="Refresh database from production")
    parser.add_argument('--target', choices=['local', 'staging'], 
                       help='Target environment to refresh (local or staging)')
    
    args = parser.parse_args()
    
    target = args.target
    
    # If target not provided via command line, prompt the user
    if not target:
        print("Select target environment to refresh:")
        print("1. Local database")
        print("2. Staging database")
        choice = input("Enter your choice (1/2): ")
        
        if choice == '1':
            target = 'local'
        elif choice == '2':
            target = 'staging'
            # Double check that we have staging URL
            if not STAGING_DB_URL:
                print("Error: STAGING_DATABASE_URL environment variable is not set but staging was selected.")
                sys.exit(1)
        else:
            print("Invalid choice. Exiting.")
            sys.exit(1)
    
    if target == 'local':
        # Get local database connection details
        local_user = input("Enter local PostgreSQL username [postgres]: ") or "postgres"
        local_password = getpass.getpass("Enter local PostgreSQL password: ")
        local_host = input("Enter local PostgreSQL host [localhost]: ") or "localhost"
        local_port = input("Enter local PostgreSQL port [5432]: ") or "5432"
        local_db = input("Enter local PostgreSQL database name: ")
        
        LOCAL_DB_URL = f"postgresql://{local_user}:{local_password}@{local_host}:{local_port}/{local_db}"
        
        print("Refreshing local database from production...")
        migrate_database(PROD_DB_URL, LOCAL_DB_URL, "local")
        
    elif target == 'staging':
        print("Refreshing staging database from production...")
        migrate_database(PROD_DB_URL, STAGING_DB_URL, "staging")
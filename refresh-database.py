import os
import psycopg2
import psycopg2.extras
import json
import argparse
import getpass
import sys
import subprocess
import tempfile
from dotenv import load_dotenv

# Load environment variables from .envrc file
load_dotenv()

def validate_foreign_keys(source_cursor, table, columns):
    """Validate foreign key relationships and return clean data"""
    
    # Define foreign key relationships
    fk_validations = {
        'report': {
            'student_id': 'SELECT id FROM student',
            'report_template_id': 'SELECT id FROM report_template'
        },
        'register': {
            'coach_id': 'SELECT id FROM "user"',
            'tennis_group_id': 'SELECT id FROM tennis_group',
            'teaching_period_id': 'SELECT id FROM teaching_period'
        },
        'register_entry': {
            'programme_player_id': 'SELECT id FROM programme_players',
            'register_id': 'SELECT id FROM register'
        },
        'programme_players': {
            'student_id': 'SELECT id FROM student',
            'tennis_group_id': 'SELECT id FROM tennis_group'
        },
        'coach_details': {
            'user_id': 'SELECT id FROM "user"'
        },
        'coach_invitation': {
            'tennis_club_id': 'SELECT id FROM tennis_club'
        },
        'club_feature': {
            'tennis_club_id': 'SELECT id FROM tennis_club'
        },
        'cancellation': {
            'created_by_id': 'SELECT id FROM "user"'
        },
        'coaching_rate': {
            'coach_id': 'SELECT id FROM "user"'
        },
        'invoice': {
            'approved_by_id': 'SELECT id FROM "user"'
        },
        'invoice_line_item': {
            'invoice_id': 'SELECT id FROM invoice'
        },
        'register_assistant_coach': {
            'coach_id': 'SELECT id FROM "user"',
            'register_id': 'SELECT id FROM register'
        },
        'club_invitation': {
            'invited_by_id': 'SELECT id FROM "user"'
        },
        'group_template': {
            'group_id': 'SELECT id FROM tennis_group'
        },
        'template_section': {
            'report_template_id': 'SELECT id FROM report_template'
        },
        'template_field': {
            'template_section_id': 'SELECT id FROM template_section'
        },
        'tennis_group_times': {
            'tennis_group_id': 'SELECT id FROM tennis_group'
        }
    }
    
    if table not in fk_validations:
        # No validation needed for this table
        return None
    
    fk_rules = fk_validations[table]
    
    # Build WHERE clause to filter out invalid foreign key references
    where_conditions = []
    for fk_column, validation_query in fk_rules.items():
        if fk_column in columns:
            where_conditions.append(f'{fk_column} IN ({validation_query}) OR {fk_column} IS NULL')
    
    if where_conditions:
        return f"WHERE {' AND '.join(where_conditions)}"
    
    return None

def check_migration_state(db_url, db_name):
    """Check current Flask migration state"""
    print(f"\n🔍 Checking Flask migration state in {db_name} database...")
    
    try:
        conn = psycopg2.connect(db_url)
        conn.set_session(autocommit=True)
        cursor = conn.cursor()
        
        # Check if alembic_version table exists
        cursor.execute("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'alembic_version'
        )
        """)
        table_exists = cursor.fetchone()[0]
        
        if not table_exists:
            print(f"  ⚠️  No alembic_version table found in {db_name}")
            cursor.close()
            conn.close()
            return None
        
        cursor.execute("SELECT version_num FROM alembic_version")
        version = cursor.fetchone()
        
        if version:
            print(f"  📍 Current migration version: {version[0]}")
            cursor.close()
            conn.close()
            return version[0]
        else:
            print(f"  ❌ No migration version found in {db_name}")
            cursor.close()
            conn.close()
            return None
        
    except Exception as e:
        print(f"  ❌ Error checking migration state: {str(e)}")
        return None

def drop_and_recreate_schema(source_db_url, target_db_url, target_name):
    """Completely drop and recreate the target database schema from source"""
    print(f"\n💥 DROPPING AND RECREATING {target_name.upper()} DATABASE SCHEMA")
    print("="*60)
    print("⚠️  WARNING: This will COMPLETELY DESTROY the target database!")
    print("⚠️  All data, tables, indexes, and schema will be PERMANENTLY DELETED!")
    print("="*60)
    
    # Extra confirmation for destructive operation
    confirm1 = input(f"Are you absolutely sure you want to DROP ALL DATA in {target_name}? (type 'YES' to confirm): ")
    if confirm1 != 'YES':
        print("❌ Operation cancelled - schema drop aborted")
        return False
    
    confirm2 = input(f"Final confirmation: Type 'DROP {target_name.upper()}' to proceed: ")
    if confirm2 != f'DROP {target_name.upper()}':
        print("❌ Operation cancelled - incorrect confirmation")
        return False
    
    try:
        print(f"\n🗄️  Creating database dump from production...")
        
        # Create a temporary dump file
        import tempfile
        import subprocess
        import os
        
        with tempfile.NamedTemporaryFile(mode='w+b', suffix='.sql', delete=False) as dump_file:
            dump_path = dump_file.name
        
        try:
            # Dump production database
            print(f"   📦 Dumping production database...")
            dump_cmd = ['pg_dump', '--no-owner', '--no-privileges', '--clean', '--if-exists', source_db_url]
            
            with open(dump_path, 'w') as f:
                result = subprocess.run(dump_cmd, stdout=f, stderr=subprocess.PIPE, text=True)
            
            if result.returncode != 0:
                print(f"❌ Error creating database dump: {result.stderr}")
                return False
            
            print(f"   ✅ Production database dumped successfully")
            
            # Get dump file size for user feedback
            dump_size = os.path.getsize(dump_path) / (1024 * 1024)  # MB
            print(f"   📏 Dump file size: {dump_size:.1f} MB")
            
            # Drop and recreate target database schema
            print(f"\n💥 Dropping {target_name} database schema...")
            target_conn = psycopg2.connect(target_db_url)
            target_conn.set_session(autocommit=True)
            target_cursor = target_conn.cursor()
            
            # Drop all tables, views, functions, etc. in public schema
            target_cursor.execute("DROP SCHEMA public CASCADE;")
            target_cursor.execute("CREATE SCHEMA public;")
            target_cursor.execute("GRANT ALL ON SCHEMA public TO postgres;")
            target_cursor.execute("GRANT ALL ON SCHEMA public TO public;")
            
            target_cursor.close()
            target_conn.close()
            print(f"   ✅ {target_name.title()} schema dropped and recreated")
            
            # Restore from production dump
            print(f"\n📥 Restoring production data to {target_name}...")
            restore_cmd = ['psql', target_db_url, '-f', dump_path]
            
            result = subprocess.run(restore_cmd, capture_output=True, text=True)
            
            if result.returncode != 0:
                print(f"⚠️  Restore completed with warnings:")
                if result.stderr:
                    # Filter out common harmless warnings
                    stderr_lines = result.stderr.split('\n')
                    important_errors = [line for line in stderr_lines if line.strip() and 
                                      not any(harmless in line.lower() for harmless in 
                                            ['already exists', 'does not exist', 'warning:', 'notice:'])]
                    if important_errors:
                        for error in important_errors[:10]:  # Show first 10 important errors
                            print(f"   ⚠️  {error}")
                        if len(important_errors) > 10:
                            print(f"   ... and {len(important_errors) - 10} more warnings")
            else:
                print(f"   ✅ Database restored successfully")
            
        finally:
            # Clean up temp file
            if os.path.exists(dump_path):
                os.unlink(dump_path)
                print(f"   🧹 Cleaned up temporary dump file")
        
        # Verify the restoration
        print(f"\n🔍 Verifying restoration...")
        target_conn = psycopg2.connect(target_db_url)
        target_conn.set_session(autocommit=True)
        target_cursor = target_conn.cursor()
        
        # Check table count
        target_cursor.execute("""
        SELECT COUNT(*) FROM information_schema.tables 
        WHERE table_schema = 'public'
        """)
        table_count = target_cursor.fetchone()[0]
        
        # Check if alembic_version exists and get version
        target_cursor.execute("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'alembic_version'
        )
        """)
        has_alembic = target_cursor.fetchone()[0]
        
        migration_version = "None"
        if has_alembic:
            target_cursor.execute("SELECT version_num FROM alembic_version")
            version_result = target_cursor.fetchone()
            if version_result:
                migration_version = version_result[0]
        
        target_cursor.close()
        target_conn.close()
        
        print(f"   📊 Tables created: {table_count}")
        print(f"   🔄 Migration version: {migration_version}")
        
        print(f"\n🎉 SUCCESS: {target_name.title()} database completely rebuilt from production!")
        print(f"💡 Next steps:")
        print(f"   1. Verify your application works with {target_name}")
        print(f"   2. Deploy any new code changes")
        print(f"   3. Run 'flask db upgrade' if you have newer migrations")
        
        return True
        
    except subprocess.CalledProcessError as e:
        print(f"❌ Command execution error: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error during schema recreation: {str(e)}")
        return False

def migrate_database(source_db_url, target_db_url, target_name, sync_flask_migrations=False):
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

    # Check migration states before starting if syncing is enabled
    if sync_flask_migrations:
        print("\n" + "="*50)
        print("🔄 FLASK MIGRATION STATE SYNC ENABLED")
        print("="*50)
        prod_version = check_migration_state(source_db_url, "production")
        staging_version = check_migration_state(target_db_url, target_name)
        
        if prod_version != staging_version:
            print(f"\n🔄 Migration versions differ:")
            print(f"   Production: {prod_version}")
            print(f"   {target_name.title()}: {staging_version}")
            print(f"   Will sync {target_name} to production version...")
        else:
            print(f"\n✅ Migration versions already match: {prod_version}")

    # Get a list of all tables (conditionally include alembic_version)
    print("Getting list of tables...")
    exclude_alembic = "" if sync_flask_migrations else "AND table_name != 'alembic_version'"
    
    source_cursor.execute(f"""
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    {exclude_alembic}
    ORDER BY table_name
    """)
    tables = [row[0] for row in source_cursor.fetchall()]
    
    migration_included = "including" if sync_flask_migrations else "excluding"
    print(f"Found {len(tables)} tables ({migration_included} Flask migrations): {', '.join(tables)}")

    # Define a more comprehensive dependency order
    table_order = [
        # Core entities first (no dependencies)
        "organisation",
        "tennis_club",
        "user",
        "teaching_period",
        "tennis_group",
        
        # Secondary entities (depend on core entities)
        "tennis_group_times",
        "student", 
        "report_template",
        "template_section",
        "template_field",
        "programme_players",
        "coach_details",
        "club_feature",
        
        # Business logic entities (depend on secondary entities)
        "register",
        "register_entry",
        "register_assistant_coach",
        "report",
        "group_template", 
        "cancellation",
        "coaching_rate",
        "invoice",
        "invoice_line_item",
        "coach_invitation",
        "club_invitation"
    ]
    
    # Add alembic_version at the end if we're syncing Flask migrations
    if sync_flask_migrations and "alembic_version" in tables:
        table_order.append("alembic_version")

    # Validate all tables from DB are in our list
    missing_tables = set(tables) - set(table_order)
    if missing_tables:
        print(f"WARNING: These tables are missing from our order list: {', '.join(missing_tables)}")
        # Add missing tables to the end
        table_order.extend(list(missing_tables))

    extra_tables = set(table_order) - set(tables)
    if extra_tables:
        print(f"INFO: These tables in our order list don't exist in the DB: {', '.join(extra_tables)}")
        # Remove non-existent tables
        table_order = [t for t in table_order if t in tables]

    # Clear out target tables in reverse dependency order
    print(f"Clearing {target_name} tables...")
    target_cursor.execute("SET session_replication_role = 'replica';")  # Disable constraints temporarily
    for table in reversed(table_order):
        if table == "alembic_version":
            print(f"  🔄 Clearing Flask migration state from {table}...")
        else:
            print(f"  🗑️  Truncating table {table}...")
        target_cursor.execute(f'TRUNCATE TABLE "{table}" CASCADE;')
    target_cursor.execute("SET session_replication_role = 'origin';")  # Re-enable constraints

    # Copy data from source to target in the correct dependency order
    print(f"Copying data from production to {target_name}...")
    success_count = 0
    error_count = 0
    
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
        
        # Handle Flask migration table specially
        if table == "alembic_version":
            print(f"  🔄 Syncing Flask migration state from {table}...")
            query = f'SELECT {columns_str} FROM "{table}"'
        else:
            print(f"  📊 Copying table {table}...")
            # Build query with foreign key validation for data tables
            fk_where_clause = validate_foreign_keys(source_cursor, table, columns)
            base_query = f'SELECT {columns_str} FROM "{table}"'
            
            if fk_where_clause:
                query = f'{base_query} {fk_where_clause}'
                print(f"    🔍 Using filtered query for {table}")
            else:
                query = base_query
        
        try:
            source_cursor.execute(query)
            
            if has_jsonb:
                # For tables with JSONB, handle rows individually
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
                rows = source_cursor.fetchall()
            
        except Exception as e:
            print(f"    ❌ Error querying {table}: {str(e)}")
            error_count += 1
            continue
        
        if rows:
            # Prepare placeholders for insert statement
            placeholders = ', '.join(['%s'] * len(columns))
            
            # For alembic_version, insert directly (it's a single row usually)
            if table == "alembic_version":
                try:
                    target_cursor.executemany(
                        f'INSERT INTO "{table}" ({columns_str}) VALUES ({placeholders})',
                        rows
                    )
                    if len(rows) > 0:
                        print(f"    ✅ Synced Flask migration version: {rows[0][0]}")
                    else:
                        print(f"    ⚠️  No migration version to sync")
                    success_count += 1
                except Exception as e:
                    print(f"    ❌ Error syncing migration state: {str(e)}")
                    error_count += 1
            else:
                # Insert data into target in batches for regular tables
                batch_size = 1000
                inserted_rows = 0
                
                for i in range(0, len(rows), batch_size):
                    batch = rows[i:i+batch_size]
                    try:
                        target_cursor.executemany(
                            f'INSERT INTO "{table}" ({columns_str}) VALUES ({placeholders})',
                            batch
                        )
                        inserted_rows += len(batch)
                        print(f"    ✅ Inserted {len(batch)} rows (batch {i//batch_size + 1})")
                    except Exception as e:
                        print(f"    ❌ Error inserting batch into {table}: {str(e)}")
                        # Try inserting rows one by one to identify problematic rows
                        print("    🔧 Attempting row-by-row insert...")
                        for j, row_data in enumerate(batch):
                            try:
                                target_cursor.execute(
                                    f'INSERT INTO "{table}" ({columns_str}) VALUES ({placeholders})',
                                    row_data
                                )
                                inserted_rows += 1
                            except Exception as row_error:
                                print(f"    ⚠️  Skipping row {i + j + 1}: {str(row_error)}")
                                error_count += 1
                
                print(f"    ✅ Successfully inserted {inserted_rows} rows for {table}")
                success_count += 1
        else:
            if table == "alembic_version":
                print(f"    ⚠️  No Flask migration state to copy")
            else:
                print(f"    ℹ️  No data to copy for table {table}")
            success_count += 1

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
            print(f"Warning: Error resetting sequence: {str(e)}")

    # Final migration state check if syncing was enabled
    if sync_flask_migrations:
        print("\n" + "="*50)
        print("🎯 FINAL FLASK MIGRATION STATE")
        print("="*50)
        final_prod_version = check_migration_state(source_db_url, "production")
        final_target_version = check_migration_state(target_db_url, target_name)
        
        if final_prod_version == final_target_version:
            print(f"🎉 SUCCESS: Flask migration states now match!")
        else:
            print(f"⚠️  WARNING: Flask migration states still differ")

    print("Closing connections...")
    source_cursor.close()
    source_conn.close()
    target_cursor.close()
    target_conn.close()

    print(f"\nData migration to {target_name} completed!")
    print(f"✅ Successfully processed: {success_count} tables")
    if error_count > 0:
        print(f"⚠️  Errors encountered: {error_count} issues (see details above)")
    else:
        print("🎉 No errors encountered!")
    
    if sync_flask_migrations:
        print(f"\n🔄 Flask migration state synced from production to {target_name}")
        print(f"💡 Next steps:")
        print(f"   1. Deploy your code changes to {target_name}")
        print(f"   2. Run 'flask db upgrade' to apply any new migrations")
    else:
        print(f"\nℹ️  Flask migration state was NOT synced")
        print(f"💡 Use --sync-flask-migrations to enable Flask migration state sync")
    
    return True

def check_data_integrity(db_url, db_name):
    """Check for orphaned records in the database"""
    print(f"\nChecking data integrity in {db_name} database...")
    
    try:
        conn = psycopg2.connect(db_url)
        conn.set_session(autocommit=True)
        cursor = conn.cursor()
        
        # Check for orphaned reports
        cursor.execute("""
        SELECT COUNT(*) FROM report r 
        LEFT JOIN student s ON r.student_id = s.id 
        WHERE r.student_id IS NOT NULL AND s.id IS NULL
        """)
        orphaned_reports = cursor.fetchone()[0]
        
        # Check for orphaned registers
        cursor.execute("""
        SELECT COUNT(*) FROM register r 
        LEFT JOIN "user" u ON r.coach_id = u.id 
        WHERE r.coach_id IS NOT NULL AND u.id IS NULL
        """)
        orphaned_registers = cursor.fetchone()[0]
        
        print(f"  Orphaned reports (missing students): {orphaned_reports}")
        print(f"  Orphaned registers (missing coaches): {orphaned_registers}")
        
        cursor.close()
        conn.close()
        
        return orphaned_reports == 0 and orphaned_registers == 0
        
    except Exception as e:
        print(f"Error checking data integrity: {str(e)}")
        return False

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
    parser.add_argument('--check-integrity', action='store_true',
                       help='Check data integrity before migration')
    parser.add_argument('--sync-flask-migrations', action='store_true',
                       help='Also sync Flask migration state (alembic_version table) from production')
    parser.add_argument('--check-migration-state', action='store_true',
                       help='Only check and display current Flask migration states')
    parser.add_argument('--drop-and-recreate', action='store_true',
                       help='🚨 DESTRUCTIVE: Completely drop and recreate database schema from production (nuclear option)')
    
    args = parser.parse_args()
    
    # Validate flag combinations
    if args.drop_and_recreate and args.sync_flask_migrations:
        print("ℹ️  Note: --sync-flask-migrations is redundant with --drop-and-recreate")
        print("    (Migration state will be copied automatically with full schema recreation)")
    
    if args.drop_and_recreate and args.check_integrity:
        print("ℹ️  Note: --check-integrity is skipped with --drop-and-recreate")
        print("    (Data integrity will be ensured by complete schema recreation)")
    
    # Check migration state only if requested
    if args.check_migration_state:
        print("🔍 CHECKING FLASK MIGRATION STATES")
        print("="*40)
        check_migration_state(PROD_DB_URL, "production")
        
        if args.target == 'staging' and STAGING_DB_URL:
            check_migration_state(STAGING_DB_URL, "staging")
        elif args.target == 'local':
            print("\n📝 Local database details needed for migration state check:")
            local_user = input("Enter local PostgreSQL username [postgres]: ") or "postgres"
            local_password = getpass.getpass("Enter local PostgreSQL password: ")
            local_host = input("Enter local PostgreSQL host [localhost]: ") or "localhost"
            local_port = input("Enter local PostgreSQL port [5432]: ") or "5432"
            local_db = input("Enter local PostgreSQL database name: ")
            
            LOCAL_DB_URL = f"postgresql://{local_user}:{local_password}@{local_host}:{local_port}/{local_db}"
            check_migration_state(LOCAL_DB_URL, "local")
        else:
            print("ℹ️  To check other environments, specify --target local or --target staging")
        
        sys.exit(0)
    
    # Check production data integrity if requested (skip for drop-and-recreate)
    if args.check_integrity and not args.drop_and_recreate:
        is_clean = check_data_integrity(PROD_DB_URL, "production")
        if not is_clean:
            print("\n⚠️  Production database has data integrity issues.")
            print("The migration will attempt to filter out orphaned records.")
            proceed = input("Do you want to proceed with filtered migration? (y/N): ")
            if proceed.lower() != 'y':
                print("Migration cancelled.")
                sys.exit(1)
    
    target = args.target
    
    # If target not provided via command line, prompt the user
    if not target:
        print("🎯 Select target environment to refresh:")
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
    
    # Show Flask migration sync status
    if args.drop_and_recreate:
        print("\n💥 DROP AND RECREATE MODE: ENABLED")
        print("   ⚠️  This will COMPLETELY REBUILD the target database from production!")
        print("   ⚠️  This is a DESTRUCTIVE operation - all data will be lost!")
        if args.sync_flask_migrations:
            print("   ℹ️  Migration sync flag ignored in drop-and-recreate mode")
    elif args.sync_flask_migrations:
        print("\n🔄 Flask migration sync: ENABLED")
        print("   This will copy the alembic_version table from production")
    else:
        print("\n📝 Flask migration sync: DISABLED")
        print("   Use --sync-flask-migrations to enable Flask migration state sync")
    
    if target == 'local':
        # Get local database connection details
        local_user = input("Enter local PostgreSQL username [postgres]: ") or "postgres"
        local_password = getpass.getpass("Enter local PostgreSQL password: ")
        local_host = input("Enter local PostgreSQL host [localhost]: ") or "localhost"
        local_port = input("Enter local PostgreSQL port [5432]: ") or "5432"
        local_db = input("Enter local PostgreSQL database name: ")
        
        LOCAL_DB_URL = f"postgresql://{local_user}:{local_password}@{local_host}:{local_port}/{local_db}"
        
        if args.drop_and_recreate:
            print("🚀 Dropping and recreating local database from production...")
            drop_and_recreate_schema(PROD_DB_URL, LOCAL_DB_URL, "local")
        else:
            print("🚀 Refreshing local database from production...")
            migrate_database(PROD_DB_URL, LOCAL_DB_URL, "local", args.sync_flask_migrations)
        
    elif target == 'staging':
        if args.drop_and_recreate:
            print("🚀 Dropping and recreating staging database from production...")
            drop_and_recreate_schema(PROD_DB_URL, STAGING_DB_URL, "staging")
        else:
            print("🚀 Refreshing staging database from production...")
            migrate_database(PROD_DB_URL, STAGING_DB_URL, "staging", args.sync_flask_migrations)
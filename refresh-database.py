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

def get_table_dependency_order(cursor):
    """Get tables in dependency order by analyzing foreign key constraints"""
    print("🔍 Analyzing foreign key dependencies...")
    
    # Get all foreign key relationships
    cursor.execute("""
    SELECT 
        tc.table_name as child_table,
        ccu.table_name as parent_table
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND ccu.table_schema = 'public'
    """)
    
    dependencies = cursor.fetchall()
    
    # Get all tables
    cursor.execute("""
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    ORDER BY table_name
    """)
    all_tables = {row[0] for row in cursor.fetchall()}
    
    # Build dependency graph
    depends_on = {table: set() for table in all_tables}
    for child, parent in dependencies:
        if child != parent:  # Ignore self-references
            depends_on[child].add(parent)
    
    # Topological sort
    ordered_tables = []
    remaining_tables = set(all_tables)
    
    while remaining_tables:
        # Find tables with no unresolved dependencies
        ready_tables = [
            table for table in remaining_tables 
            if not (depends_on[table] & remaining_tables)
        ]
        
        if not ready_tables:
            # Handle circular dependencies - just pick the next table
            ready_tables = [min(remaining_tables)]
            print(f"  ⚠️  Breaking circular dependency, processing: {ready_tables[0]}")
        
        # Sort ready tables for consistent ordering
        ready_tables.sort()
        ordered_tables.extend(ready_tables)
        remaining_tables -= set(ready_tables)
    
    print(f"  ✅ Determined processing order for {len(ordered_tables)} tables")
    return ordered_tables

def copy_table_data(source_cursor, target_cursor, table_name):
    """Copy all data from source table to target table"""
    
    # Get column information
    source_cursor.execute(f"""
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = '{table_name}'
    ORDER BY ordinal_position
    """)
    columns_info = source_cursor.fetchall()
    
    if not columns_info:
        print(f"    ⚠️  No columns found for table {table_name}")
        return 0
    
    columns = [col[0] for col in columns_info]
    columns_str = ', '.join([f'"{col}"' for col in columns])
    
    # Check if table has JSONB columns for special handling
    jsonb_columns = [col[0] for col in columns_info if col[1] in ('json', 'jsonb')]
    has_jsonb = len(jsonb_columns) > 0
    
    try:
        # Get data from source
        source_cursor.execute(f'SELECT {columns_str} FROM "{table_name}"')
        
        if has_jsonb:
            # For tables with JSONB, handle rows individually
            rows = []
            for row in source_cursor:
                processed_row = list(row)
                # Convert Python dicts to JSON strings for JSONB columns
                for i, col in enumerate(columns):
                    if col in jsonb_columns and processed_row[i] is not None:
                        if isinstance(processed_row[i], (dict, list)):
                            processed_row[i] = json.dumps(processed_row[i])
                rows.append(processed_row)
        else:
            # For normal tables, fetch all rows at once
            rows = source_cursor.fetchall()
        
        if not rows:
            print(f"    ℹ️  No data to copy for table {table_name}")
            return 0
        
        # Insert data into target in batches
        placeholders = ', '.join(['%s'] * len(columns))
        batch_size = 1000
        total_inserted = 0
        
        for i in range(0, len(rows), batch_size):
            batch = rows[i:i+batch_size]
            try:
                target_cursor.executemany(
                    f'INSERT INTO "{table_name}" ({columns_str}) VALUES ({placeholders})',
                    batch
                )
                total_inserted += len(batch)
                if len(rows) > batch_size:
                    print(f"    📦 Copied batch {i//batch_size + 1} ({len(batch)} rows)")
                
            except Exception as e:
                print(f"    ❌ Error inserting batch: {str(e)}")
                # Try inserting rows one by one to identify problematic rows
                print("    🔧 Attempting row-by-row insert...")
                for j, row_data in enumerate(batch):
                    try:
                        target_cursor.execute(
                            f'INSERT INTO "{table_name}" ({columns_str}) VALUES ({placeholders})',
                            row_data
                        )
                        total_inserted += 1
                    except Exception as row_error:
                        print(f"    ⚠️  Skipping row {i + j + 1}: {str(row_error)}")
        
        print(f"    ✅ Successfully copied {total_inserted} rows")
        return total_inserted
        
    except Exception as e:
        print(f"    ❌ Error copying table {table_name}: {str(e)}")
        return 0

def migrate_database(source_db_url, target_db_url, target_name, sync_flask_migrations=False):
    """Migrate all data from source to target database"""
    
    # Connect to both databases
    print(f"🔌 Connecting to production and {target_name} databases...")
    
    try:
        source_conn = psycopg2.connect(source_db_url)
        source_conn.set_session(autocommit=True)
        source_cursor = source_conn.cursor()

        target_conn = psycopg2.connect(target_db_url)
        target_conn.set_session(autocommit=True)
        target_cursor = target_conn.cursor()
    except Exception as e:
        print(f"❌ Error connecting to databases: {str(e)}")
        return False

    try:
        # Check migration states before starting if syncing is enabled
        if sync_flask_migrations:
            print("\n" + "="*50)
            print("🔄 FLASK MIGRATION STATE SYNC ENABLED")
            print("="*50)
            prod_version = check_migration_state(source_db_url, "production")
            target_version = check_migration_state(target_db_url, target_name)
            
            if prod_version != target_version:
                print(f"\n🔄 Migration versions differ:")
                print(f"   Production: {prod_version}")
                print(f"   {target_name.title()}: {target_version}")
                print(f"   Will sync {target_name} to production version...")
            else:
                print(f"\n✅ Migration versions already match: {prod_version}")

        # Get table dependency order
        table_order = get_table_dependency_order(source_cursor)
        
        # Filter out alembic_version if not syncing migrations
        if not sync_flask_migrations and 'alembic_version' in table_order:
            table_order.remove('alembic_version')
            print(f"📝 Excluding alembic_version table (Flask migration sync disabled)")
        
        print(f"\n📊 Will process {len(table_order)} tables in dependency order")
        
        # STEP 1: Disable foreign key constraints in target database
        print(f"\n🔓 Disabling foreign key constraints in {target_name}...")
        target_cursor.execute("SET session_replication_role = 'replica';")
        print(f"   ✅ Constraints disabled")
        
        # STEP 2: Clear target tables in reverse dependency order
        print(f"\n🗑️  Clearing {target_name} tables...")
        for table in reversed(table_order):
            try:
                target_cursor.execute(f'TRUNCATE TABLE "{table}" CASCADE;')
                print(f"   🧹 Cleared {table}")
            except Exception as e:
                print(f"   ⚠️  Could not clear {table}: {str(e)}")
        
        # STEP 3: Copy data in dependency order
        print(f"\n📋 Copying data from production to {target_name}...")
        success_count = 0
        total_rows_copied = 0
        
        for table in table_order:
            if table == "alembic_version":
                print(f"  🔄 Syncing Flask migration state from {table}...")
            else:
                print(f"  📊 Copying table {table}...")
            
            rows_copied = copy_table_data(source_cursor, target_cursor, table)
            total_rows_copied += rows_copied
            success_count += 1
        
        # STEP 4: Reset sequences
        print(f"\n🔢 Resetting sequences in {target_name}...")
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

        sequences_reset = 0
        for seq_update in seq_updates:
            try:
                target_cursor.execute(seq_update[0])
                sequences_reset += 1
            except Exception as e:
                print(f"   ⚠️  Error resetting sequence: {str(e)}")
        
        print(f"   ✅ Reset {sequences_reset} sequences")
        
        # STEP 5: Re-enable foreign key constraints
        print(f"\n🔒 Re-enabling foreign key constraints in {target_name}...")
        target_cursor.execute("SET session_replication_role = 'origin';")
        print(f"   ✅ Constraints re-enabled")
        
        # STEP 6: Verify foreign key integrity
        print(f"\n🔍 Verifying foreign key integrity...")
        target_cursor.execute("""
        SELECT 
            tc.table_name,
            tc.constraint_name
        FROM information_schema.table_constraints tc
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        """)
        fk_constraints = target_cursor.fetchall()
        
        integrity_issues = 0
        for table_name, constraint_name in fk_constraints[:10]:  # Check first 10 constraints
            try:
                # This will fail if there are integrity issues
                target_cursor.execute(f"""
                SELECT 1 FROM "{table_name}" LIMIT 1
                """)
            except Exception as e:
                print(f"   ⚠️  Integrity issue in {table_name}: {constraint_name}")
                integrity_issues += 1
        
        if integrity_issues == 0:
            print(f"   ✅ Foreign key integrity verified")
        else:
            print(f"   ⚠️  Found {integrity_issues} potential integrity issues")

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

        print(f"\n🎉 Data migration to {target_name} completed successfully!")
        print(f"📊 Statistics:")
        print(f"   ✅ Tables processed: {success_count}")
        print(f"   📝 Total rows copied: {total_rows_copied:,}")
        print(f"   🔢 Sequences reset: {sequences_reset}")
        
        if sync_flask_migrations:
            print(f"\n🔄 Flask migration state synced from production to {target_name}")
            print(f"💡 Next steps:")
            print(f"   1. Deploy your code changes to {target_name}")
            print(f"   2. Run 'flask db upgrade' to apply any new migrations")
        else:
            print(f"\nℹ️  Flask migration state was NOT synced")
            print(f"💡 Use --sync-flask-migrations to enable Flask migration state sync")
        
        return True
        
    except Exception as e:
        print(f"❌ Error during migration: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        # Always clean up connections
        print(f"\n🔌 Closing database connections...")
        try:
            source_cursor.close()
            source_conn.close()
            target_cursor.close()
            target_conn.close()
        except:
            pass

def check_data_integrity(db_url, db_name):
    """Check for data integrity in the database"""
    print(f"\n🔍 Checking data integrity in {db_name} database...")
    
    try:
        conn = psycopg2.connect(db_url)
        conn.set_session(autocommit=True)
        cursor = conn.cursor()
        
        # Get total table count
        cursor.execute("""
        SELECT COUNT(*) FROM information_schema.tables 
        WHERE table_schema = 'public'
        """)
        table_count = cursor.fetchone()[0]
        
        # Get total row count across all tables
        cursor.execute("""
        SELECT schemaname, tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
        """)
        tables = cursor.fetchall()
        
        total_rows = 0
        for schema, table in tables:
            try:
                cursor.execute(f'SELECT COUNT(*) FROM "{table}"')
                count = cursor.fetchone()[0]
                total_rows += count
            except:
                pass
        
        print(f"  📊 Tables: {table_count}")
        print(f"  📝 Total rows: {total_rows:,}")
        
        cursor.close()
        conn.close()
        
        return True
        
    except Exception as e:
        print(f"  ❌ Error checking data integrity: {str(e)}")
        return False

if __name__ == "__main__":
    # Get database connection details from environment variables
    PROD_DB_URL = os.getenv("PROD_DATABASE_URL")
    STAGING_DB_URL = os.getenv("STAGING_DATABASE_URL")
    
    # Check if environment variables are set
    if not PROD_DB_URL:
        print("❌ Error: PROD_DATABASE_URL environment variable is not set.")
        sys.exit(1)
    
    if not STAGING_DB_URL:
        print("⚠️  Warning: STAGING_DATABASE_URL environment variable is not set.")
    
    # Set up argument parser
    parser = argparse.ArgumentParser(description="Refresh database from production")
    parser.add_argument('--target', choices=['local', 'staging'], 
                       help='Target environment to refresh (local or staging)')
    parser.add_argument('--check-integrity', action='store_true',
                       help='Check data integrity before and after migration')
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
                print("❌ Error: STAGING_DATABASE_URL environment variable is not set but staging was selected.")
                sys.exit(1)
        else:
            print("❌ Invalid choice. Exiting.")
            sys.exit(1)
    
    # Show current operation mode
    if args.drop_and_recreate:
        print("\n💥 DROP AND RECREATE MODE: ENABLED")
        print("   ⚠️  This will COMPLETELY REBUILD the target database from production!")
        print("   ⚠️  This is a DESTRUCTIVE operation - all data will be lost!")
        if args.sync_flask_migrations:
            print("   ℹ️  Migration sync flag ignored in drop-and-recreate mode")
    else:
        print(f"\n📋 COPY ALL DATA MODE: ENABLED")
        print(f"   ✅ This will copy ALL records from production to {target}")
        print(f"   🔧 Foreign key constraints will be handled automatically")
        if args.sync_flask_migrations:
            print("   🔄 Flask migration sync: ENABLED")
        else:
            print("   📝 Flask migration sync: DISABLED")
    
    # Check production data integrity if requested
    if args.check_integrity:
        print("\n🔍 PRE-MIGRATION INTEGRITY CHECK")
        print("="*40)
        check_data_integrity(PROD_DB_URL, "production")
    
    if target == 'local':
        # Get local database connection details
        print(f"\n📝 Local database connection details:")
        local_user = input("Enter local PostgreSQL username [postgres]: ") or "postgres"
        local_password = getpass.getpass("Enter local PostgreSQL password: ")
        local_host = input("Enter local PostgreSQL host [localhost]: ") or "localhost"
        local_port = input("Enter local PostgreSQL port [5432]: ") or "5432"
        local_db = input("Enter local PostgreSQL database name: ")
        
        LOCAL_DB_URL = f"postgresql://{local_user}:{local_password}@{local_host}:{local_port}/{local_db}"
        
        if args.drop_and_recreate:
            print("\n🚀 Dropping and recreating local database from production...")
            success = drop_and_recreate_schema(PROD_DB_URL, LOCAL_DB_URL, "local")
        else:
            print("\n🚀 Copying ALL data from production to local database...")
            success = migrate_database(PROD_DB_URL, LOCAL_DB_URL, "local", args.sync_flask_migrations)
        
    elif target == 'staging':
        if args.drop_and_recreate:
            print("\n🚀 Dropping and recreating staging database from production...")
            success = drop_and_recreate_schema(PROD_DB_URL, STAGING_DB_URL, "staging")
        else:
            print("\n🚀 Copying ALL data from production to staging database...")
            success = migrate_database(PROD_DB_URL, STAGING_DB_URL, "staging", args.sync_flask_migrations)
    
    # Check integrity after migration if requested
    if args.check_integrity and success and not args.drop_and_recreate:
        print("\n🔍 POST-MIGRATION INTEGRITY CHECK")
        print("="*40)
        if target == 'local':
            check_data_integrity(LOCAL_DB_URL, "local")
        elif target == 'staging':
            check_data_integrity(STAGING_DB_URL, "staging")
    
    if success:
        print(f"\n🎉 Database refresh completed successfully!")
    else:
        print(f"\n❌ Database refresh failed!")
        sys.exit(1)
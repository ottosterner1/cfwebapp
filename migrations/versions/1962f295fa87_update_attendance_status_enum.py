"""update_attendance_status_enum

Revision ID: 1962f295fa87
Revises: 878c74d82001
Create Date: 2025-04-17 10:56:58.528205

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '1962f295fa87'
down_revision = '878c74d82001'
branch_labels = None
depends_on = None


def upgrade():
    # Create a temporary conversion function
    op.execute("""
    CREATE OR REPLACE FUNCTION convert_attendance_status(old_status attendancestatus) 
    RETURNS text AS $$
    BEGIN
        RETURN CASE old_status::text
            WHEN 'PRESENT' THEN 'present'
            WHEN 'ABSENT' THEN 'absent'
            WHEN 'EXCUSED' THEN 'away with notice'
            WHEN 'LATE' THEN 'present'
        END;
    END;
    $$ LANGUAGE plpgsql;
    """)
    
    # Store current values with the mapped new values
    op.execute("""
    CREATE TEMPORARY TABLE register_entry_temp AS
    SELECT id, convert_attendance_status(attendance_status) as new_status
    FROM register_entry;
    """)
    
    # Create the new enum type
    op.execute("ALTER TYPE attendancestatus RENAME TO attendancestatus_old")
    op.execute("CREATE TYPE attendancestatus AS ENUM ('present', 'absent', 'sick', 'away with notice')")
    
    # Convert column to text temporarily
    op.execute("ALTER TABLE register_entry ALTER COLUMN attendance_status TYPE text USING attendance_status::text")
    
    # Update values to match new enum values
    op.execute("""
    UPDATE register_entry re
    SET attendance_status = ret.new_status
    FROM register_entry_temp ret
    WHERE re.id = ret.id
    """)
    
    # Convert column back to enum type
    op.execute("ALTER TABLE register_entry ALTER COLUMN attendance_status TYPE attendancestatus USING attendance_status::attendancestatus")
    
    # Clean up
    op.execute("DROP FUNCTION convert_attendance_status")
    op.execute("DROP TABLE register_entry_temp")
    op.execute("DROP TYPE attendancestatus_old")


def downgrade():
    # Create the old enum type again
    op.execute("ALTER TYPE attendancestatus RENAME TO attendancestatus_new")
    op.execute("CREATE TYPE attendancestatus AS ENUM ('PRESENT', 'ABSENT', 'EXCUSED', 'LATE')")
    
    # Create a temporary mapping function
    op.execute("""
    CREATE OR REPLACE FUNCTION reverse_attendance_status(new_status text) 
    RETURNS attendancestatus AS $$
    BEGIN
        RETURN CASE new_status
            WHEN 'present' THEN 'PRESENT'::attendancestatus
            WHEN 'absent' THEN 'ABSENT'::attendancestatus
            WHEN 'sick' THEN 'EXCUSED'::attendancestatus
            WHEN 'away with notice' THEN 'EXCUSED'::attendancestatus
        END;
    END;
    $$ LANGUAGE plpgsql;
    """)
    
    # Store current values with reversed mapping
    op.execute("""
    CREATE TEMPORARY TABLE register_entry_temp AS
    SELECT id, reverse_attendance_status(attendance_status::text) as old_status
    FROM register_entry;
    """)
    
    # Convert column to text temporarily
    op.execute("ALTER TABLE register_entry ALTER COLUMN attendance_status TYPE text USING attendance_status::text")
    
    # Update values to match old enum values
    op.execute("""
    UPDATE register_entry re
    SET attendance_status = ret.old_status::text
    FROM register_entry_temp ret
    WHERE re.id = ret.id
    """)
    
    # Convert column back to enum type
    op.execute("ALTER TABLE register_entry ALTER COLUMN attendance_status TYPE attendancestatus USING attendance_status::attendancestatus")
    
    # Clean up
    op.execute("DROP FUNCTION reverse_attendance_status")
    op.execute("DROP TABLE register_entry_temp")
    op.execute("DROP TYPE attendancestatus_new")

"""update_attendance_status_enum 2

Revision ID: ff2deb2c4c78
Revises: 1962f295fa87
Create Date: 2025-04-17 11:08:21.468377

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'ff2deb2c4c78'
down_revision = '1962f295fa87'
branch_labels = None
depends_on = None


def upgrade():
    # Create a temporary conversion function
    op.execute("""
    CREATE OR REPLACE FUNCTION convert_attendance_status(old_status attendancestatus) 
    RETURNS text AS $$
    BEGIN
        RETURN CASE old_status::text
            WHEN 'present' THEN 'PRESENT'
            WHEN 'absent' THEN 'ABSENT'
            WHEN 'sick' THEN 'SICK'
            WHEN 'away with notice' THEN 'AWAY_WITH_NOTICE'
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
    
    # Create the new enum type with uppercase values
    op.execute("ALTER TYPE attendancestatus RENAME TO attendancestatus_old")
    op.execute("CREATE TYPE attendancestatus AS ENUM ('PRESENT', 'ABSENT', 'SICK', 'AWAY_WITH_NOTICE')")
    
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
    # Create the old enum type again with lowercase values
    op.execute("ALTER TYPE attendancestatus RENAME TO attendancestatus_new")
    op.execute("CREATE TYPE attendancestatus AS ENUM ('present', 'absent', 'sick', 'away with notice')")
    
    # Create a temporary mapping function
    op.execute("""
    CREATE OR REPLACE FUNCTION reverse_attendance_status(new_status text) 
    RETURNS attendancestatus AS $$
    BEGIN
        RETURN CASE new_status
            WHEN 'PRESENT' THEN 'present'::attendancestatus
            WHEN 'ABSENT' THEN 'absent'::attendancestatus
            WHEN 'SICK' THEN 'sick'::attendancestatus
            WHEN 'AWAY_WITH_NOTICE' THEN 'away with notice'::attendancestatus
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

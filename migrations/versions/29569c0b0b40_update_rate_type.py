"""update rate type

Revision ID: 29569c0b0b40
Revises: fecb7503c2ca
Create Date: 2025-05-20 07:21:01.581710

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '29569c0b0b40'
down_revision = 'fecb7503c2ca'
branch_labels = None
depends_on = None


def upgrade():
    # Create the enum type first
    ratetype = postgresql.ENUM('lead', 'assistant', 'admin', 'other', name='ratetype')
    ratetype.create(op.get_bind())
    
    # Add the column with NULL allowed initially
    op.add_column('coaching_rate', sa.Column('rate_type', sa.Enum('lead', 'assistant', 'admin', 'other', 
                                                                 name='ratetype'), 
                                            nullable=True))
    
    # Update existing entries with appropriate rate_type values based on name patterns
    op.execute("""
        UPDATE coaching_rate 
        SET rate_type = 
            CASE 
                WHEN lower(rate_name) LIKE '%assistant%' THEN 'assistant'::ratetype
                WHEN lower(rate_name) LIKE '%lead%' OR lower(rate_name) LIKE '%group%' OR 
                     lower(rate_name) LIKE '%private%' THEN 'lead'::ratetype
                WHEN lower(rate_name) LIKE '%admin%' THEN 'admin'::ratetype
                ELSE 'other'::ratetype
            END
    """)
    
    # Make the column NOT NULL with default value
    op.alter_column('coaching_rate', 'rate_type', nullable=False,
                    server_default=sa.text("'other'::ratetype"))


def downgrade():
    # Remove the column
    op.drop_column('coaching_rate', 'rate_type')
    
    # Drop the enum type
    op.execute('DROP TYPE ratetype')
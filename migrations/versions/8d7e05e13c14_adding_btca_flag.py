"""adding btca flag

Revision ID: 8d7e05e13c14
Revises: 3eddda3a0ecd
Create Date: 2025-05-23 07:09:29.466736

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '8d7e05e13c14'
down_revision = '3eddda3a0ecd'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    
    # Step 1: Add a new column of the correct type
    op.add_column('coach_details', sa.Column('bcta_accreditation_new', sa.DateTime(timezone=True), nullable=True))
    
    # Step 2: Create SQL to set NULL for all rows since we're not preserving data
    op.execute("UPDATE coach_details SET bcta_accreditation_new = NULL")
    
    # Step 3: Drop the old column
    op.drop_column('coach_details', 'bcta_accreditation')
    
    # Step 4: Rename the new column to the original name
    op.alter_column('coach_details', 'bcta_accreditation_new', new_column_name='bcta_accreditation')
    
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    
    # If you need to revert:
    op.add_column('coach_details', sa.Column('bcta_accreditation_old', sa.VARCHAR(length=10), autoincrement=False, nullable=True))
    op.execute("UPDATE coach_details SET bcta_accreditation_old = 'N/A'")
    op.drop_column('coach_details', 'bcta_accreditation')
    op.alter_column('coach_details', 'bcta_accreditation_old', new_column_name='bcta_accreditation')
    
    # ### end Alembic commands ###

"""Making document hub organisation wide

Revision ID: 73a16a7c48e6
Revises: 5798f17071d5
Create Date: 2025-06-25 18:54:51.267838

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = '73a16a7c48e6'
down_revision = '5798f17071d5'
branch_labels = None
depends_on = None


def upgrade():
    """Convert documents from club-based to organisation-based"""
    
    # Step 1: Add organisation_id column (nullable initially)
    with op.batch_alter_table('document', schema=None) as batch_op:
        batch_op.add_column(sa.Column('organisation_id', sa.Integer(), nullable=True))
    
    # Step 2: Add foreign key constraint to organisation_id
    with op.batch_alter_table('document', schema=None) as batch_op:
        batch_op.create_foreign_key(
            'fk_document_organisation_id', 
            'organisation', 
            ['organisation_id'], 
            ['id']
        )
    
    # Step 3: Populate organisation_id from tennis_club_id
    # This joins document -> tennis_club -> organisation to get the organisation_id
    connection = op.get_bind()
    connection.execute(text("""
        UPDATE document 
        SET organisation_id = tc.organisation_id
        FROM tennis_club tc 
        WHERE document.tennis_club_id = tc.id
    """))
    
    # Step 4: Make organisation_id non-nullable now that it's populated
    with op.batch_alter_table('document', schema=None) as batch_op:
        batch_op.alter_column('organisation_id', nullable=False)
    
    # Step 5: Drop old index related to tennis_club_id
    with op.batch_alter_table('document', schema=None) as batch_op:
        batch_op.drop_index('idx_document_club')
    
    # Step 6: Create new index for organisation_id
    with op.batch_alter_table('document', schema=None) as batch_op:
        batch_op.create_index('idx_document_organisation', ['organisation_id'])
    
    # Step 7: Drop foreign key constraint for tennis_club_id
    with op.batch_alter_table('document', schema=None) as batch_op:
        batch_op.drop_constraint('document_tennis_club_id_fkey', type_='foreignkey')
    
    # Step 8: Drop the tennis_club_id column
    with op.batch_alter_table('document', schema=None) as batch_op:
        batch_op.drop_column('tennis_club_id')


def downgrade():
    """Revert back to club-based documents"""
    
    # Step 1: Add tennis_club_id column back (nullable initially)
    with op.batch_alter_table('document', schema=None) as batch_op:
        batch_op.add_column(sa.Column('tennis_club_id', sa.INTEGER(), autoincrement=False, nullable=True))
    
    # Step 2: Add foreign key constraint
    with op.batch_alter_table('document', schema=None) as batch_op:
        batch_op.create_foreign_key('document_tennis_club_id_fkey', 'tennis_club', ['tennis_club_id'], ['id'])
    
    # Step 3: Populate tennis_club_id from organisation_id
    # This is tricky - we need to pick one club per organisation for each document
    # We'll use the club of the coach the document was uploaded for
    connection = op.get_bind()
    connection.execute(text("""
        UPDATE document 
        SET tennis_club_id = u.tennis_club_id
        FROM "user" u 
        WHERE document.uploaded_for_coach_id = u.id
    """))
    
    # Step 4: Make tennis_club_id non-nullable
    with op.batch_alter_table('document', schema=None) as batch_op:
        batch_op.alter_column('tennis_club_id', nullable=False)
    
    # Step 5: Drop organisation indexes and constraints
    with op.batch_alter_table('document', schema=None) as batch_op:
        batch_op.drop_constraint('fk_document_organisation_id', type_='foreignkey')
        batch_op.drop_index('idx_document_organisation')
    
    # Step 6: Create old index
    with op.batch_alter_table('document', schema=None) as batch_op:
        batch_op.create_index('idx_document_club', ['tennis_club_id'], unique=False)
    
    # Step 7: Drop organisation_id column
    with op.batch_alter_table('document', schema=None) as batch_op:
        batch_op.drop_column('organisation_id')
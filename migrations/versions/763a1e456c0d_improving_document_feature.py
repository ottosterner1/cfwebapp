"""improving document feature

Revision ID: 763a1e456c0d
Revises: d40d574b0401
Create Date: 2025-06-28 10:43:31.484060

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '763a1e456c0d'
down_revision = 'd40d574b0401'
branch_labels = None
depends_on = None


def upgrade():
    # Create document_acknowledgment table (this part is correct)
    op.create_table('document_acknowledgment',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('document_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('acknowledged_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.Column('ip_address', sa.String(length=45), nullable=True),
    sa.Column('user_agent', sa.String(length=500), nullable=True),
    sa.Column('signature', sa.String(length=255), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.ForeignKeyConstraint(['document_id'], ['document.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('document_id', 'user_id', name='unique_document_user_acknowledgment')
    )
    with op.batch_alter_table('document_acknowledgment', schema=None) as batch_op:
        batch_op.create_index('idx_acknowledgment_date', ['acknowledged_at'], unique=False)
        batch_op.create_index('idx_acknowledgment_document', ['document_id'], unique=False)
        batch_op.create_index('idx_acknowledgment_user', ['user_id'], unique=False)

    # ADD THESE MISSING OPERATIONS for the document table:
    with op.batch_alter_table('document', schema=None) as batch_op:
        # Remove the is_global column
        
        # Add acknowledgment columns
        batch_op.add_column(sa.Column('requires_acknowledgment', sa.Boolean(), nullable=False, default=False))
        batch_op.add_column(sa.Column('acknowledgment_deadline', sa.DateTime(timezone=True), nullable=True))
        
        # Make uploaded_for_coach_id non-nullable (if it's currently nullable)
        batch_op.alter_column('uploaded_for_coach_id', nullable=False)
        
        # Add new index for acknowledgment required
        batch_op.create_index('idx_document_acknowledgment_required', ['requires_acknowledgment'], unique=False)


def downgrade():
    # Drop document_acknowledgment table
    with op.batch_alter_table('document_acknowledgment', schema=None) as batch_op:
        batch_op.drop_index('idx_acknowledgment_user')
        batch_op.drop_index('idx_acknowledgment_document')
        batch_op.drop_index('idx_acknowledgment_date')
    op.drop_table('document_acknowledgment')
    
    # Reverse changes to document table
    with op.batch_alter_table('document', schema=None) as batch_op:
        # Add back is_global column
        
        # Remove acknowledgment columns
        batch_op.drop_index('idx_document_acknowledgment_required')
        batch_op.drop_column('acknowledgment_deadline')
        batch_op.drop_column('requires_acknowledgment')
        
        # Make uploaded_for_coach_id nullable again (if needed)
        batch_op.alter_column('uploaded_for_coach_id', nullable=True)
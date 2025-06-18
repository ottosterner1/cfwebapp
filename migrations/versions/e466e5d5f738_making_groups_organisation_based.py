"""Making groups organisation based

Revision ID: e466e5d5f738
Revises: e17312a92b88
Create Date: 2025-06-18 16:02:38.253651

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'e466e5d5f738'
down_revision = 'e17312a92b88'
branch_labels = None
depends_on = None


def upgrade():
    # Add organisation_id column to tennis_group (nullable first)
    op.add_column('tennis_group', sa.Column('organisation_id', sa.Integer(), nullable=True))
    
    # Populate organisation_id based on existing tennis_club_id
    op.execute("""
        UPDATE tennis_group 
        SET organisation_id = (
            SELECT organisation_id 
            FROM tennis_club 
            WHERE tennis_club.id = tennis_group.tennis_club_id
        )
    """)
    
    # Make organisation_id NOT NULL and add foreign key
    op.alter_column('tennis_group', 'organisation_id', nullable=False)
    op.create_foreign_key('fk_tennis_group_organisation', 'tennis_group', 'organisation', ['organisation_id'], ['id'])
    
    # Drop old foreign key and column
    op.drop_constraint('tennis_group_tennis_club_id_fkey', 'tennis_group', type_='foreignkey')
    op.drop_column('tennis_group', 'tennis_club_id')


def downgrade():
    # Add tennis_club_id column back (nullable first)
    op.add_column('tennis_group', sa.Column('tennis_club_id', sa.Integer(), nullable=True))
    
    # Populate tennis_club_id from organisation_id (using first club in organisation)
    op.execute("""
        UPDATE tennis_group 
        SET tennis_club_id = (
            SELECT MIN(id) 
            FROM tennis_club 
            WHERE tennis_club.organisation_id = tennis_group.organisation_id
        )
    """)
    
    # Make tennis_club_id NOT NULL and add foreign key
    op.alter_column('tennis_group', 'tennis_club_id', nullable=False)
    op.create_foreign_key('tennis_group_tennis_club_id_fkey', 'tennis_group', 'tennis_club', ['tennis_club_id'], ['id'])
    
    # Drop organisation foreign key and column
    op.drop_constraint('fk_tennis_group_organisation', 'tennis_group', type_='foreignkey')
    op.drop_column('tennis_group', 'organisation_id')
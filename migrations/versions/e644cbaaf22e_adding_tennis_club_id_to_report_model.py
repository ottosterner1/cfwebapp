"""Adding tennis club id to report model

Revision ID: e644cbaaf22e
Revises: 
Create Date: 2024-02-09 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'e644cbaaf22e'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    # Step 1: Add the column as nullable
    op.add_column('report', sa.Column('tennis_club_id', sa.Integer(), nullable=True))
    
    # Step 2: Set the tennis_club_id based on the programme_player's tennis_club_id
    op.execute("""
        UPDATE report 
        SET tennis_club_id = programme_players.tennis_club_id 
        FROM programme_players 
        WHERE report.programme_player_id = programme_players.id
    """)
    
    # Step 3: Add the foreign key constraint
    op.create_foreign_key(
        'fk_report_tennis_club_id', 
        'report', 'tennis_club', 
        ['tennis_club_id'], ['id']
    )
    
    # Step 4: Make the column non-nullable
    op.alter_column('report', 'tennis_club_id',
        existing_type=sa.Integer(),
        nullable=False
    )

def downgrade():
    op.drop_constraint('fk_report_tennis_club_id', 'report', type_='foreignkey')
    op.drop_column('report', 'tennis_club_id')
"""adding notes section to players

Revision ID: fd2f59652d5a
Revises: e7fb53b8d78a
Create Date: 2025-05-16 08:07:43.400198

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'fd2f59652d5a'
down_revision = 'e7fb53b8d78a'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('programme_players', schema=None) as batch_op:
        batch_op.add_column(sa.Column('notes', sa.Text(), nullable=True))

    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('programme_players', schema=None) as batch_op:
        batch_op.drop_column('notes')

    # ### end Alembic commands ###

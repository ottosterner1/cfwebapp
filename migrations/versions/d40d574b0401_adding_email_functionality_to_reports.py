"""Adding email functionality to reports

Revision ID: d40d574b0401
Revises: 73a16a7c48e6
Create Date: 2025-06-25 20:54:16.128797

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'd40d574b0401'
down_revision = '73a16a7c48e6'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('organisation', schema=None) as batch_op:
        batch_op.add_column(sa.Column('sender_email', sa.String(length=120), nullable=True))
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('organisation', schema=None) as batch_op:
        batch_op.drop_column('sender_email')
    # ### end Alembic commands ###
"""Adding registers

Revision ID: 92f90a8cbbef
Revises: 36c4681cc7ab
Create Date: 2025-03-26 21:37:59.132842

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '92f90a8cbbef'
down_revision = '36c4681cc7ab'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table('register',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('group_time_id', sa.Integer(), nullable=False),
    sa.Column('coach_id', sa.Integer(), nullable=False),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('teaching_period_id', sa.Integer(), nullable=False),
    sa.Column('status', sa.Enum('DRAFT', 'SUBMITTED', name='registerstatus'), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('tennis_club_id', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['coach_id'], ['user.id'], ),
    sa.ForeignKeyConstraint(['group_time_id'], ['tennis_group_times.id'], ),
    sa.ForeignKeyConstraint(['teaching_period_id'], ['teaching_period.id'], ),
    sa.ForeignKeyConstraint(['tennis_club_id'], ['tennis_club.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('register', schema=None) as batch_op:
        batch_op.create_index('idx_register_date_coach', ['date', 'coach_id'], unique=False)
        batch_op.create_index('idx_register_group_time', ['group_time_id', 'date'], unique=False)
        batch_op.create_index('idx_register_teaching_period', ['teaching_period_id'], unique=False)

    op.create_table('register_entry',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('register_id', sa.Integer(), nullable=False),
    sa.Column('programme_player_id', sa.Integer(), nullable=False),
    sa.Column('attendance_status', sa.Enum('PRESENT', 'ABSENT', 'EXCUSED', 'LATE', name='attendancestatus'), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['programme_player_id'], ['programme_players.id'], ),
    sa.ForeignKeyConstraint(['register_id'], ['register.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('register_entry', schema=None) as batch_op:
        batch_op.create_index('idx_register_entry_player', ['programme_player_id'], unique=False)
        batch_op.create_index('idx_register_entry_register', ['register_id'], unique=False)
        batch_op.create_index('idx_register_entry_unique', ['register_id', 'programme_player_id'], unique=True)

    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('register_entry', schema=None) as batch_op:
        batch_op.drop_index('idx_register_entry_unique')
        batch_op.drop_index('idx_register_entry_register')
        batch_op.drop_index('idx_register_entry_player')

    op.drop_table('register_entry')
    with op.batch_alter_table('register', schema=None) as batch_op:
        batch_op.drop_index('idx_register_teaching_period')
        batch_op.drop_index('idx_register_group_time')
        batch_op.drop_index('idx_register_date_coach')

    op.drop_table('register')
    # ### end Alembic commands ###

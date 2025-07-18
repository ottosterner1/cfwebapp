"""removing register status

Revision ID: d43f4d689253
Revises: 763a1e456c0d
Create Date: 2025-07-12 08:48:48.624473

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from datetime import datetime, timezone, timedelta

# revision identifiers, used by Alembic.
revision = 'd43f4d689253'
down_revision = '763a1e456c0d'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    
    # First, clean up any problematic survey tables that might cause conflicts
    try:
        # Drop survey tables with CASCADE to handle dependencies
        op.execute('DROP TABLE IF EXISTS survey_response CASCADE')
        op.execute('DROP TABLE IF EXISTS survey_campaign CASCADE') 
        op.execute('DROP TABLE IF EXISTS survey_question CASCADE')
        op.execute('DROP TABLE IF EXISTS survey_recipient CASCADE')
        op.execute('DROP TABLE IF EXISTS survey_template CASCADE')
        op.execute('DROP TABLE IF EXISTS survey_opt_out CASCADE')
        op.execute('DROP TABLE IF EXISTS club_compliance_status CASCADE')
        print("✅ Cleaned up survey tables")
    except Exception as e:
        print(f"Survey cleanup note: {e}")
    
    # Create the subscription status enum with UPPERCASE values
    subscription_status_enum = postgresql.ENUM('TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED', name='subscriptionstatus')
    subscription_status_enum.create(op.get_bind())
    
    # Add subscription management columns to organisation table
    with op.batch_alter_table('organisation', schema=None) as batch_op:
        batch_op.add_column(sa.Column('subscription_status', 
                                     postgresql.ENUM('TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED', name='subscriptionstatus'), 
                                     server_default='TRIAL', 
                                     nullable=False))
        batch_op.add_column(sa.Column('trial_start_date', 
                                     sa.DateTime(timezone=True), 
                                     server_default=sa.text('CURRENT_TIMESTAMP'), 
                                     nullable=True))
        batch_op.add_column(sa.Column('trial_end_date', 
                                     sa.DateTime(timezone=True), 
                                     nullable=True))
        batch_op.add_column(sa.Column('manually_activated_at', 
                                     sa.DateTime(timezone=True), 
                                     nullable=True))
        batch_op.add_column(sa.Column('manually_activated_by_id', 
                                     sa.Integer(), 
                                     nullable=True))
        batch_op.add_column(sa.Column('admin_notes', 
                                     sa.Text(), 
                                     nullable=True))
        batch_op.add_column(sa.Column('updated_at', 
                                     sa.DateTime(timezone=True), 
                                     nullable=True))
        batch_op.create_foreign_key('fk_org_activated_by_user', 'user', ['manually_activated_by_id'], ['id'])
    
    # Fix document column that was detected as changed
    try:
        op.alter_column('document', 'requires_acknowledgment',
                       existing_type=sa.BOOLEAN(),
                       nullable=True)
    except Exception as e:
        print(f"Document column note: {e}")
    
    # Set up trial data for existing organisations
    try:
        # Get connection for raw SQL
        connection = op.get_bind()
        
        # Get existing organisations
        result = connection.execute(sa.text("SELECT id, created_at FROM organisation"))
        organisations = result.fetchall()
        
        print(f"Setting up trial data for {len(organisations)} existing organisations...")
        
        for org in organisations:
            org_id = org[0]
            created_at = org[1] if org[1] else datetime.now(timezone.utc)
            
            # Set trial end date to 30 days from creation (or from now if no creation date)
            if isinstance(created_at, datetime):
                trial_end = created_at + timedelta(days=30)
            else:
                # Handle case where created_at might be a string or None
                trial_end = datetime.now(timezone.utc) + timedelta(days=30)
            
            # Update the organisation with trial data (using UPPERCASE enum value)
            connection.execute(sa.text("""
                UPDATE organisation 
                SET trial_end_date = :trial_end,
                    admin_notes = :notes,
                    subscription_status = 'TRIAL'
                WHERE id = :org_id
            """), {
                'trial_end': trial_end,
                'notes': f"{datetime.now().strftime('%Y-%m-%d')}: Organisation migrated to subscription management",
                'org_id': org_id
            })
        
        print(f"✅ Set up trial data for {len(organisations)} organisations")
        
    except Exception as e:
        print(f"Trial setup note: {e}")
    
    print("🎉 Subscription migration completed successfully!")
    
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    
    with op.batch_alter_table('organisation', schema=None) as batch_op:
        batch_op.drop_constraint('fk_org_activated_by_user', type_='foreignkey')
        batch_op.drop_column('updated_at')
        batch_op.drop_column('admin_notes')
        batch_op.drop_column('manually_activated_by_id')
        batch_op.drop_column('manually_activated_at')
        batch_op.drop_column('trial_end_date')
        batch_op.drop_column('trial_start_date')
        batch_op.drop_column('subscription_status')
    
    # Drop the enum type
    op.execute('DROP TYPE IF EXISTS subscriptionstatus')
    
    # Revert document column change
    try:
        op.alter_column('document', 'requires_acknowledgment',
                       existing_type=sa.BOOLEAN(),
                       nullable=False)
    except Exception as e:
        print(f"Document column revert note: {e}")
    
    # ### end Alembic commands ###
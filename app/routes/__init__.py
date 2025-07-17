def register_routes(app):
    """Register all application routes with the Flask app"""
    
    # Import route modules
    from app.routes.main import main
    from app.routes.clubs import club_management
    from app.routes.auth import auth_routes
    from app.routes.players import player_routes  
    from app.routes.reports import report_routes
    from app.routes.admin import admin_routes
    from app.routes.super_admin import super_admin_routes
    
    # Import register routes - both API and view routes
    from app.routes.registers import register_routes, register_views
    from app.routes.invoices_view import invoice_views
    from app.routes.invoicing import invoice_routes 
    from app.routes.cancellations import cancellation_routes
    from app.routes.organisations import organisation_routes, admin_org_routes
    from app.routes import communication
    from app.routes.session_planning import session_planning_routes, session_planning_views
    
    # Register blueprints
    app.register_blueprint(main)
    app.register_blueprint(club_management)
    app.register_blueprint(auth_routes)
    app.register_blueprint(player_routes)
    app.register_blueprint(report_routes)
    app.register_blueprint(admin_routes)
    app.register_blueprint(register_routes)
    app.register_blueprint(super_admin_routes)
    
    # Register the view routes for the register functionality
    app.register_blueprint(register_views)
    app.register_blueprint(invoice_views)
    app.register_blueprint(invoice_routes) 
    app.register_blueprint(cancellation_routes)
    app.register_blueprint(organisation_routes)
    app.register_blueprint(communication.bp)
    app.register_blueprint(admin_org_routes)
    app.register_blueprint(session_planning_routes)
    app.register_blueprint(session_planning_views)

    return app
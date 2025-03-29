"""
Routes package for the application.
Imports and registers all route blueprints.
"""

def register_routes(app):
    """Register all application routes with the Flask app"""
    
    # Import route modules
    from app.routes.main import main
    from app.routes.clubs import club_management
    from app.routes.auth import auth_routes
    from app.routes.players import player_routes  
    from app.routes.reports import report_routes
    from app.routes.admin import admin_routes
    
    # Register blueprints
    app.register_blueprint(main)
    app.register_blueprint(club_management)
    app.register_blueprint(auth_routes)
    app.register_blueprint(player_routes)
    app.register_blueprint(report_routes)
    app.register_blueprint(admin_routes)
    
    return app
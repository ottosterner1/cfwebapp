class FeatureType:
    """Constants for the different app features that can be enabled/disabled per club"""
    
    # Feature constants
    COACHING_REPORTS = 'coaching_reports'
    MANAGE_PROGRAMME = 'manage_programme'
    LTA_ACCREDITATION = 'lta_accreditation'
    REGISTERS = 'registers'
    INVOICES = 'invoices'
    COMMUNICATION_HUB = 'communication_hub'
    
    @classmethod
    def get_all_features(cls):
        """Return a list of all available features with metadata
        
        Returns:
            list: List of feature dictionaries with name, display_name, and description
        """
        return [
            {
                'name': cls.COACHING_REPORTS, 
                'display_name': 'Coaching Reports', 
                'description': 'View and manage player reports',
                'icon': '📊'
            },
            {
                'name': cls.MANAGE_PROGRAMME, 
                'display_name': 'Manage Programme', 
                'description': 'Assign players to coaches and groups',
                'icon': '👥'
            },
            {
                'name': cls.LTA_ACCREDITATION, 
                'display_name': 'LTA Accreditation', 
                'description': 'Track coach qualifications and certifications',
                'icon': '🏆'
            },
            {
                'name': cls.REGISTERS, 
                'display_name': 'Registers', 
                'description': 'Track player attendance for groups',
                'icon': '📋'
            },
            { 
                'name': cls.INVOICES,
                'display_name': 'Invoice Management', 
                'description': 'Create, manage and track invoices for coaching sessions',
                'icon': '💰'
            },
            {
                'name': cls.COMMUNICATION_HUB,
                'display_name': 'Communication Hub',
                'description': 'Central hub for announcements, documents, and club communications',
                'icon': '💬'
            }
        ]
    
    @classmethod
    def get_feature_by_name(cls, name):
        """Get a specific feature by its name"""
        features = cls.get_all_features()
        return next((f for f in features if f['name'] == name), None)
    
    @classmethod
    def is_valid_feature(cls, name):
        """Check if a feature name is valid"""
        return cls.get_feature_by_name(name) is not None
    
    @classmethod
    def get_default_enabled_features(cls):
        """Get list of features that should be enabled by default"""
        return [
            cls.COACHING_REPORTS,
            cls.MANAGE_PROGRAMME,
            cls.REGISTERS
        ]
    
    @classmethod
    def get_feature_by_name(cls, name):
        """Get a specific feature by its name"""
        features = cls.get_all_features()
        return next((f for f in features if f['name'] == name), None)
    
    @classmethod
    def is_valid_feature(cls, name):
        """Check if a feature name is valid"""
        return cls.get_feature_by_name(name) is not None
"""
Constants and utilities for managing club features
"""

class FeatureType:
    """Constants for the different app features that can be enabled/disabled per club"""
    
    # Feature constants
    COACHING_REPORTS = 'coaching_reports'
    MANAGE_PROGRAMME = 'manage_programme'
    LTA_ACCREDITATION = 'lta_accreditation'
    REGISTERS = 'registers'
    
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
                'icon': '📋'
            },
            {
                'name': cls.REGISTERS, 
                'display_name': 'Registers', 
                'description': 'Track player attendance for groups',
                'icon': '📋'
            }
        ]
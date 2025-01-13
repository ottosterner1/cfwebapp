TENNIS_CLUBS = {
    'wilton': {
        'name': 'Wilton Tennis Club',
        'allowed_domains': ['wiltontennis.com'],  # Email domains allowed for this club
    },
    'demo': {
        'name': 'Demo Tennis Club',
        'allowed_domains': ['demo.com'],
    }
}

def get_club_from_email(email):
    """Determine tennis club based on email domain"""
    domain = email.split('@')[1]
    for subdomain, club_info in TENNIS_CLUBS.items():
        if domain in club_info['allowed_domains']:
            return subdomain
    return None
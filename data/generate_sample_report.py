import csv
from datetime import datetime

def generate_sample_csv():
    # Headers - include tennis_club_id
    headers = [
        'student_name',
        'age',
        'tennis_club_id',  # Added this field
        'forehand',
        'backhand',
        'movement',
        'overall_rating',
        'next_group_recommendation',
        'notes'
    ]
    
    # Sample data - assuming tennis_club_id 1 exists from your reset_db.py
    data = [
        {
            'student_name': 'John Smith',
            'age': 6,
            'tennis_club_id': 1,  # Added tennis_club_id
            'forehand': 'YES',
            'backhand': 'NEARLY',
            'movement': 'YES',
            'overall_rating': 4,
            'next_group_recommendation': 'RED 2',
            'notes': 'Strong forehand, developing backhand well'
        },
        {
            'student_name': 'Emma Wilson',
            'age': 5,
            'tennis_club_id': 1,  # Added tennis_club_id
            'forehand': 'NEARLY',
            'backhand': 'NOT YET',
            'movement': 'YES',
            'overall_rating': 3,
            'next_group_recommendation': 'RED 1',
            'notes': 'Good movement, needs work on racket skills'
        },
        {
            'student_name': 'Sarah Johnson',
            'age': 7,
            'tennis_club_id': 1,  # Added tennis_club_id
            'forehand': 'YES',
            'backhand': 'YES',
            'movement': 'NEARLY',
            'overall_rating': 4,
            'next_group_recommendation': 'RED 2',
            'notes': 'Excellent racket skills, working on movement patterns'
        },
        {
            'student_name': 'Michael Brown',
            'age': 6,
            'tennis_club_id': 1,  # Added tennis_club_id
            'forehand': 'NEARLY',
            'backhand': 'NEARLY',
            'movement': 'YES',
            'overall_rating': 3,
            'next_group_recommendation': 'RED 1',
            'notes': 'Good athleticism, developing technical skills'
        }
    ]
    
    # Write to CSV
    filename = f'sample_tennis_reports_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
    with open(filename, 'w', newline='') as file:
        writer = csv.DictWriter(file, fieldnames=headers)
        writer.writeheader()
        writer.writerows(data)
    
    return filename

if __name__ == "__main__":
    try:
        filename = generate_sample_csv()
        print(f"Successfully created sample CSV: {filename}")
        print("\nSample data includes:")
        print("- 4 students with varied skill levels")
        print("- All standard assessment criteria")
        print("- Detailed notes for each student")
        print("\nMake sure tennis_club_id=1 exists in your database")
        
    except Exception as e:
        print(f"Error generating CSV: {str(e)}")
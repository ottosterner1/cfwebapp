import pytz
from enum import Enum
from datetime import datetime, timezone, timedelta

# Timezone definition
uk_timezone = pytz.timezone('Europe/London')

# Enum definitions
class UserRole(Enum):
    COACH = 'coach'
    ADMIN = 'admin'
    SUPER_ADMIN = 'super_admin'

class FieldType(Enum):
    TEXT = 'text'
    TEXTAREA = 'textarea'
    RATING = 'rating'
    SELECT = 'select'
    PROGRESS = 'progress'

    @classmethod
    def get_default_options(cls, field_type):
        defaults = {
            cls.TEXT: None,
            cls.TEXTAREA: None,
            cls.RATING: {
                'min': 1,
                'max': 5,
                'options': ['Needs Development', 'Developing', 'Competent', 'Proficient', 'Excellent']
            },
            cls.SELECT: {
                'options': []
            },
            cls.PROGRESS: {
                'options': ['Yes', 'Nearly', 'Not Yet']
            }
        }
        return defaults.get(field_type)

class CoachQualification(Enum):
    LEVEL_1 = 'Level 1'
    LEVEL_2 = 'Level 2'
    LEVEL_3 = 'Level 3'
    LEVEL_4 = 'Level 4'
    LEVEL_5 = 'Level 5'
    NONE = 'None'

class CoachRole(Enum):
    HEAD_COACH = 'Head Coach'
    SENIOR_COACH = 'Senior Coach'
    LEAD_COACH = 'Lead Coach'
    ASSISTANT_COACH = 'Assistant Coach'
    JUNIOR_COACH = 'Junior Coach'

class DayOfWeek(Enum):
    MONDAY = 'Monday'
    TUESDAY = 'Tuesday'
    WEDNESDAY = 'Wednesday'
    THURSDAY = 'Thursday'
    FRIDAY = 'Friday'
    SATURDAY = 'Saturday'
    SUNDAY = 'Sunday'

# New enums for register functionality
class AttendanceStatus(Enum):
    PRESENT = 'present'
    ABSENT = 'absent'
    EXCUSED = 'excused'
    LATE = 'late'

class RegisterStatus(Enum):
    DRAFT = 'draft'
    SUBMITTED = 'submitted'
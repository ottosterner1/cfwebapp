# Import all models to make them available when importing from models
# This allows existing code to continue working without changes

# Base enums and constants
from app.models.base import (
    UserRole, FieldType, CoachQualification, CoachRole, 
    DayOfWeek, AttendanceStatus, RegisterStatus, uk_timezone
)

# Core models
from app.models.core import (
    TennisClub, User, CoachDetails, TeachingPeriod, 
    Student, CoachInvitation, ClubInvitation
)

# Programme models
from app.models.programme import (
    TennisGroup, TennisGroupTimes, ProgrammePlayers, Report,
    ReportTemplate, TemplateSection, TemplateField, GroupTemplate
)

# Register models
from app.models.register import (
    Register, RegisterEntry, RegisterAssistantCoach
)

# Register models
from app.models.invoice import (
    CoachingRate, Invoice, InvoiceLineItem, InvoiceStatus, RateType
)

# Cancellation models
from app.models.cancellation import (
    Cancellation, CancellationType
)

from app.models.organisation import (
    Organisation
)

# Communication models
from app.models.communication import (
    Document, DocumentPermission, DocumentDownloadLog, DocumentAcknowledgment
)
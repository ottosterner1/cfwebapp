// src/types/clubs.ts

export interface EmailTemplate {
    name: string;
    subject: string;
    message: string;
  }
  
  export interface ClubConfig {
    id: string;
    name: string;
    bookingUrl?: string;
    headCoach?: {
      name: string;
      title: string;
    };
    emailTemplates: EmailTemplate[];
  }
  
  export const clubConfigs: Record<string, ClubConfig> = {
    'wilton': {
      id: 'wilton',
      name: 'Wilton Tennis Club',
      bookingUrl: 'https://booking.wiltontennisclub.co.uk/',
      headCoach: {
        name: 'Marc Beckles',
        title: 'Head Coach'
      },
      emailTemplates: [
        {
          name: "Wilton End of Term Report",
          subject: "Wilton Tennis - Next Term Recommendation for {student_name}",
          message: "Dear {student_name} or Parent/Guardian,\n\n" +
                  "Thank you for being part of our coaching programme at Wilton Tennis Club this term.\n\n" +
                  "Please find attached {student_name}'s end of term progress report.\n\n" +
                  "Based on their progress, they are recommended to sign up to the following group for next term:\n" +
                  "{recommended_group}\n\n" +
                  "Important Booking Information:\n" +
                  "- Date bookings open: {booking_date}\n" +
                  "- Time bookings open: \n" +
                  "- Booking password: \n" +
                  "- Booking link: https://booking.wiltontennisclub.co.uk/\n\n" +
                  "Please let me know if you have any questions about this recommendation or the booking process.\n\n" +
                  "Kind regards,\n" +
                  "Marc Beckles\n" +
                  "Head Coach, Wilton Tennis Club"
        },
      ]
    },
    'default': {
      id: 'default',
      name: 'Tennis Club',
      emailTemplates: [
        {
          name: "Standard End of Term Report",
          subject: "Tennis Progress Report - {term_name}",
          message: "Dear Parent/Guardian,\n\n" +
                  "I hope this email finds you well. Please find attached the tennis progress report for {student_name} for {term_name}.\n\n" +
                  "The report includes a detailed assessment of their progress, achievements, and areas for future development.\n\n" +
                  "If you have any questions about the report, please don't hesitate to contact me.\n\n" +
                  "Best regards,\n" +
                  "{coach_name}"
        },
        {
          name: "Standard Mid-Term Update",
          subject: "Mid-Term Progress Update - {student_name}",
          message: "Dear Parent/Guardian,\n\n" +
                  "I'm writing to provide you with {student_name}'s mid-term progress report. Please find it attached.\n\n" +
                  "We've been focusing on {group_name} skills this term, and I'm pleased to share their progress with you.\n\n" +
                  "Please review the report and let me know if you have any questions.\n\n" +
                  "Best regards,\n" +
                  "{coach_name}"
        }
      ]
    }
  };
  
  /**
   * Available template placeholders:
   * {student_name} - The student's name
   * {group_name} - The current group name
   * {recommended_group} - The recommended group for next term
   * {term_name} - The current term name
   * {coach_name} - The coach's name
   * {booking_date} - The date bookings open
   */
  
  export const getClubConfig = (clubName: string): ClubConfig => {
    if (!clubName) return clubConfigs['default'];
  
    console.log('Getting club config for:', clubName); // Debug log
    
    // Handle Wilton case (case-insensitive and includes partial match)
    const normalizedClubName = clubName.toLowerCase();
    if (normalizedClubName.includes('wilton')) {
      console.log('Matched Wilton config'); // Debug log
      return clubConfigs['wilton'];
    }
    
    console.log('Using default config'); // Debug log
    return clubConfigs['default'];
  };
  
  /**
   * Get available placeholders for a specific club
   */
  export const getClubPlaceholders = (clubName: string): string[] => {
    const defaultPlaceholders = [
      'student_name',
      'group_name',
      'term_name',
      'coach_name'
    ];
  
    if (clubName.toLowerCase().includes('wilton')) {
      return [
        ...defaultPlaceholders,
        'recommended_group',
        'booking_date',
      ];
    }
  
    return defaultPlaceholders;
  };
  
  export default clubConfigs;
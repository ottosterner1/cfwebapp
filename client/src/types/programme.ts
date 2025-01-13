// src/types/programme.ts
export interface Student {
    id: number;
    name: string;
    date_of_birth?: string;
    contact_email: string;
  }
  
  export interface Coach {
    id: number;
    name: string;
    email: string;
  }
  
  export interface Group {
    id: number;
    name: string;
    description?: string;
  }
  
  export interface TeachingPeriod {
    id: number;
    name: string;
    start_date: string;
    end_date: string;
  }
  
  export interface ProgrammePlayer {
    id: number;
    student: Student;
    coach: Coach;
    tennis_group: Group;
    teaching_period: TeachingPeriod;
    report_submitted: boolean;
  }
  
  export interface AddPlayerFormData {
    student_name: string;
    date_of_birth: string;
    contact_email: string;
    coach_id: number;
    group_id: number;
    group_time_id: number;
    teaching_period_id: number;
  }
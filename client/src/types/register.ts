// client/src/types/register.ts

export type AttendanceStatus = 'present' | 'absent' | 'sick' | 'away_with_notice';

export interface RegisterEntry {
  id: number;
  student_id: number;
  student_name: string;
  attendance_status: AttendanceStatus;
  notes: string | null;
  player_id: number;
  predicted_attendance: boolean;
}

export interface Register {
  id: number;
  date: string;
  group_name: string;
  coach_name: string;
  coach_id: number; 
  time_slot: {
    day: string;
    start_time: string;
    end_time: string;
  };
  stats: {
    total: number;
    present: number;
    absent: number;
    sick: number;
    away_with_notice: number;
    attendance_rate: number;
  };
}

export interface RegisterDetail {
  id: number;
  date: string;
  group: {
    id: number | null;
    name: string;
  };
  time_slot: {
    id: number | null;
    day: string | null;
    start_time: string | null;
    end_time: string | null;
  };
  coach: {
    id: number;
    name: string;
  };
  assistant_coaches: {
    id: number;
    name: string;
  }[];
  notes: string;
  entries: RegisterEntry[];
  teaching_period: {
    id: number;
    name: string;
  };
}

export interface UpcomingSession {
  date: string;
  group_time: {
    id: number;
    day: string;
    start_time: string;
    end_time: string;
  };
  group: {
    id: number;
    name: string;
  };
  teaching_period: {
    id: number;
    name: string;
  };
  coach: {
    id: number;
    name: string;
  };
}

export interface AttendanceStats {
  total_sessions: number;
  present: number;
  absent: number;
  sick: number;
  away_with_notice: number;
  attendance_rate: number;
  total_registers?: number;
}

export interface GroupAttendanceStats {
  id: number;
  name: string;
  total: number;
  present: number;
  absent: number;
  sick: number;
  away_with_notice: number;
  attendance_rate: number;
}

export interface StudentAttendanceStats {
  id: number;
  name: string;
  total: number;
  present: number;
  absent: number;
  sick: number;
  away_with_notice: number;
  attendance_rate: number;
}
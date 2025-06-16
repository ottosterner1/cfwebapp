export interface HomeUser {
  id: number;
  name: string;
  email: string;
  is_admin: boolean;
  is_super_admin: boolean;
  tennis_club_id: number;
}

export interface TennisClubFeatures {
  coaching_reports: boolean;
  manage_programme: boolean;
  lta_accreditation: boolean;
  registers: boolean;
  invoices: boolean;
  surveys_basic: boolean;
}

export interface TennisClub {
  id: number;
  name: string;
  logo_url?: string;
  logo_presigned_url?: string;
  features: TennisClubFeatures;
}

export interface UserResponse {
  id: number;
  name: string;
  email: string;
  is_admin: boolean;
  is_super_admin: boolean;
  tennis_club_id: number;
  tennis_club: {
    id: number;
    name: string;
    logo_url?: string;
    logo_presigned_url?: string;
    features?: TennisClubFeatures;
  };
}
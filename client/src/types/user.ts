export interface User {
  name: string;
  tennis_club?: {
    name: string;
    id: number;
  };
  is_admin: boolean;
  is_super_admin: boolean;
} 
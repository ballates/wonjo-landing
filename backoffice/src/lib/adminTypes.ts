import type { AdminRole } from '../auth/AuthContext';

export interface AdminRow {
  user_id: string;
  email: string;
  role: AdminRole;
  actif: boolean;
  created_at: string;
}

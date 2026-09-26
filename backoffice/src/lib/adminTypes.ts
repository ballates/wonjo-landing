import type { AdminRole } from '../auth/AuthContext';

export interface AdminRow {
  user_id: string;
  email: string;
  nom_affiche: string | null;
  avatar_url: string | null;
  role: AdminRole;
  actif: boolean;
  created_at: string;
}

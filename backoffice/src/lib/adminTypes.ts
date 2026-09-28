import type { AdminRole } from '../auth/AuthContext';

export interface AdminRow {
  user_id: string;
  email: string;
  nom_affiche: string | null;
  avatar_url: string | null;
  roles: AdminRole[];
  peut_inviter: boolean;
  actif: boolean;
  invitation_confirmee: boolean;
  created_at: string;
}

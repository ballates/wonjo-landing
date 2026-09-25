import type { AdminRole } from '../auth/AuthContext';

// Table de correspondance role -> ecrans visibles (cf. migration 213 pour
// l'equivalent cote serveur, seule source de verite reelle - ceci ne sert
// qu'a l'affichage, jamais a la securite).
export function peutVoirActivite(role: AdminRole | null): boolean {
  return role === 'super_admin' || role === 'moderation' || role === 'lecture_seule';
}

export function peutVoirRevenus(role: AdminRole | null): boolean {
  return role === 'super_admin' || role === 'finance';
}

export function peutModerer(role: AdminRole | null): boolean {
  return role === 'super_admin' || role === 'moderation';
}

export function peutVoirKyc(role: AdminRole | null): boolean {
  return role === 'super_admin' || role === 'moderation';
}

export function peutGererAdmins(role: AdminRole | null): boolean {
  return role === 'super_admin';
}

export const LABELS_ROLES: Record<AdminRole, string> = {
  super_admin: 'Super admin',
  moderation: 'Modération',
  finance: 'Finance',
  lecture_seule: 'Lecture seule',
};

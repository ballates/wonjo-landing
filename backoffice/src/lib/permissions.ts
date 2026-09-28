import type { AdminRole } from '../auth/AuthContext';

// Table de correspondance roles -> ecrans visibles (cf. migration 269 pour
// l'equivalent cote serveur, seule source de verite reelle - ceci ne sert
// qu'a l'affichage, jamais a la securite). Roles cumulables : une personne
// peut en avoir plusieurs, ses droits sont l'union de tous.
function a(roles: AdminRole[], ...accepte: AdminRole[]): boolean {
  return roles.some((r) => accepte.includes(r));
}

// Onglets Activite / Communaute / Marche : admin_stats_utilisation,
// admin_stats_communaute, admin_stats_marche. data (migration 284) et
// stagiaire (migration 285) corriges : ces roles existaient sans acceder a
// rien, alors que leurs libelles le promettaient.
export function peutVoirActivite(roles: AdminRole[]): boolean {
  return a(roles, 'super_admin', 'moderation', 'lecture_seule', 'data', 'stagiaire');
}

// Onglet Colis : admin_stats_colis_temporel / admin_repartition_type_envoi.
export function peutVoirColis(roles: AdminRole[]): boolean {
  return a(roles, 'super_admin', 'moderation');
}

// Onglet Alertes : admin_a_faire.
export function peutVoirAlertes(roles: AdminRole[]): boolean {
  return a(roles, 'super_admin', 'moderation');
}

// Emails "Information" (ignorent les desinscriptions) : super_admin seul,
// verifie aussi dans admin-envoyer-email.
export function peutEnvoyerInformation(roles: AdminRole[]): boolean {
  return a(roles, 'super_admin');
}

export function peutVoirRevenus(roles: AdminRole[]): boolean {
  return a(roles, 'super_admin', 'finance');
}

export function peutModerer(roles: AdminRole[]): boolean {
  return a(roles, 'super_admin', 'moderation');
}

export function peutVoirKyc(roles: AdminRole[]): boolean {
  return a(roles, 'super_admin', 'moderation');
}

export function peutGererAdmins(roles: AdminRole[]): boolean {
  return a(roles, 'super_admin');
}

export function peutEnvoyerEmails(roles: AdminRole[]): boolean {
  return a(roles, 'super_admin', 'commercial');
}

// Suppression (anonymisation) d'un compte : action irreversible, reservee au
// super_admin - aucun autre role ne peut la mener, meme moderation.
export function peutSupprimerCompte(roles: AdminRole[]): boolean {
  return a(roles, 'super_admin');
}

// Ouvrir/fermer un pays dans les corridors : reserve au super_admin (cf.
// admin_lister_pays_corridors / admin_definir_pays_corridor, migration 272).
export function peutGererCorridors(roles: AdminRole[]): boolean {
  return a(roles, 'super_admin');
}

export const LABELS_ROLES: Record<AdminRole, string> = {
  super_admin: 'Admin',
  moderation: 'Confiance & sécurité',
  finance: 'Finance',
  commercial: 'Commercial',
  data: 'Data',
  stagiaire: 'Stagiaire',
  lecture_seule: 'Lecture seule',
};

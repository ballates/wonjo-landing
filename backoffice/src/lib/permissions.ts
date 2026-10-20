import type { AdminRole } from '../auth/AuthContext';

// Roles -> ecrans visibles. Le serveur reste la seule source de verite (chaque fonction admin_* verifie le role) : ceci ne sert qu'a
// l'affichage. `roles` est la liste des roles EFFECTIFS renvoyee par admin_mon_profil (438) : un role parent y figure avec tous ses
// descendants (Admin > Securite, Finance, Commercial > Lecture ; Admin > Reseau > Agent relais). Il suffit donc de nommer le role
// le plus bas qui ouvre l'ecran : ses parents l'ont aussi.
function a(roles: AdminRole[], ...accepte: AdminRole[]): boolean {
  return roles.some((r) => accepte.includes(r));
}

// Onglets Activite / Communaute / Marche : statistiques agregees, sans donnee personnelle.
export function peutVoirActivite(roles: AdminRole[]): boolean {
  return a(roles, 'lecture');
}

// Onglet Colis : admin_stats_colis_temporel / admin_repartition_type_envoi.
export function peutVoirColis(roles: AdminRole[]): boolean {
  return a(roles, 'moderation');
}

// Onglet Alertes : admin_a_faire.
export function peutVoirAlertes(roles: AdminRole[]): boolean {
  return a(roles, 'moderation');
}

// Emails "Information" (ignorent les desinscriptions) : Admin seul, verifie aussi dans admin-envoyer-email.
export function peutEnvoyerInformation(roles: AdminRole[]): boolean {
  return a(roles, 'super_admin');
}

export function peutVoirRevenus(roles: AdminRole[]): boolean {
  return a(roles, 'finance');
}

// Page Transactions et fiche : la Securite, et la Finance (sans conversation privee, sans fiche de compte, telephones masques).
export function peutVoirTransactions(roles: AdminRole[]): boolean {
  return a(roles, 'moderation', 'finance');
}

export function peutModerer(roles: AdminRole[]): boolean {
  return a(roles, 'moderation');
}

// Litiges : la Securite les suit, la Finance les tranche.
export function peutVoirLitiges(roles: AdminRole[]): boolean {
  return a(roles, 'moderation', 'finance');
}

export function peutVoirKyc(roles: AdminRole[]): boolean {
  return a(roles, 'moderation');
}

export function peutGererAdmins(roles: AdminRole[]): boolean {
  return a(roles, 'super_admin');
}

export function peutEnvoyerEmails(roles: AdminRole[]): boolean {
  return a(roles, 'commercial');
}

// Suppression (anonymisation) d'un compte : irreversible, Admin seul.
export function peutSupprimerCompte(roles: AdminRole[]): boolean {
  return a(roles, 'super_admin');
}

// Tarification et corridors : Admin seul.
export function peutGererCorridors(roles: AdminRole[]): boolean {
  return a(roles, 'super_admin');
}

// Points relais : l'Agent voit ses points, le Reseau tous, la Finance les lit.
export function peutVoirPointsRelais(roles: AdminRole[]): boolean {
  return a(roles, 'finance', 'point_relais');
}

// Reseau : creer, modifier, fermer les points et gerer leurs agents (pas la suppression d'un point, Admin seul).
export function peutGererReseau(roles: AdminRole[]): boolean {
  return a(roles, 'reseau');
}

// Agent relais ou Reseau, et rien d'autre : pas de tableau de bord, accueil sur l'onglet Points relais.
export function estSeulementPointRelais(roles: AdminRole[]): boolean {
  return roles.length > 0 && roles.every((r) => r === 'point_relais' || r === 'reseau');
}

export const LABELS_ROLES: Record<AdminRole, string> = {
  super_admin: 'Admin',
  moderation: 'Sécurité',
  finance: 'Finance',
  commercial: 'Commercial',
  lecture: 'Lecture',
  reseau: 'Réseau',
  point_relais: 'Agent relais',
};

// Description courte (page Admin) : ce que le role fait en propre, et de qui il herite.
export const DESCRIPTIONS_ROLES: Record<AdminRole, string> = {
  super_admin: 'Tout le back-office, plus ce qui ne se délègue jamais : administrateurs, tarification, interrupteurs, suppressions. 5 au plus.',
  moderation: 'Comptes, KYC, signalements, avis, blocages, conversations et photos (avec motif), suivi des litiges. Hérite de Lecture.',
  finance: 'Transactions, paiements, marges, litiges, contestations, caisses, voyageurs à payer. Hérite de Lecture.',
  commercial: 'E-mails, campagnes et modèles. Hérite de Lecture.',
  lecture: 'Tableaux de bord agrégés, sans aucune donnée personnelle.',
  reseau: 'Tous les points relais : créer, modifier, fermer, gérer les agents. Ni argent ni suppression. Hérite d\'Agent relais.',
  point_relais: 'Ses points relais seulement, selon ses permissions par point. Aucun tableau de bord.',
};

/** Ordre d'affichage des roles. */
export const ROLES_ORDONNES: AdminRole[] = ['super_admin', 'moderation', 'finance', 'commercial', 'lecture', 'reseau', 'point_relais'];

// Formes renvoyées par les RPC admin_* (migration 212, dépôt wonjo).
// Tenues à la main en synchro avec les RETURNS TABLE des fonctions SQL.

export interface StatsActivite {
  inscriptions_7j: number;
  inscriptions_30j: number;
  comptes_bloques: number;
  kyc_en_attente: number;
  litiges_ouverts: number;
  signalements_nouveaux: number;
}

export interface StatsRevenusJour {
  jour: string;
  volume_total: number;
  commission: number;
  nb_transactions: number;
}

export interface CompteActif {
  id: string;
  prenom: string;
  nom: string;
  nombre_livraisons: number | null;
  nombre_colis_confies: number | null;
}

export interface Signalement {
  id: string;
  signaleur_id: string;
  cible_id: string;
  cible_type: string;
  raison: string;
  details: string | null;
  created_at: string;
  statut: string;
  traite_par: string | null;
  traite_at: string | null;
  note_admin: string | null;
}

export interface Litige {
  id: string;
  expediteur_id: string;
  porteur_id: string;
  description_colis: string | null;
  montant_total: number;
  statut_paiement: string;
  statut_avant_litige: string | null;
  conteste_at: string | null;
  conteste_par: string | null;
  resolutions_en_attente: number;
}

export interface FicheKyc {
  id: string;
  prenom: string;
  nom: string;
  kyc_status: string | null;
  kyc_reject_reason: string | null;
  kyc_attempts: number | null;
  kyc_completed_at: string | null;
  created_at: string;
}

export interface FicheCompte {
  id: string;
  prenom: string;
  nom: string;
  bloque: boolean;
  kyc_status: string | null;
  nombre_livraisons: number | null;
  nombre_colis_confies: number | null;
  created_at: string;
  signalements: number;
  signaleurs_distincts: number;
  dernier_signalement: string | null;
  raisons: string[] | null;
}

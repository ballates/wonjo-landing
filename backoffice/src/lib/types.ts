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

export interface StatsColisJour {
  jour: string;
  colis_crees: number;
  colis_livres: number;
}

export interface RepartitionTransaction {
  statut_paiement: string;
  nb: number;
  montant: number;
  commission: number;
}

export interface RepartitionTypeEnvoi {
  type_envoi: string;
  nb: number;
}

export interface CompteActif {
  id: string;
  prenom: string;
  nom: string;
  photo_url: string | null;
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
  photo_url: string | null;
  kyc_status: string | null;
  kyc_reject_reason: string | null;
  kyc_attempts: number | null;
  kyc_completed_at: string | null;
  created_at: string;
}

export interface CompteRecherche {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  photo_url: string | null;
  bloque: boolean;
  kyc_status: string | null;
  id_verifie: boolean | null;
  telephone_verifie: boolean | null;
  niveau: 'debutant' | 'ambassadeur' | 'legende';
  derniere_connexion: string | null;
  created_at: string;
}

export interface FicheCompte {
  id: string;
  prenom: string;
  nom: string;
  email: string | null;
  photo_url: string | null;
  bloque: boolean;
  kyc_status: string | null;
  id_verifie: boolean | null;
  telephone_verifie: boolean | null;
  derniere_connexion: string | null;
  badges: string[] | null;
  note_moyenne: number | null;
  nombre_livraisons: number | null;
  nombre_colis_confies: number | null;
  created_at: string;
  signalements: number;
  signaleurs_distincts: number;
  dernier_signalement: string | null;
  raisons: string[] | null;
}

export interface ActionHistorique {
  id: string;
  created_at: string;
  action: string;
  motif: string | null;
  admin_nom: string | null;
  admin_avatar: string | null;
}

export interface EntreeJournal extends ActionHistorique {
  cible_type: string | null;
  cible_id: string | null;
  cible_nom: string | null;
}

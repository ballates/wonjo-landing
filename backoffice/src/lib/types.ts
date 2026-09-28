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

export interface RepartitionCommissionTypeEnvoi {
  type_envoi: string;
  nb: number;
  montant: number;
  commission: number;
}

export interface RepartitionAnnulations {
  nb_avant_charge: number;
  nb_apres_charge: number;
  montant_apres_charge: number;
  commission_perdue: number;
}

export interface TopAnnulateur {
  user_id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  nb: number;
  montant: number;
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

export interface TransactionListe {
  id: string;
  description_colis: string | null;
  type_envoi: string | null;
  nature_contenu: string | null;
  nb_enveloppes: number | null;
  type_document: string | null;
  annonce_accepte_documents: boolean | null;
  montant_total: number;
  poids_kg: number | null;
  statut_colis: string;
  statut_paiement: string;
  expediteur_id: string;
  expediteur_nom: string | null;
  expediteur_prenom: string | null;
  expediteur_photo: string | null;
  porteur_id: string;
  porteur_nom: string | null;
  porteur_prenom: string | null;
  porteur_photo: string | null;
  created_at: string;
  accepte_at: string | null;
  livre_at: string | null;
  lieu_remise_reception: string | null;
  lieu_remise_livraison: string | null;
  code_genere: boolean;
  a_photo: boolean;
}

export interface PhotoConstat {
  id: string;
  type: string;
  confirmed_by: string;
  notes: string | null;
  created_at: string;
  inspection_certifiee: boolean;
  url: string;
}

export interface EvenementTimeline {
  type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  role: 'expediteur' | 'porteur' | null;
}

export interface AvisApercu {
  id: string;
  note: number;
  commentaire: string | null;
  created_at: string;
  demande_id: string;
  auteur_id: string;
  auteur_nom: string;
  role_auteur: 'expediteur' | 'porteur';
  destinataire_id: string;
  destinataire_nom: string;
  role_destinataire: 'expediteur' | 'porteur';
  lieu_remise_reception: string | null;
  lieu_remise_livraison: string | null;
  statut_colis: string;
}

export interface AvisDashboard {
  distribution: Record<string, number>;
  negatifs: AvisApercu[];
  positifs: AvisApercu[];
  intermediaires: AvisApercu[];
}

export interface AvisListe {
  id: string;
  created_at: string;
  note: number;
  commentaire: string | null;
  demande_id: string;
  statut_colis: string;
  auteur_id: string;
  auteur_nom: string;
  auteur_prenom: string | null;
  role_auteur: 'expediteur' | 'porteur';
  destinataire_id: string;
  destinataire_nom: string;
  destinataire_prenom: string | null;
  role_destinataire: 'expediteur' | 'porteur';
}

export interface FicheTransaction {
  id: string;
  description_colis: string | null;
  nature_contenu: string | null;
  nb_enveloppes: number | null;
  type_document: string | null;
  poids_kg: number | null;
  valeur_declaree: number | null;
  fragile: boolean | null;
  type_envoi: string | null;
  origine: string | null;
  montant_total: number;
  service_fee: number | null;
  taux_commission: number | null;
  statut_colis: string;
  statut_paiement: string;
  statut_avant_litige: string | null;
  created_at: string;
  accepte_at: string | null;
  arrive_at: string | null;
  livre_at: string | null;
  conteste_at: string | null;
  date_depart: string | null;
  date_arrivee: string | null;
  lieu_remise_reception: string | null;
  lieu_remise_livraison: string | null;
  code_genere: boolean;
  code_genere_at: string | null;
  code_essais: number | null;
  code_generations: number | null;
  photo_colis_url: string | null;
  expediteur_id: string;
  expediteur_nom: string | null;
  expediteur_prenom: string | null;
  expediteur_photo: string | null;
  expediteur_telephone: string | null;
  expediteur_telephone_verifie: boolean | null;
  expediteur_id_verifie: boolean | null;
  porteur_id: string;
  porteur_nom: string | null;
  porteur_prenom: string | null;
  porteur_photo: string | null;
  porteur_telephone: string | null;
  porteur_telephone_verifie: boolean | null;
  porteur_id_verifie: boolean | null;
  timeline: EvenementTimeline[];
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
  telephone: string | null;
  photo_url: string | null;
  bloque: boolean;
  bloque_jusqu_a: string | null;
  kyc_status: string | null;
  kyc_attempts: number | null;
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

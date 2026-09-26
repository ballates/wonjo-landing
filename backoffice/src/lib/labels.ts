export const LABELS_STATUT_KYC: Record<string, string> = {
  pending: 'En attente',
  approved: 'Approuvé',
  rejected: 'Rejeté',
  none: 'Non commencé',
};

export const LABELS_PAIEMENT: Record<string, string> = {
  libere: 'Libéré', escrow: 'En séquestre', en_attente: 'En attente', rembourse: 'Remboursé',
  autorise: 'Autorisé', autorisation_annulee: 'Autorisation annulée',
};

export const LABELS_STATUT_COLIS: Record<string, string> = {
  en_attente: 'En attente', accepte: 'Accepté', en_transit: 'En transit',
  arrive: 'Arrivé à destination', remis_porteur: 'Repris par le porteur', livre: 'Livré',
  annule: 'Annulé', litige: 'En litige', restitution_en_cours: 'Restitution en cours',
};

export const LABELS_STATUT_SIGNALEMENT: Record<string, string> = {
  nouveau: 'Nouveau',
  en_cours: 'En cours',
  clos_sans_suite: 'Clos sans suite',
  clos_action_prise: 'Clos - action prise',
};

// Libelles lisibles des actions de admin_audit_log.
export const LABELS_ACTIONS: Record<string, string> = {
  bloquer_compte: 'a bloqué le compte',
  debloquer_compte: 'a débloqué le compte',
  valider_kyc: 'a approuvé la vérification d\'identité',
  rejeter_kyc: 'a rejeté la vérification d\'identité',
  traiter_signalement: 'a traité un signalement',
  changer_role_admin: 'a changé le rôle d\'un administrateur',
  desactiver_admin: 'a désactivé un administrateur',
  reactiver_admin: 'a réactivé un administrateur',
  inviter_admin: 'a invité un administrateur',
  envoyer_email: 'a envoyé un email',
  commission_defaut: 'a modifié le taux de commission par défaut',
  commission_activee: 'a activé les commissions personnalisées',
  commission_desactivee: 'a désactivé les commissions personnalisées',
  commission_regle_creee: 'a proposé une règle de commission',
  commission_defaut_demande: 'a demandé une baisse du taux de commission par défaut',
  commission_activation_demandee: 'a demandé l\'activation des commissions personnalisées',
  commission_approuvee: 'a approuvé un changement de commission',
  commission_rejetee: 'a rejeté un changement de commission',
  commission_regle_desactivee: 'a désactivé une règle de commission',
  litige_rembourser: 'a résolu un litige (remboursement manuel)',
};

export function libelleAction(action: string): string {
  return LABELS_ACTIONS[action] ?? action.replace(/_/g, ' ');
}

const LABELS_ROLES_TXT: Record<string, string> = {
  super_admin: 'Super admin',
  moderation: 'Confiance & sécurité',
  finance: 'Finance',
  lecture_seule: 'Lecture seule',
};

// Le motif brut depend de l'action (statut de signalement, role...) : on le
// rend lisible sans toucher au journal lui-meme.
export function libelleMotif(action: string, motif: string | null): string | null {
  if (!motif) return null;
  if (action === 'traiter_signalement') {
    const [statut, ...note] = motif.split(' - ');
    const lib = LABELS_STATUT_SIGNALEMENT[statut] ?? statut;
    return note.length ? `${lib} : ${note.join(' - ')}` : lib;
  }
  if (action === 'changer_role_admin' || action === 'inviter_admin') {
    return `Rôle : ${LABELS_ROLES_TXT[motif] ?? motif}`;
  }
  return motif;
}

export const LABELS_NIVEAU: Record<string, string> = {
  debutant: 'Débutant',
  ambassadeur: 'Ambassadeur',
  legende: 'Légende',
};

export const LABELS_BADGES: Record<string, string> = {
  verified_phone: 'Téléphone vérifié',
  verified_id: 'Identité vérifiée',
  first_delivery: 'Première livraison',
  ambassadeur_expediteur: 'Ambassadeur',
  ambassadeur_porteur: 'Ambassadeur',
  legende: 'Légende',
};

// Meme regle que l'app (src/utils/reputation.ts) et fn_niveau_reputation.
export function niveauReputation(livraisons?: number | null, colis?: number | null): 'debutant' | 'ambassadeur' | 'legende' {
  const total = (livraisons ?? 0) + (colis ?? 0);
  if (total >= 11) return 'legende';
  if (total >= 5) return 'ambassadeur';
  return 'debutant';
}

export function depuis(iso: string | null): string {
  if (!iso) return 'jamais';
  const j = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (j <= 0) return "aujourd'hui";
  if (j === 1) return 'hier';
  if (j < 30) return `il y a ${j} jours`;
  if (j < 365) return `il y a ${Math.floor(j / 30)} mois`;
  return `il y a ${Math.floor(j / 365)} an(s)`;
}

export function nomComplet(prenom?: string | null, nom?: string | null): string {
  return [prenom, nom].filter(Boolean).join(' ').trim();
}

export function dateHeure(iso: string): string {
  const d = new Date(iso);
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${dateSeule(iso)}, ${heure}`;
}

export function dateSeule(iso: string): string {
  const d = new Date(iso);
  const jour = String(d.getDate()).padStart(2, '0');
  const mois = String(d.getMonth() + 1).padStart(2, '0');
  return `${jour}-${mois}-${d.getFullYear()}`;
}

export const LABELS_TYPE_ENVOI: Record<string, string> = {
  colis: 'Colis', document: 'Document',
};

export const LABELS_CONSTAT: Record<string, string> = {
  remise_expediteur: 'Remise photographiée par l\'expéditeur',
  remise_porteur: 'Réception photographiée par le porteur',
  livraison_porteur: 'Livraison photographiée par le porteur',
  restitution_expediteur: 'Restitution photographiée par l\'expéditeur',
  restitution_porteur: 'Restitution photographiée par le porteur',
};

// annonce_id defini = l'expediteur a demande une place sur le trajet publie
// par le porteur (Flux 1) : c'est l'expediteur qui a cree la demande.
// offre_colis_id defini = le porteur a propose de transporter le colis
// publie par l'expediteur (Flux 2) : c'est le porteur qui a cree la demande.
export const LABELS_ORIGINE: Record<string, string> = {
  annonce: 'Créée par l\'expéditeur, en réponse au trajet publié par le porteur',
  offre_colis: 'Créée par le porteur, en réponse au colis publié par l\'expéditeur',
};

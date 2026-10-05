export const LABELS_STATUT_KYC: Record<string, string> = {
  pending: 'En attente',
  approved: 'Approuvé',
  rejected: 'Rejeté',
  none: 'Non commencé',
};

export const LABELS_PAIEMENT: Record<string, string> = {
  libere: 'Libéré', escrow: 'En séquestre', en_attente: 'En attente', rembourse: 'Remboursé',
  autorise: 'Autorisé', autorisation_annulee: 'Autorisation annulée',
  sans_paiement: 'Sans paiement',
};

// Colis annule avant qu'un voyageur ne l'accepte : aucun paiement n'a
// jamais ete engage, statut_paiement reste a sa valeur de depart
// "en_attente" - ce qui donne a tort l'impression d'un paiement en cours de
// traitement. Cle d'affichage distincte pour ce seul cas, sans toucher a la
// valeur reelle en base (qui reste correcte : rien n'a jamais demarre).
export function clePaiementAffichee(statutPaiement: string, statutColis: string): string {
  return statutColis === 'annule' && statutPaiement === 'en_attente' ? 'sans_paiement' : statutPaiement;
}

export const LABELS_STATUT_COLIS: Record<string, string> = {
  en_attente: 'En attente', accepte: 'Accepté', en_transit: 'En transit',
  arrive: 'Arrivé à destination', remis_porteur: 'Repris par le voyageur', livre: 'Livré',
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
  supprimer_compte: 'a supprimé (anonymisé) le compte',
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
  litige_rembourser: 'a tranché un litige : remboursement de l\'expéditeur',
  litige_verser_voyageur: 'a tranché un litige : paiement du voyageur',
  bornes_poids: 'a modifié les bornes de poids des colis',
  protection_valeur: 'a modifié les frais de protection de la valeur déclarée',
  // [300] moderation
  consulter_conversation: 'a consulté une conversation',
  consulter_coordonnees: 'a consulté les coordonnées',
  masquer_contenu: 'a masqué un contenu',
  demasquer_contenu: 'a réaffiché un contenu',
  // [291] zones enveloppe
  definir_actif_enveloppe: 'a ouvert ou fermé une zone enveloppe',
  reinitialiser_tentatives_kyc: 'a réinitialisé les tentatives de vérification d\'identité',
};

export function libelleAction(action: string): string {
  return LABELS_ACTIONS[action] ?? action.replace(/_/g, ' ');
}

const LABELS_ROLES_TXT: Record<string, string> = {
  super_admin: 'Admin',
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
  if (action === 'consulter_coordonnees') {
    return motif === 'telephone' ? 'Téléphone' : motif === 'adresse' ? 'Adresse' : motif;
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

// Date seule "AAAA-MM-JJ" lue comme date locale (new Date() la lit en minuit
// UTC : la veille a l'ouest de Greenwich). Les instants gardent la lecture native.
export function versDate(v: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v);
}

// Date du jour a Paris, en AAAA-MM-JJ : la reference des regles de commission
// cote serveur (migration 313), quel que soit le fuseau du navigateur.
export function aujourdhuiParis(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}

export function dateSeule(iso: string): string {
  const d = versDate(iso);
  const jour = String(d.getDate()).padStart(2, '0');
  const mois = String(d.getMonth() + 1).padStart(2, '0');
  return `${jour}/${mois}/${d.getFullYear()}`;
}

// Deux seules valeurs possibles en base (type_envoi IN ('colis','document')) :
// meme libelle partout ou le type d'envoi est affiche (Colis, Finance, Transactions).
export const LABELS_TYPE_ENVOI: Record<string, string> = {
  colis: 'Colis', document: 'Enveloppe', inconnu: 'Non renseigné',
};

export const LABELS_TYPE_DOCUMENT: Record<string, string> = {
  passeport: 'Passeport', acte_naissance: 'Acte de naissance', diplome: 'Diplôme',
  ordonnance: 'Ordonnance', autre: 'Autre',
};

export const LABELS_CONSTAT: Record<string, string> = {
  remise_expediteur: 'Remise par l\'expéditeur',
  remise_porteur: 'Réception par le voyageur',
  livraison_porteur: 'Livraison par le voyageur',
  restitution_expediteur: 'Restitution par l\'expéditeur',
  restitution_porteur: 'Restitution par le voyageur',
};

// Premier mot d'un prenom (compose ou non) : utilise dans les colonnes de
// liste (Transactions, Avis) ou l'espace est compte - un prenom complet
// ("Marthe Djininga") y serait tronque de toute facon, autant couper au
// premier prenom plutot qu'au milieu du second.
export function premierMot(texte: string | null | undefined): string | null {
  const mot = (texte ?? '').trim().split(/\s+/)[0];
  return mot || null;
}

// Casse d'affichage dans les colonnes des tables du back-office (Comptes,
// KYC, Transactions, Avis) : uniforme quelle que soit la casse saisie par la
// personne dans l'app. Ne change rien en base, purement cosmetique.
export function casserPrenom(prenom: string | null | undefined): string {
  const p = (prenom ?? '').trim();
  if (!p) return '-';
  return p.split(/\s+/).map((mot) => mot.charAt(0).toUpperCase() + mot.slice(1).toLowerCase()).join(' ');
}

export function casserNom(nom: string | null | undefined): string {
  const n = (nom ?? '').trim();
  return n ? n.toUpperCase() : '-';
}

// Version de LABELS_CONSTAT/des jalons d'etape avec le prenom reel des deux
// parties a la place de "l'expediteur"/"le porteur".
export function libellesEvenement(prenomExpediteur: string, prenomPorteur: string): Record<string, string> {
  return {
    creee: 'Demande créée',
    acceptee: `Acceptée par ${prenomPorteur}`,
    code_genere: 'Code de livraison généré',
    arrivee: 'Arrivée déclarée',
    livree: 'Livrée',
    contestee: 'Contestée (litige ouvert)',
    declaration_expediteur: `Déclaration de ${prenomExpediteur}`,
    acceptation_porteur: `Acceptation de ${prenomPorteur}`,
    presomption_acceptation: 'Acceptation présumée (délai écoulé)',
    contestation: 'Litige ouvert',
    proposition_resolution: 'Proposition de résolution',
    acceptation_resolution: 'Résolution acceptée',
    refus_resolution: 'Résolution refusée',
    remise_expediteur: `Remise par ${prenomExpediteur}`,
    remise_porteur: `Réception par ${prenomPorteur}`,
    livraison_porteur: `Livraison par ${prenomPorteur}`,
    restitution_expediteur: `Restitution par ${prenomExpediteur}`,
    restitution_porteur: `Restitution par ${prenomPorteur}`,
  };
}

// Categorie d'un avis a partir de sa note (1-5), meme decoupage que
// l'intuition "negatif / intermediaire / positif" du widget Communaute.
export function categorieAvis(note: number): 'negatif' | 'intermediaire' | 'positif' {
  if (note <= 2) return 'negatif';
  if (note === 3) return 'intermediaire';
  return 'positif';
}

export const LABELS_CATEGORIE_AVIS: Record<string, string> = {
  negatif: 'Négatif', intermediaire: 'Intermédiaire', positif: 'Positif',
};

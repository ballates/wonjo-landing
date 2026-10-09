// Signaux de la surveillance de securite (migration 333) : libelles lisibles,
// explication et conduite a tenir par type. Le serveur reste la source des
// signaux ; ceci ne fait que les rendre intelligibles.

export type GraviteSignal = 'alerte' | 'a_verifier' | 'a_surveiller';

export interface SignalSecurite {
  id: string;
  detecte_at: string;
  type: string;
  gravite: GraviteSignal;
  titre: string;
  details: Record<string, unknown>;
  traite_at: string | null;
  traite_par_nom: string | null;
  note: string | null;
}

export const LABELS_GRAVITE: Record<GraviteSignal, string> = {
  alerte: 'Alerte',
  a_verifier: 'À vérifier',
  a_surveiller: 'À surveiller',
};

export const TONS_GRAVITE: Record<GraviteSignal, 'danger' | 'amber' | 'muted'> = {
  alerte: 'danger',
  a_verifier: 'amber',
  a_surveiller: 'muted',
};

interface Fiche {
  // Ce que le signal veut dire, en une phrase.
  sens: string;
  // Ce qu'il faut faire, dans l'ordre.
  conduite: string[];
}

const FICHES: Record<string, Fiche> = {
  argent_incoherent: {
    sens: 'L\'argent et le colis sont dans un état qui n\'existe pas dans le parcours normal : une règle de la machine à états a été contournée.',
    conduite: [
      'Ouvrez la transaction et relisez sa chronologie.',
      'Ne libérez ni ne remboursez rien avant d\'avoir compris ce qui s\'est passé.',
      'Si un compte est en cause, bloquez-le puis corrigez la faille par migration, avec le test qui manquait.',
    ],
  },
  escrow_sans_stripe: {
    sens: 'Des fonds figurent comme détenus ou libérés sans paiement Stripe réel derrière.',
    conduite: [
      'Cherchez la transaction dans Stripe : un paiement existe-t-il ?',
      'S\'il n\'y en a aucun, personne n\'a payé : bloquez la libération et le compte concerné.',
      'Si c\'est une donnée de test ancienne, traitez le signal avec une note.',
    ],
  },
  livre_sans_preuve: {
    sens: 'Une livraison est enregistrée sans photo, sans code, sans présomption de 7 jours ni décision de résolution : le chemin supprimé par la migration 190 a peut-être été rouvert.',
    conduite: [
      'Ouvrez la transaction : y a-t-il un moyen légitime de livrer sans preuve ?',
      'Vérifiez si les fonds ont été libérés, et à qui.',
      'Si c\'est un contournement, corrigez par migration et ajoutez le cas au test 11.',
    ],
  },
  identite_sans_kyc: {
    sens: 'Un compte porte le badge « vérifié » sans vérification d\'identité approuvée, ou son badge et son statut sont en désaccord.',
    conduite: [
      'Ouvrez le compte et comparez avec la file KYC.',
      'Retirez le badge et bloquez le compte si la vérification n\'a jamais eu lieu.',
      'Cherchez comment il l\'a obtenu : c\'est une écriture directe qui a échappé à un trigger.',
    ],
  },
  garde_desactivee: {
    sens: 'Une protection de la base est coupée : un trigger de garde est désactivé, ou une table n\'a plus de sécurité par ligne (RLS).',
    conduite: [
      'Si ce n\'est pas vous, rétablissez la protection immédiatement.',
      'Changez les accès à la base : quelqu\'un ou quelque chose a eu des droits d\'administrateur.',
      'Si c\'est vous (maintenance), rétablissez-la puis traitez le signal.',
    ],
  },
  admin_sans_trace: {
    sens: 'Un compte administrateur existe sans invitation inscrite au journal : il a été ajouté en dehors du back-office.',
    conduite: [
      'Si ce n\'est pas vous, désactivez ce compte administrateur sur la page Admin.',
      'Changez les accès à la base et regardez le journal des actions.',
      'Si c\'est un compte que vous avez posé à la main, traitez le signal avec une note.',
    ],
  },
  fonds_sous_contestation: {
    sens: 'Des fonds ont été libérés alors qu\'une contestation reste active : rétrofacturation postérieure à la libération, ou libération indue.',
    conduite: [
      'Ouvrez la transaction et regardez l\'ordre des événements.',
      'S\'il s\'agit d\'une rétrofacturation Stripe, vérifiez que le Transfer Reversal est parti.',
    ],
  },
  compteurs_hors_norme: {
    sens: 'Le compteur de livraisons ou de colis confiés d\'un compte dépasse le nombre de livraisons constatées. Ils sont verrouillés en écriture depuis la migration 122.',
    conduite: [
      'Ouvrez le compte : y a-t-il un historique de test ou une livraison annulée ensuite ?',
      'Sinon, un compteur a été modifié : cherchez comment, puis corrigez-le.',
    ],
  },
  telephone_incoherent: {
    sens: 'Le téléphone est marqué vérifié sans badge, ou l\'inverse.',
    conduite: ['Ouvrez le compte et comparez avec le badge « téléphone ».'],
  },
  droits_modifies: {
    sens: 'Des droits, policies, fonctions, triggers, tâches planifiées, buckets ou administrateurs ont changé depuis le dernier passage. C\'est normal après une migration.',
    conduite: [
      'Lisez la liste : correspond-elle à la migration que vous venez d\'appliquer ?',
      'Si oui, traitez le signal avec le numéro de la migration.',
      'Si vous n\'avez rien appliqué, c\'est un changement non voulu : traitez-le comme une alerte.',
    ],
  },
  ip_proche_plafond: {
    sens: 'Une adresse IP s\'approche de nos plafonds d\'envois de code d\'inscription ou de sondes d\'adresses e-mail. Derrière un opérateur mobile, plusieurs vrais utilisateurs peuvent partager une IP.',
    conduite: [
      'Ne faites rien tant que le signal reste isolé.',
      'S\'il se répète les jours suivants, c\'est du sondage : le plafond protège déjà, mais gardez la trace.',
    ],
  },
  rafale_inscriptions: {
    sens: 'Beaucoup de comptes créés en une heure.',
    conduite: [
      'Regardez les comptes récents sur la page Confiance : adresses e-mail similaires ?',
      'Si ce sont des inscriptions légitimes (campagne, événement), traitez le signal.',
    ],
  },
  refus_en_rafale: {
    sens: 'Un compte ou une adresse IP accumule les appels refusés (401/403) : il essaie des choses interdites. L\'application légitime en produit presque jamais.',
    conduite: [
      'Si un compte est indiqué, ouvrez sa fiche : ancienneté, activité, signalements.',
      'Un compte clairement hostile se bloque depuis sa fiche ; bloquez aussi la réinscription.',
      'Une adresse seule ne se bloque pas à l\'entrée : les protections et plafonds de la base tiennent déjà. Surveillez si elle revient les jours suivants.',
    ],
  },
  lectures_massives: {
    sens: 'Un compte ou une adresse lit un volume inhabituel de données en une heure : aspiration possible des profils ou des annonces. Ces lectures sont autorisées, c\'est leur quantité qui est anormale.',
    conduite: [
      'Ouvrez le compte : un utilisateur normal charge quelques dizaines de pages, pas des centaines.',
      'Si c\'est de l\'aspiration, bloquez le compte. Le blocage empêche de publier ou de s\'engager, pas de lire : pour couper les lectures, il faut aussi couper ses sessions dans Supabase (Authentication, Users).',
    ],
  },
  sondage_admin: {
    sens: 'Quelqu\'un appelle à répétition des fonctions d\'administration et se les voit refuser. Un utilisateur normal n\'y touche jamais.',
    conduite: [
      'Ouvrez le compte : est-ce un administrateur qui clique sur une page interdite pour son rôle ?',
      'Sinon, un membre explore l\'API : bloquez-le et relisez la liste des fonctions administration (test 14).',
    ],
  },
  fonction_refusee: {
    sens: 'Un appel a été refusé par une Edge Function. Sur un webhook (Stripe, Didit, e-mails), un seul refus est déjà un fait : falsification, ou secret mal reporté après une rotation.',
    conduite: [
      'Webhook de Stripe ou de Didit : vérifiez que les secrets du tableau de bord correspondent à ceux de Supabase.',
      'Si les secrets sont bons, quelqu\'un envoie de faux événements : la signature les rejette, rien n\'est passé.',
      'Plusieurs fonctions ordinaires sondées depuis une même adresse : sondage de l\'API, sans effet tant que les gardes tiennent.',
    ],
  },
  connexions_echouees: {
    sens: 'Une série d\'échecs de connexion par mot de passe depuis une même adresse : devinette de mots de passe, ou quelqu\'un qui a oublié le sien.',
    conduite: [
      'Un seul compte visé et peu d\'essais : probablement un utilisateur qui se trompe.',
      'Beaucoup d\'essais : c\'est de la devinette. Les limites de débit de Supabase Auth la freinent ; vérifiez leur réglage (Authentication, Rate limits).',
      'Regardez s\'il y a ensuite une « connexion réussie après échecs » : c\'est elle qui compte.',
    ],
  },
  connexion_suspecte: {
    sens: 'Une connexion a réussi depuis une adresse qui venait d\'enchaîner les échecs : le mot de passe a peut-être été deviné.',
    conduite: [
      'Ouvrez le compte et regardez ses actions depuis la connexion : publications, demandes, changements de profil, téléphone, adresse.',
      'Coupez ses sessions dans Supabase (Authentication, Users) et faites-lui réinitialiser son mot de passe.',
      'Prévenez la personne. Si des données personnelles ont été consultées, notez l\'heure : une déclaration à la CNIL peut être due dans les 72 heures.',
    ],
  },
  erreurs_serveur: {
    sens: 'Plusieurs erreurs serveur (5xx) en une heure. Pas une attaque en soi, mais une requête malformée ou un service en difficulté.',
    conduite: ['Regardez les journaux de la fonction ou de la table concernée dans Supabase.', 'Si cela dure, vérifiez l\'état de Supabase.'],
  },
  erreurs_base: {
    sens: 'La base a refusé plusieurs requêtes de membres en une heure (droits, sécurité par ligne, nos propres gardes). Nos tests sont exclus.',
    conduite: [
      'Lisez les messages : « Acces reserve » veut dire une fonction d\'administration appelée par un non-administrateur ; « row-level security » une écriture interdite.',
      'Un volume modeste est normal. Un pic avec les mêmes messages, c\'est quelqu\'un qui teste l\'API.',
    ],
  },
  auth_en_rafale: {
    sens: 'Beaucoup d\'inscriptions ou de demandes de réinitialisation depuis une même adresse.',
    conduite: [
      'Les délais par utilisateur (migration 184) et le plafond d\'e-mails limitent déjà les dégâts.',
      'Surveillez : ce type d\'appel peut vider le quota d\'e-mails du projet.',
    ],
  },
  collecte_arretee: {
    sens: 'Le collecteur horaire des logs ne s\'est pas exécuté depuis plus de 3 heures : pendant ce temps, pics de refus, rafales et échecs de connexion ne sont pas vus.',
    conduite: [
      'Ouvrez GitHub, onglet Actions, « Surveillance des logs de sécurité » : le dernier passage a-t-il échoué ?',
      'Cause la plus fréquente : le jeton SUPABASE_ACCESS_TOKEN a expiré ou a été révoqué. Générez-en un nouveau et mettez à jour le secret.',
      'Le signal se referme tout seul à la reprise.',
    ],
  },
  codes_qr_epuises: {
    sens: 'Une série de codes QR de remise ou de restitution a été épuisée.',
    conduite: [
      'Souvent une rencontre qui n\'aboutit pas : pas d\'action.',
      'Si cela se répète sur un même compte, ouvrez sa fiche.',
    ],
  },
};

export function ficheSignal(type: string): Fiche {
  return FICHES[type] ?? { sens: '', conduite: [] };
}

const court = (v: unknown) => `${String(v ?? '').slice(0, 8)}…`;

// Une ligne de detail lisible, sans recopier plus que necessaire.
export function resumeSignal(s: SignalSecurite): string {
  const d = s.details ?? {};
  switch (s.type) {
    case 'argent_incoherent':
      return `Colis « ${d.statut_colis} », paiement « ${d.statut_paiement} »`;
    case 'escrow_sans_stripe':
      return `Paiement « ${d.statut_paiement} » sans identifiant Stripe`;
    case 'livre_sans_preuve':
      return 'Livrée sans constat, code ni décision';
    case 'identite_sans_kyc':
      return `Statut KYC « ${d.kyc_status ?? 'aucun'} », badge vérifié : ${d.id_verifie ? 'oui' : 'non'}`;
    case 'telephone_incoherent':
      return `Téléphone vérifié : ${d.telephone_verifie ? 'oui' : 'non'}, badge absent ou en trop`;
    case 'garde_desactivee':
      return d.trigger ? `${d.table}.${d.trigger} (état « ${d.etat} »)` : `Table ${d.table}`;
    case 'admin_sans_trace':
      return `Rôles : ${d.roles}, actif : ${d.actif ? 'oui' : 'non'}`;
    case 'fonds_sous_contestation':
      return 'Transaction concernée ci-contre';
    case 'compteurs_hors_norme':
      return `${d.nombre_livraisons} livraisons annoncées / ${d.constatees_voyageur} constatées ; `
        + `${d.nombre_colis_confies} colis confiés / ${d.constatees_expediteur} constatés`;
    case 'droits_modifies':
      return `${d.nb_ajoutes} ajouté(s), ${d.nb_retires} retiré(s)`;
    case 'ip_proche_plafond':
      return `${d.ip} : ${d.sur_24h} appels en 24 h (${d.source === 'otp' ? 'codes d\'inscription' : 'sondes d\'e-mail'})`;
    case 'rafale_inscriptions':
      return `${d.comptes_sur_1h} comptes créés en 1 heure`;
    case 'refus_en_rafale':
      return `${d.refus} appels refusés${d.ip ? ` depuis ${d.ip}` : ''}${d.pays ? ` (${d.pays})` : ''}`;
    case 'lectures_massives':
      return `${d.lectures} lectures dont ${d.profils} de profils en une heure${d.ip ? `, depuis ${d.ip}` : ''}`;
    case 'sondage_admin':
      return `${d.refus} appels refusés sur des fonctions d'administration${d.ip ? ` depuis ${d.ip}` : ''}`;
    case 'fonction_refusee':
      return d.fonction ? `${d.fonction} : ${d.refus} refus depuis ${d.ip}${d.pays ? ` (${d.pays})` : ''}`
        : `${d.refus} refus sur ${(d.fonctions as string[] | undefined)?.join(', ') ?? 'des fonctions'} depuis ${d.ip}`;
    case 'connexions_echouees':
      return `${d.echecs} échecs de connexion depuis ${d.ip}`;
    case 'connexion_suspecte':
      return `Connexion réussie après ${d.echecs} échecs depuis ${d.ip}`;
    case 'erreurs_serveur':
      return `${d.erreurs} erreurs serveur`;
    case 'erreurs_base':
      return `${d.erreurs} refus de la base${(d.messages as { message: string }[] | undefined)?.[0] ? `, surtout « ${(d.messages as { message: string }[])[0].message} »` : ''}`;
    case 'auth_en_rafale':
      return `${d.appels} appels d'inscription ou de réinitialisation depuis ${d.ip}`;
    case 'collecte_arretee':
      return `Dernier passage : ${String(d.dernier_passage ?? '').slice(0, 16).replace('T', ' ')}`;
    case 'codes_qr_epuises':
      return `${d.phase === 'restitution' ? 'Restitution' : 'Remise'}, série n°${d.series_epuisees}`;
    default:
      return court(JSON.stringify(d));
  }
}

// Identifiants que le back-office sait ouvrir (compte ou transaction).
export function cibleSignal(s: SignalSecurite): { kind: 'compte' | 'transaction'; id: string } | null {
  const d = s.details ?? {};
  if (typeof d.demande_id === 'string') return { kind: 'transaction', id: d.demande_id };
  if (typeof d.profil_id === 'string') return { kind: 'compte', id: d.profil_id };
  if (typeof d.admin_id === 'string') return { kind: 'compte', id: d.admin_id };
  return null;
}

// Titre court et accentue par type. Les titres du serveur sont ceux d'un
// journal (sans accents, parfois longs) : on affiche celui-ci a la place.
const TITRES: Record<string, string> = {
  argent_incoherent: 'Argent et colis incohérents',
  escrow_sans_stripe: 'Fonds détenus sans paiement Stripe',
  livre_sans_preuve: 'Livraison sans aucune preuve',
  identite_sans_kyc: 'Badge vérifié sans identité approuvée',
  telephone_incoherent: 'Téléphone vérifié sans badge',
  garde_desactivee: 'Protection de la base coupée',
  admin_sans_trace: 'Administrateur sans invitation',
  fonds_sous_contestation: 'Fonds libérés sous contestation',
  compteurs_hors_norme: 'Compteurs de réputation trop élevés',
  droits_modifies: 'Configuration modifiée',
  ip_proche_plafond: 'Adresse IP proche d\'un plafond',
  rafale_inscriptions: 'Rafale d\'inscriptions',
  refus_en_rafale: 'Appels refusés en rafale',
  lectures_massives: 'Lectures de données en masse',
  sondage_admin: 'Fonctions d\'administration sondées',
  fonction_refusee: 'Appel refusé sur une fonction',
  connexions_echouees: 'Échecs de connexion en série',
  connexion_suspecte: 'Connexion suspecte après des échecs',
  erreurs_serveur: 'Erreurs serveur',
  erreurs_base: 'Requêtes refusées par la base',
  auth_en_rafale: 'Inscriptions ou réinitialisations en rafale',
  collecte_arretee: 'Collecte des logs arrêtée',
  codes_qr_epuises: 'Codes QR épuisés',
};

// Pour « configuration modifiee », le serveur precise ce qui a bouge dans son titre.
const CHANGEMENTS: Array<[RegExp, string]> = [
  [/droits d.execution/i, 'Droits d\'exécution des fonctions modifiés'],
  [/taches planifiees/i, 'Tâches planifiées modifiées'],
  [/policies|politiques/i, 'Règles d\'accès aux données modifiées'],
  [/triggers|gardes/i, 'Protections de la base modifiées'],
  [/fonctions/i, 'Fonctions critiques modifiées'],
  [/buckets|stockage/i, 'Stockage de fichiers modifié'],
  [/admin/i, 'Administrateurs modifiés'],
];

export function titreSignal(s: SignalSecurite): string {
  if (s.type === 'droits_modifies') {
    const trouve = CHANGEMENTS.find(([re]) => re.test(s.titre));
    if (trouve) return trouve[1];
  }
  return TITRES[s.type] ?? s.titre;
}

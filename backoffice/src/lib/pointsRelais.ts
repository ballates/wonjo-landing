// Types et libelles partages par l'onglet Points relais (docs/POINTS_RELAIS.md du depot wonjo).

export type Operateur = 'orange_money' | 'wave' | 'mtn_momo' | 'moov_money' | 'free_money' | 'autre';
export interface CompteMobileMoney { operateur: Operateur; numero: string; titulaire: string }

export interface PointRelais {
  id: string;
  nom: string;
  pays_code: string;
  pays_nom: string | null;
  ville: string;
  adresse: string;
  telephone: string;
  horaires: string;
  devise: string;
  comptes_mobile_money: CompteMobileMoney[];
  accepte_especes: boolean;
  plafond_dossier: number | null;
  plafond_jour_agent: number | null;
  plafond_especes: number | null;
  actif: boolean;
  nb_agents: number;
  created_at: string;
}

export interface MonPoint { point_id: string; nom: string; ville: string; pays_code: string; actif: boolean; permissions: Permission[] }

export type Permission = 'valider_paiement' | 'remise' | 'confier_colis' | 'payer_voyageur' | 'rembourser' | 'annuler';
export const PERMISSIONS: { cle: Permission; label: string; aide: string }[] = [
  { cle: 'valider_paiement', label: 'Valider les paiements', aide: 'Mobile money ou espèces reçus d\'un expéditeur' },
  { cle: 'remise', label: 'Dépôts et remises', aide: 'Recevoir un colis déposé et le remettre au voyageur' },
  { cle: 'confier_colis', label: 'Confier des colis', aide: 'Chercher un voyageur et lui envoyer une demande (guichet)' },
  { cle: 'payer_voyageur', label: 'Payer les voyageurs', aide: 'Payer le voyageur après la livraison, avec son code de retrait' },
  { cle: 'rembourser', label: 'Rembourser', aide: 'Rendre l\'argent à l\'expéditeur quand un dossier est annulé' },
  { cle: 'annuler', label: 'Annuler un dossier', aide: 'Annuler un dossier au nom de l\'expéditeur' },
];
export const LABEL_PERMISSION = Object.fromEntries(PERMISSIONS.map((p) => [p.cle, p.label])) as Record<Permission, string>;

export const OPERATEURS: { value: Operateur; label: string; couleur: string }[] = [
  { value: 'orange_money', label: 'Orange Money', couleur: '#FF7900' },
  { value: 'wave', label: 'Wave', couleur: '#1DC8FF' },
  { value: 'mtn_momo', label: 'MTN MoMo', couleur: '#FFCB05' },
  { value: 'moov_money', label: 'Moov Money', couleur: '#0066B3' },
  { value: 'free_money', label: 'Free Money', couleur: '#CD1E25' },
  { value: 'autre', label: 'Autre', couleur: '#8A879E' },
];
export const LABEL_OPERATEUR = Object.fromEntries(OPERATEURS.map((o) => [o.value, o.label])) as Record<Operateur, string>;
export const COULEUR_OPERATEUR = Object.fromEntries(OPERATEURS.map((o) => [o.value, o.couleur])) as Record<Operateur, string>;

// Moyen enregistre au grand livre (caisse_mouvements.moyen) : « autre » y devient « autre_mobile ».
export type MoyenRecu = Exclude<Operateur, 'autre'> | 'autre_mobile' | 'especes';
export function moyenDepuisOperateur(o: Operateur): MoyenRecu {
  return o === 'autre' ? 'autre_mobile' : o;
}

export function libelleDevise(devise: string): string {
  return devise === 'XOF' || devise === 'XAF' ? 'FCFA' : devise;
}

export function montantLocal(v: number | null | undefined, devise: string): string {
  if (v == null) return '-';
  return `${Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${libelleDevise(devise)}`;
}

export function montantEuros(v: number | null | undefined): string {
  if (v == null) return '-';
  return `${Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export type Urgence = 'depasse' | 'urgent' | 'proche' | 'ok';

/** Temps restant avant une echeance, lisible (« dans 5 h 20 », « dépassée depuis 12 min »), et son urgence. */
export function echeanceRelative(iso: string, maintenant = Date.now()): { texte: string; urgence: Urgence } {
  const ms = new Date(iso).getTime() - maintenant;
  const abs = Math.abs(ms);
  const min = Math.round(abs / 60000);
  const h = Math.floor(min / 60);
  const j = Math.floor(h / 24);
  const duree = j >= 1 ? `${j} j ${h % 24} h` : h >= 1 ? `${h} h ${String(min % 60).padStart(2, '0')}` : `${min} min`;
  if (ms <= 0) return { texte: `dépassée depuis ${duree}`, urgence: 'depasse' };
  return { texte: `dans ${duree}`, urgence: ms < 6 * 3600000 ? 'urgent' : ms < 24 * 3600000 ? 'proche' : 'ok' };
}

export function dateCourte(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ── Refus « ce trajet ne peut pas passer par le point relais » ──────────────────────────────────
// Le serveur renvoie « Ce trajet ne peut pas passer par le point relais (depart_trop_proche) » : un code technique que personne
// ne comprend. Ici, une phrase qui dit POURQUOI et QUOI FAIRE. `depart` : le depart du trajet, en texte lisible (facultatif).
const RAISONS_REFUS: Record<string, (depart?: string) => string> = {
  depart_trop_proche: (d) =>
    `Ce trajet part trop tôt${d ? ` (${d})` : ''}. Le colis doit être payé puis confié au point relais au moins 12 h avant le départ, `
    + 'et le client a besoin d\'au moins 3 h pour payer : le trajet doit donc partir dans plus de 15 h. Choisissez un trajet qui part plus tard.',
  plafond_depasse: () => 'Ce colis coûte plus que le plafond autorisé par dossier pour ce point relais. Réduisez le poids ou la valeur déclarée, ou choisissez un autre trajet.',
  voyageur_non_payable: () => 'Ce voyageur ne pourrait pas être payé à l\'arrivée : il n\'a pas de compte de paiement actif et aucun point relais n\'est ouvert dans le pays d\'arrivée. Choisissez un autre trajet.',
  trajet_non_couvert: () => 'Ce trajet n\'est pas couvert par le service point relais pour le moment. Choisissez un trajet entre deux pays ouverts.',
  aucun_point: () => 'Aucun point relais actif dans le pays de départ de ce trajet.',
  inactif: () => 'Ce point relais est fermé : il ne peut plus recevoir de colis.',
  montant_indisponible: () => 'Le prix de ce colis n\'a pas pu être calculé (taux de change indisponible). Réessayez dans un instant.',
  deja_payee: () => 'Cette demande est déjà payée.',
  carte_commencee: () => 'Un paiement par carte est déjà en cours pour cette demande.',
};

/** Message lisible pour une erreur de l'envoi d'un colis au guichet ; le message du serveur est conserve s'il n'a rien de technique. */
export function messageRefusPointRelais(e: { message: string; hint?: string | null }, depart?: string): string {
  const code = e.hint?.startsWith('point_relais_') ? e.hint.slice('point_relais_'.length) : /point relais \((\w+)\)/.exec(e.message)?.[1];
  const f = code ? RAISONS_REFUS[code] : undefined;
  return f ? f(depart) : e.message;
}

// ── Frais de la valeur declaree (migrations 318 et 418) ─────────────────────────────────────────
export interface BaremeProtection { actif: boolean; seuil1: number; seuil2: number; taux1: number; taux2: number }

/** Meme calcul que fn_frais_protection de la base (verifie par le test 59) : rien jusqu'au seuil 1, taux 1 sur la part entre les deux
 *  seuils, taux 2 au-dela, au centime. Apercu seulement : le montant debite est celui que le serveur fige sur la demande. */
export function fraisProtection(valeur: number, b: BaremeProtection | null): number {
  if (!b || !b.actif || !Number.isFinite(valeur) || valeur <= b.seuil1) return 0;
  const t1 = (Math.min(valeur, b.seuil2) - b.seuil1) * b.taux1;
  const t2 = Math.max(valeur - b.seuil2, 0) * b.taux2;
  return Math.round((t1 + t2) * 100) / 100;
}

/** « 5 % » ou « 3,5 % » : un taux de 0,05 devient 5. */
export function pourcent(taux: number): string {
  return `${(Math.round(taux * 1000) / 10).toLocaleString('fr-FR')} %`;
}

// Types et libelles partages par l'onglet Points relais (docs/POINTS_RELAIS.md du depot wonjo).
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type Operateur = 'orange_money' | 'wave' | 'mtn_momo' | 'moov_money' | 'autre';
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

// ── Equivalents euro <-> monnaie du point ───────────────────────────────────────────────────────
// Une personne peut avoir cree son trajet en euros (voyageur installe en France) alors que le point travaille dans une autre
// monnaie : partout ou un montant est en euros, le point voit aussi ce que ca fait dans sa monnaie, et inversement.
// Le taux vient du SERVEUR (admin_pr_taux_change = prive.fn_taux_euro, le meme que celui fige dans le dossier) : 655,957 pour le franc
// CFA (parite fixe), 1 pour l'euro, sinon le taux enregistre (indicatif : il varie). Une monnaie sans taux enregistre n'a pas
// d'equivalent affiche : on n'invente jamais un taux. Les composants appellent useTauxEuro(devise) pour charger le taux ; les
// fonctions ci-dessous lisent ensuite ce cache.
export const TAUX_CFA = 655.957;
const estCfa = (devise: string) => devise === 'XOF' || devise === 'XAF';
interface Taux { taux: number | null; fixe: boolean }
const cacheTaux = new Map<string, Taux>();
const enCours = new Set<string>();

/** Taux connu pour une monnaie (null = inconnu ou monnaie = euro : pas d'equivalent). */
export function tauxDe(devise: string): number | null {
  if (devise === 'EUR') return null;
  if (estCfa(devise)) return TAUX_CFA;
  return cacheTaux.get(devise)?.taux ?? null;
}
const tauxFixe = (devise: string) => estCfa(devise) || (cacheTaux.get(devise)?.fixe ?? false);

function chargerTaux(devise: string, quandPret: () => void) {
  if (devise === 'EUR' || estCfa(devise) || cacheTaux.has(devise) || enCours.has(devise)) return;
  enCours.add(devise);
  supabase.rpc('admin_pr_taux_change', { p_devise: devise }).then(({ data }) => {
    const r = data as { taux: number | null; fixe: boolean } | null;
    cacheTaux.set(devise, { taux: r?.taux != null ? Number(r.taux) : null, fixe: !!r?.fixe });
    enCours.delete(devise);
    quandPret();
  });
}

/** Charge le taux euro -> `devise` (une fois par monnaie) et re-affiche le composant quand il arrive. */
export function useTauxEuro(devise: string): { taux: number | null; fixe: boolean } {
  const [, majAffichage] = useState(0);
  useEffect(() => chargerTaux(devise, () => majAffichage((n) => n + 1)), [devise]);
  return { taux: tauxDe(devise), fixe: tauxFixe(devise) };
}
/** Pareil pour plusieurs monnaies (vue du reseau de points de monnaies differentes). */
export function useTauxEuros(devises: string[]): void {
  const [, majAffichage] = useState(0);
  const cle = [...new Set(devises)].sort().join(',');
  useEffect(() => { cle.split(',').filter(Boolean).forEach((d) => chargerTaux(d, () => majAffichage((n) => n + 1))); }, [cle]);
}

/** « 1 € = 655,957 FCFA (taux fixe) » ou « 1 € = 10,9 MAD (taux indicatif) » ; vide sans taux. */
export function texteTaux(devise: string): string {
  const t = tauxDe(devise);
  if (t == null) return '';
  return `1 € = ${t.toLocaleString('fr-FR', { minimumFractionDigits: estCfa(devise) ? 3 : 0, maximumFractionDigits: 4 })} ${libelleDevise(devise)} (${tauxFixe(devise) ? 'taux fixe' : 'taux indicatif'})`;
}

/** « ≈ 23 089 FCFA » (arrondi au-dessus, comme le serveur) ; chaine vide sans taux. */
export function equivalentLocal(eur: number | null | undefined, devise: string): string {
  const t = tauxDe(devise);
  if (eur == null || t == null || !Number.isFinite(Number(eur))) return '';
  return `≈ ${Math.ceil(Number(eur) * t).toLocaleString('fr-FR')} ${libelleDevise(devise)}`;
}
/** « ≈ 35,20 € » pour un montant en monnaie locale. */
export function equivalentEuros(local: number | null | undefined, devise: string): string {
  const t = tauxDe(devise);
  if (local == null || t == null || !Number.isFinite(Number(local))) return '';
  return `≈ ${(Math.round(Number(local) / t * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}
/** « 35,20 € (≈ 23 089 FCFA) » */
export function montantEurosEtLocal(eur: number | null | undefined, devise: string): string {
  const eq = equivalentLocal(eur, devise);
  return eq ? `${montantEuros(eur)} (${eq})` : montantEuros(eur);
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

// 21/10/26 : jour, mois, annee sur deux chiffres, sans jour de semaine ni heure.
export function dateJour(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function dateCourte(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ── Refus « ce trajet ne peut pas passer par le point relais » ──────────────────────────────────
// Le serveur renvoie « Ce trajet ne peut pas passer par le point relais (depart_trop_proche) » : un code technique que personne
// ne comprend. Ici, une phrase qui dit POURQUOI et QUOI FAIRE. `depart` : le depart du trajet, en texte lisible (facultatif).
const RAISONS_REFUS: Record<string, (depart?: string) => string> = {
  depart_trop_proche: (d) =>
    `Ce trajet part trop tôt${d ? ` (${d})` : ''}. Le client a besoin d'au moins 3 h pour payer, et le colis doit être confié au point relais au moins 3 h avant le départ : `
    + 'le trajet doit donc partir dans plus de 6 h. Choisissez un trajet qui part plus tard.',
  plafond_depasse: () => 'Ce colis coûte plus que le plafond autorisé par dossier pour ce point relais. Réduisez le poids ou la valeur déclarée, ou choisissez un autre trajet.',
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

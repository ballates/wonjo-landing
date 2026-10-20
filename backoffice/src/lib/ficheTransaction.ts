import { supabase } from './supabase';
import type { FicheTransaction, PhotoConstat } from './types';

// Chargement de la fiche transaction, avec prechargement au survol du bouton
// "Fiche" : la RPC demarre avant le clic. Les PHOTOS ne sont plus prechargees (437) : les consulter exige un motif et laisse une trace
// au journal, donc seulement sur demande de l'administrateur (consulterPhotos).
// Cache court : la fiche peut changer de statut, on ne garde que quelques secondes.
const TTL_MS = 30_000;
const DELAI_SURVOL_MS = 150;

interface Entree { fiche: Promise<FicheTransaction>; at: number }
const cache = new Map<string, Entree>();

export function chargerFicheTransaction(demandeId: string): Entree {
  const existante = cache.get(demandeId);
  if (existante && Date.now() - existante.at < TTL_MS) return existante;

  const fiche = new Promise<FicheTransaction>((resolve, reject) => {
    supabase.rpc('admin_fiche_transaction', { p_demande_id: demandeId }).single().then(({ data, error }) => {
      if (error) reject(new Error(error.message));
      else resolve(data as FicheTransaction);
    });
  });
  const entree = { fiche, at: Date.now() };
  cache.set(demandeId, entree);
  // Une erreur ne reste pas en cache : la prochaine ouverture retente.
  fiche.catch(() => { if (cache.get(demandeId) === entree) cache.delete(demandeId); });
  return entree;
}

// Handlers a poser sur le bouton qui ouvre la fiche. Le delai evite de lancer
// un appel pour chaque ligne traversee par la souris.
export function prechargementFiche(demandeId: string) {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const annuler = () => { clearTimeout(minuteur); };
  return {
    onMouseEnter: () => { annuler(); minuteur = setTimeout(() => { chargerFicheTransaction(demandeId); }, DELAI_SURVOL_MS); },
    onMouseLeave: annuler,
    onFocus: () => { chargerFicheTransaction(demandeId); },
    onPointerDown: () => { annuler(); chargerFicheTransaction(demandeId); },
  };
}

/** Photos des constats d'une transaction. Motif obligatoire, consultation inscrite au journal par la base (admin_consulter_photos). */
export async function consulterPhotos(demandeId: string, motif: string): Promise<PhotoConstat[]> {
  const { data, error } = await supabase.functions.invoke('admin-photos-transaction', { body: { demandeId, motif } });
  if (error || data?.error) {
    // Reponse non-2xx : le message utile (motif manquant, droits) est dans le corps.
    let detail: string | undefined = data?.error;
    const ctx = (error as { context?: Response } | null)?.context;
    if (!detail && ctx) detail = await ctx.json().then((b: { error?: string }) => b.error).catch(() => undefined);
    throw new Error(detail ?? error?.message ?? 'Lecture impossible.');
  }
  return (data?.photos ?? []) as PhotoConstat[];
}

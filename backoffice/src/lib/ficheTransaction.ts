import { supabase } from './supabase';
import type { FicheTransaction, PhotoConstat } from './types';

// Chargement de la fiche transaction, avec prechargement au survol du bouton
// "Fiche" : la RPC et la fonction Edge (photos, ~1 s) demarrent avant le clic.
// Cache court : les URLs de photos signees expirent au bout de 10 min et la
// fiche peut changer de statut, on ne garde donc que quelques secondes.
const TTL_MS = 30_000;
const DELAI_SURVOL_MS = 150;

interface Entree { fiche: Promise<FicheTransaction>; photos: Promise<PhotoConstat[]>; at: number }
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
  const photos = supabase.functions.invoke('admin-photos-transaction', { body: { demandeId } })
    .then(({ data, error }) => (!error && data?.photos ? (data.photos as PhotoConstat[]) : []));

  const entree = { fiche, photos, at: Date.now() };
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

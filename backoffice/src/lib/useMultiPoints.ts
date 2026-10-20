import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { PointRelais } from './pointsRelais';

export type FonctionMulti = 'a_encaisser' | 'depots' | 'a_rembourser' | 'voyageurs_a_payer' | 'trajets' | 'dossiers_guichet' | 'chats_non_lus' | 'lister_recus' | 'cloture_etat' | 'apercu';

/**
 * UN appel serveur (admin_pr_multi, migration 447) rend les lignes de tous les points auxquels on a droit, chacune marquee de son point_id.
 * Le serveur controle les droits point par point ; ici on rattache chaque ligne a son point et on ecarte ceux qui ne sont pas dans `points`
 * (point ferme, par exemple). `lireMulti` sert aux ecrans qui chargent plusieurs listes a la main.
 */
export async function lireMulti<T>(fonction: FonctionMulti, points: PointRelais[], plage?: { debut: string; fin: string }): Promise<{ lignes: (T & { point: PointRelais })[]; erreur: string | null }> {
  const { data, error } = await supabase.rpc('admin_pr_multi', { p_fonction: fonction, ...(plage ? { p_debut: plage.debut, p_fin: plage.fin } : {}) });
  if (error) return { lignes: [], erreur: error.message };
  const parId = new Map(points.map((p) => [p.id, p]));
  const lignes = ((data ?? []) as (T & { point_id: string })[]).flatMap((l) => {
    const point = parId.get(l.point_id);
    return point ? [{ ...l, point }] : [];
  });
  return { lignes, erreur: null };
}

/** Charge une liste pour tous les points accessibles, rafraichie toutes les `rafraichirMs` ms si donne. */
export function useMultiPoints<T>(points: PointRelais[], fonction: FonctionMulti, rafraichirMs?: number, plage?: { debut: string; fin: string }) {
  const [items, setItems] = useState<(T & { point: PointRelais })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cle = points.map((p) => p.id).join(',');

  const recharger = useCallback(() => {
    lireMulti<T>(fonction, points, plage).then(({ lignes, erreur }) => { setError(erreur); setItems(lignes); });
  }, [cle, fonction, plage?.debut, plage?.fin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setItems(null);
    recharger();
    if (!rafraichirMs) return;
    const t = window.setInterval(recharger, rafraichirMs);
    return () => window.clearInterval(t);
  }, [recharger, rafraichirMs]);

  return { items, error, recharger };
}

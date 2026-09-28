import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface ElementAFaire {
  code: string;
  priorite: 'urgent' | 'important' | 'info';
  nb: number;
  titre: string;
  detail: string;
  action: string;
  lien: string;
  onglet: string | null;
  filtre?: string | null;
}

// Liste "A faire" calculee serveur (admin_a_faire, migration 224), deja
// filtree selon le role de l'admin connecte.
// `actif` = false pour les roles sans acces a admin_a_faire (le serveur
// refuserait) : aucun appel, liste vide.
export function useAFaire(dependance?: unknown, actif = true) {
  const [items, setItems] = useState<ElementAFaire[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const charger = useCallback(() => {
    if (!actif) return;
    supabase.rpc('admin_a_faire').then(({ data, error: e }) => {
      if (e) { setError(e.message); return; }
      setError(null);
      setItems((data ?? []) as ElementAFaire[]);
    });
  }, [actif]);

  useEffect(charger, [charger, dependance]);
  return { items, error, recharger: charger };
}

export const nbActions = (items: ElementAFaire[] | null) =>
  (items ?? []).filter((i) => i.priorite !== 'info').length;

import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useDebounce } from './useDebounce';
import type { CompteRecherche } from './types';

// Recherche de membres cote serveur : seules les lignes affichees arrivent dans le navigateur.
// Avant (audit du 14 oct. 2026), Emails et Commissions chargeaient l'annuaire entier (2000 comptes,
// e-mails compris) pour le filtrer en local. La base plafonne aussi p_limite a 100 (migration 393).
export function useRechercheComptes(recherche: string, limite: number, { actif = true, videAutorise = false } = {}) {
  const q = useDebounce(recherche.trim());
  const [comptes, setComptes] = useState<CompteRecherche[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!actif || (!q && !videAutorise)) { setComptes([]); return; }
    let courant = true;
    supabase.rpc('admin_rechercher_comptes', { p_recherche: q, p_limite: limite }).then(({ data, error }) => {
      if (!courant) return;
      if (error) { setErreur(error.message); return; }
      setErreur(null);
      setComptes((data ?? []) as CompteRecherche[]);
    });
    return () => { courant = false; };
  }, [q, limite, actif, videAutorise]);

  return { comptes, erreur };
}

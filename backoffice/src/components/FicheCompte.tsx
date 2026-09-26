import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { CompteModal } from './CompteModal';
import { IconEye } from './Icons';
import type { FicheCompte } from '../lib/types';

// Ouverture de la fiche d'un compte depuis n'importe quelle liste.
export function useFicheCompte(onChanged?: () => void) {
  const [fiche, setFiche] = useState<FicheCompte | null>(null);

  async function ouvrir(userId: string) {
    const { data, error } = await supabase.rpc('admin_fiche_compte', { p_user_id: userId }).single();
    if (error) { alert(error.message); return; }
    setFiche(data as FicheCompte);
  }

  const modal = fiche && (
    <CompteModal
      fiche={fiche}
      onClose={() => setFiche(null)}
      onChanged={() => { ouvrir(fiche.id); onChanged?.(); }}
    />
  );

  return { ouvrir, modal };
}

export function VoirFicheButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="btn btn-soft btn-sm" onClick={onClick} title="Ouvrir la fiche">
      <IconEye /> Fiche
    </button>
  );
}

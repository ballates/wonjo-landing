import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Taux de commission en vigueur pour un aperçu (même règle que fn_taux_commission sans les règles de
// réduction, qui ne font que baisser) : 10 % tant que les commissions personnalisées sont inactives,
// sinon le taux par défaut. Le montant exact est toujours calculé et figé par le serveur.
export function useTauxCommission(): number {
  const [taux, setTaux] = useState(0.10);
  useEffect(() => {
    let vivant = true;
    Promise.all([supabase.rpc('fn_commission_active'), supabase.rpc('fn_commission_defaut')]).then(([a, d]) => {
      if (!vivant || a.error || d.error) return;
      const t = a.data === true ? Number(d.data) : 0.10;
      if (Number.isFinite(t) && t >= 0 && t <= 0.15) setTaux(t);
    });
    return () => { vivant = false; };
  }, []);
  return taux;
}

import { useEffect, useState } from 'react';

// Attend que la valeur arrete de changer avant de la repercuter - evite un
// appel RPC a chaque frappe dans une recherche (253, pagination serveur).
export function useDebounce<T>(valeur: T, delaiMs = 300): T {
  const [debattue, setDebattue] = useState(valeur);
  useEffect(() => {
    const t = setTimeout(() => setDebattue(valeur), delaiMs);
    return () => clearTimeout(t);
  }, [valeur, delaiMs]);
  return debattue;
}

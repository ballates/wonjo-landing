import { useEffect, useRef, useState, type ReactNode } from 'react';

// Petit « i » rond a cote d'un titre : le sous-titre y est range. Il s'affiche au survol et au clic (tactile), se ferme en recliquant,
// avec Echap ou en cliquant ailleurs.
export function InfoBulle({ children, etiquette = 'Plus d\'informations' }: { children: ReactNode; etiquette?: string }) {
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => { if (!racine.current?.contains(e.target as Node)) setOuvert(false); };
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false); };
    document.addEventListener('mousedown', dehors);
    window.addEventListener('keydown', echap);
    return () => { document.removeEventListener('mousedown', dehors); window.removeEventListener('keydown', echap); };
  }, [ouvert]);

  return (
    <span className={`info-bulle ${ouvert ? 'ouvert' : ''}`} ref={racine}>
      <button type="button" className="info-bulle-btn" aria-label={etiquette} aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
        <svg width="10" height="12" viewBox="0 0 10 14" aria-hidden="true"><circle cx="5" cy="2" r="1.7" fill="currentColor" /><rect x="3.4" y="5" width="3.2" height="8" rx="1.2" fill="currentColor" /></svg>
      </button>
      <span className="info-bulle-pop" role="tooltip">{children}</span>
    </span>
  );
}

import { useState } from 'react';

// Numéro de téléphone (ou référence) avec une icône qui le COPIE : un lien « tel: » ouvre une boîte de dialogue du navigateur peu parlante.
// L'icône devient une coche une seconde et demie après la copie.
export function Copiable({ valeur }: { valeur: string }) {
  const [copie, setCopie] = useState(false);
  return (
    <span className="pr-copiable">
      <span>{valeur}</span>
      <button type="button" className={copie ? 'copie' : ''} title={copie ? 'Copié' : 'Copier le numéro'} aria-label={copie ? 'Numéro copié' : 'Copier le numéro'} onClick={async () => {
        try { await navigator.clipboard.writeText(valeur); setCopie(true); window.setTimeout(() => setCopie(false), 1500); } catch { /* presse-papiers refusé */ }
      }}>
        {copie
          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
          : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>}
      </button>
    </span>
  );
}

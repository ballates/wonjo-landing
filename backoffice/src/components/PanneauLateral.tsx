import { useEffect, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { IconClose } from './Icons';

// Panneau qui glisse depuis la droite : le detail d'une ligne de tableau et ses actions, sans masquer le tableau (qui reste lisible a gauche).
// Echap, la croix ou un clic hors du panneau le ferment. Les fenetres de confirmation (z-index 50) s'ouvrent par-dessus.
export function PanneauLateral({ titre, sousTitre, onClose, children, pied }: {
  titre: ReactNode; sousTitre?: ReactNode; onClose: () => void; children: ReactNode; pied?: ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="panneau-fond" onClick={onClose}>
      <motion.aside
        className="panneau"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        <header className="panneau-tete">
          <div className="panneau-titres">
            <h2>{titre}</h2>
            {sousTitre && <p>{sousTitre}</p>}
          </div>
          <button type="button" className="panneau-fermer" onClick={onClose} aria-label="Fermer le panneau" title="Fermer (Échap)"><IconClose /></button>
        </header>
        <div className="panneau-corps">{children}</div>
        {pied && <footer className="panneau-pied">{pied}</footer>}
      </motion.aside>
    </div>
  );
}

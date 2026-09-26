import { useEffect, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { IconClose } from './Icons';

// Coquille commune : fond flou, fermeture par la croix, Echap ou clic dehors.
export function Modal({ onClose, children, closeOnSurface = false }: { onClose: () => void; children: ReactNode; closeOnSurface?: boolean }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <button className={`modal-close ${closeOnSurface ? 'on-surface' : ''}`} onClick={onClose} aria-label="Fermer la fenêtre" title="Fermer la fenêtre">
          <IconClose />
        </button>
        {children}
      </motion.div>
    </div>
  );
}

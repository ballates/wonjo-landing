import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Brand, brandMark } from './Brand';
import { IconFacebook, IconLinkedin } from './Icons';

const ATOUTS = [
  { titre: 'Modération et vérifications', texte: 'Comptes, signalements, litiges et KYC au même endroit.' },
  { titre: 'Pilotage en temps réel', texte: 'Colis, corridors, revenus et communauté.' },
  { titre: 'Accès sécurisé', texte: 'Liste blanche et double authentification obligatoire.' },
];

// Cadre commun des ecrans de connexion : panneau de marque anime a gauche
// (repris de l'ecran de connexion de l'app), formulaire a droite.
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <aside className="auth-brand-panel">
        <div className="aurora" aria-hidden="true">
          <motion.span className="blob b1" animate={{ x: [0, 60, -30, 0], y: [0, -40, 30, 0] }} transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }} />
          <motion.span className="blob b2" animate={{ x: [0, -50, 40, 0], y: [0, 50, -20, 0] }} transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }} />
          <motion.span className="blob b3" animate={{ x: [0, 30, -40, 0], y: [0, 30, 40, 0] }} transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }} />
        </div>
        <div className="auth-brand-inner">
          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: 'easeOut' }}>
            <Brand />
          </motion.div>
          <ul className="auth-atouts">
            {ATOUTS.map((a, i) => (
              <motion.li
                key={a.titre}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.35 + i * 0.12, ease: 'easeOut' }}
              >
                <span className="auth-atout-dot" />
                <span><b>{a.titre}</b><br />{a.texte}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="auth-form-panel">
        <motion.div
          className="auth-form-wrap"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut', delay: 0.1 }}
        >
          <a className="auth-form-brand" href="https://wonjo.app" target="_blank" rel="noopener">
            <img src={brandMark} alt="Wonjo" /><span>WONJO</span>
          </a>
          {children}
          <p className="auth-foot">Accès réservé à l'équipe Wonjo.</p>
          <div className="auth-socials">
            <a href="https://facebook.com/wonjo.app" aria-label="Facebook" target="_blank" rel="noopener"><IconFacebook /></a>
            <a href="https://linkedin.com/company/wonjo" aria-label="LinkedIn" target="_blank" rel="noopener"><IconLinkedin /></a>
          </div>
        </motion.div>
      </main>
    </div>
  );
}

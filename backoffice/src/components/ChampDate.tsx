import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

// Choix d'une date, maison : le champ <input type="date"> natif change d'aspect et de langue selon le navigateur
// (mm/dd/yyyy, calendrier gris, sans mode sombre). Valeur au format 'AAAA-MM-JJ', '' = aucune date.
// Calendrier en portail (jamais coupe par un tableau ou un modal), semaine du lundi, clavier : Echap ferme.

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function versIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function depuisIso(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
export function dateLisible(v: string): string {
  const d = depuisIso(v);
  return d ? d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

export function ChampDate({ valeur, onChange, min, max, placeholder = 'Choisir une date', ariaLabel, effacable = true }: {
  valeur: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  ariaLabel?: string;
  effacable?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const choisie = depuisIso(valeur);
  const [vue, setVue] = useState(() => choisie ?? new Date());
  const racine = useRef<HTMLDivElement>(null);
  const panneau = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!ouvert) return;
    setVue(depuisIso(valeur) ?? new Date());
    function dehors(e: MouseEvent) {
      const t = e.target as Node;
      if (!racine.current?.contains(t) && !panneau.current?.contains(t)) setOuvert(false);
    }
    function touche(e: KeyboardEvent) { if (e.key === 'Escape') setOuvert(false); }
    document.addEventListener('mousedown', dehors);
    document.addEventListener('keydown', touche);
    return () => { document.removeEventListener('mousedown', dehors); document.removeEventListener('keydown', touche); };
  }, [ouvert]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!ouvert) return;
    function placer() {
      const r = racine.current?.getBoundingClientRect();
      if (!r) return;
      const h = 330;
      const w = 288;
      const haut = r.bottom + h + 8 > window.innerHeight && r.top > h;
      setPos({ top: haut ? r.top - h - 6 : r.bottom + 6, left: Math.min(r.left, window.innerWidth - w - 8) });
    }
    placer();
    window.addEventListener('scroll', placer, true);
    window.addEventListener('resize', placer);
    return () => { window.removeEventListener('scroll', placer, true); window.removeEventListener('resize', placer); };
  }, [ouvert]);

  // Grille du mois : lundi en premier, cases vides avant le 1er.
  const cases = useMemo(() => {
    const premier = new Date(vue.getFullYear(), vue.getMonth(), 1);
    const decalage = (premier.getDay() + 6) % 7;
    const nb = new Date(vue.getFullYear(), vue.getMonth() + 1, 0).getDate();
    return [...Array(decalage).fill(null), ...Array.from({ length: nb }, (_, i) => new Date(vue.getFullYear(), vue.getMonth(), i + 1))];
  }, [vue]);
  const aujourdHui = versIso(new Date());
  const horsBornes = (iso: string) => (!!min && iso < min) || (!!max && iso > max);

  function choisir(d: Date) {
    onChange(versIso(d));
    setOuvert(false);
  }

  return (
    <div className="ui-select champ-date" ref={racine}>
      <button type="button" className={`ui-select-trigger ${ouvert ? 'open' : ''}`} aria-label={ariaLabel} aria-haspopup="dialog"
              aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span className={`ui-select-value ${valeur ? '' : 'champ-date-vide'}`}>{valeur ? dateLisible(valeur) : placeholder}</span>
        {effacable && valeur && (
          <span className="champ-date-effacer" role="button" aria-label="Effacer la date" tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onChange(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onChange(''); } }}>×</span>
        )}
      </button>
      {createPortal(
        <AnimatePresence>
          {ouvert && pos && (
            <motion.div ref={panneau} className="champ-date-panneau" role="dialog" aria-label="Calendrier" style={{ top: pos.top, left: pos.left }}
                        initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }}
                        transition={{ duration: 0.14, ease: 'easeOut' }}>
              <div className="champ-date-entete">
                <button type="button" aria-label="Mois précédent" onClick={() => setVue(new Date(vue.getFullYear(), vue.getMonth() - 1, 1))}>‹</button>
                <strong>{MOIS[vue.getMonth()]} {vue.getFullYear()}</strong>
                <button type="button" aria-label="Mois suivant" onClick={() => setVue(new Date(vue.getFullYear(), vue.getMonth() + 1, 1))}>›</button>
              </div>
              <div className="champ-date-grille">
                {JOURS.map((j, i) => <span key={i} className="champ-date-jour">{j}</span>)}
                {cases.map((d, i) => {
                  if (!d) return <span key={`v${i}`} />;
                  const iso = versIso(d);
                  return (
                    <button key={iso} type="button" disabled={horsBornes(iso)} onClick={() => choisir(d)}
                            className={`champ-date-case ${iso === valeur ? 'choisie' : ''} ${iso === aujourdHui ? 'aujourdhui' : ''}`}>
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
              <div className="champ-date-pied">
                <button type="button" disabled={horsBornes(aujourdHui)} onClick={() => choisir(new Date())}>Aujourd'hui</button>
                {effacable && <button type="button" onClick={() => { onChange(''); setOuvert(false); }}>Effacer</button>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

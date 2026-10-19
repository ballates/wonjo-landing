import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { normaliserRecherche } from './Select';

// Menu deroulant a choix MULTIPLES, avec barre de recherche et rubriques : remplace une longue liste de pastilles qui
// occupait tout l'ecran (ex. nature du contenu d'un colis). Le menu reste ouvert pendant qu'on coche ; les choix faits
// s'affichent en pastilles retirables sous le champ. Clavier : fleches, Entree/Espace pour cocher, Echap pour fermer.

export interface GroupeChoix { section: string; items: string[] }

export function ChampMultiChoix({ groupes, valeur, onChange, placeholder = 'Choisir…', ariaLabel, invalide }: {
  groupes: GroupeChoix[];
  valeur: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
  invalide?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [q, setQ] = useState('');
  const [actif, setActif] = useState(0);
  const racine = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Liste a plat des choix visibles (pour la navigation clavier), rubriques sans resultat masquees.
  const nq = normaliserRecherche(q);
  const visibles = useMemo(() => groupes
    .map((g) => ({ section: g.section, items: nq ? g.items.filter((i) => normaliserRecherche(`${i} ${g.section}`).includes(nq)) : g.items }))
    .filter((g) => g.items.length > 0), [groupes, nq]);
  const aPlat = useMemo(() => visibles.flatMap((g) => g.items), [visibles]);

  useEffect(() => {
    if (!ouvert) return;
    setQ('');
    setActif(0);
    function dehors(e: MouseEvent) {
      const t = e.target as Node;
      if (!racine.current?.contains(t) && !menu.current?.contains(t)) setOuvert(false);
    }
    document.addEventListener('mousedown', dehors);
    return () => document.removeEventListener('mousedown', dehors);
  }, [ouvert]);

  useLayoutEffect(() => {
    if (!ouvert) return;
    function placer() {
      const r = racine.current?.getBoundingClientRect();
      if (!r) return;
      const h = 380;
      const haut = r.bottom + h + 8 > window.innerHeight && r.top > h;
      setPos({ top: haut ? r.top - h - 6 : r.bottom + 6, left: r.left, width: Math.max(r.width, 320) });
    }
    placer();
    window.addEventListener('scroll', placer, true);
    window.addEventListener('resize', placer);
    return () => { window.removeEventListener('scroll', placer, true); window.removeEventListener('resize', placer); };
  }, [ouvert]);

  function basculer(choix: string) {
    onChange(valeur.includes(choix) ? valeur.filter((x) => x !== choix) : [...valeur, choix]);
  }
  function touche(e: React.KeyboardEvent) {
    if (!ouvert) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); setOuvert(true); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); setOuvert(false); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActif((a) => Math.min(aPlat.length - 1, a + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActif((a) => Math.max(0, a - 1)); }
    if (e.key === 'Enter') { e.preventDefault(); if (aPlat[actif]) basculer(aPlat[actif]); }
  }

  let compteur = -1;
  const resume = valeur.length === 0 ? null : valeur.length <= 2 ? valeur.join(', ') : `${valeur.length} choix : ${valeur.slice(0, 2).join(', ')}…`;

  return (
    <div className="ui-select champ-multi" ref={racine}>
      <button type="button" className={`ui-select-trigger ${ouvert ? 'open' : ''} ${invalide ? 'champ-invalide' : ''}`} aria-haspopup="listbox"
              aria-expanded={ouvert} aria-label={ariaLabel} onClick={() => setOuvert((o) => !o)} onKeyDown={touche}>
        <span className={`ui-select-value ${resume ? '' : 'champ-date-vide'}`}>{resume ?? placeholder}</span>
        <svg className="ui-select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
      </button>

      {valeur.length > 0 && (
        <div className="champ-multi-puces">
          {valeur.map((v) => (
            <span key={v} className="champ-multi-puce">
              {v}
              <button type="button" aria-label={`Retirer ${v}`} onClick={() => basculer(v)}>×</button>
            </span>
          ))}
          {valeur.length > 1 && <button type="button" className="champ-multi-tout" onClick={() => onChange([])}>Tout effacer</button>}
        </div>
      )}

      {createPortal(
        <AnimatePresence>
          {ouvert && pos && (
            <motion.div ref={menu} className="champ-multi-menu" role="listbox" aria-multiselectable="true" style={{ top: pos.top, left: pos.left, width: pos.width }}
                        initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }}
                        transition={{ duration: 0.14, ease: 'easeOut' }}>
              <div className="champ-multi-recherche">
                <input type="search" autoFocus value={q} placeholder="Rechercher…" aria-label="Rechercher dans la liste"
                       onChange={(e) => { setQ(e.target.value); setActif(0); }} onKeyDown={touche} />
              </div>
              <div className="champ-multi-liste">
                {visibles.length === 0 && <p className="champ-multi-vide">Aucun résultat</p>}
                {visibles.map((g) => (
                  <div key={g.section}>
                    <p className="champ-multi-section">{g.section}</p>
                    {g.items.map((item) => {
                      compteur += 1;
                      const i = compteur;
                      const coche = valeur.includes(item);
                      return (
                        <div key={item} role="option" aria-selected={coche} className={`champ-multi-option ${i === actif ? 'actif' : ''} ${coche ? 'coche' : ''}`}
                             onMouseEnter={() => setActif(i)} onMouseDown={(e) => { e.preventDefault(); basculer(item); }}>
                          <span className="champ-multi-case" aria-hidden="true">{coche && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}</span>
                          {item}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="champ-multi-pied">
                <span className="hint">{valeur.length === 0 ? 'Aucun choix' : `${valeur.length} choisi${valeur.length > 1 ? 's' : ''}`}</span>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setOuvert(false)}>Terminé</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

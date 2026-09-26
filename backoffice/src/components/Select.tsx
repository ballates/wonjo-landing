import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

export interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
  icon?: ReactNode;
}

// Menu deroulant maison : le <select> natif ne se stylise pas (liste systeme
// grise, sans mode sombre). Navigation clavier : fleches, Entree, Echap.
export function Select<T extends string>({
  value, options, onChange, disabled, ariaLabel, size = 'md', minWidth,
}: {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
  size?: 'sm' | 'md';
  minWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (!root.current?.contains(t) && !menu.current?.contains(t)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, options, value]);

  // Menu rendu dans <body> (portail) pour ne jamais etre coupe par un tableau
  // defilant ou un modal ; repositionne au scroll et au redimensionnement.
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const r = root.current?.getBoundingClientRect();
      if (!r) return;
      const hauteur = Math.min(320, options.length * 44 + 12);
      const up = r.bottom + hauteur + 8 > window.innerHeight && r.top > hauteur;
      setPos({ top: up ? r.top - hauteur - 6 : r.bottom + 6, left: r.left, width: r.width, up });
    }
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [open, options.length]);

  function choose(v: T) {
    onChange(v);
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true); return; }
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    if (e.key === 'Enter') { e.preventDefault(); choose(options[active].value); }
  }

  return (
    <div className={`ui-select ${size === 'sm' ? 'ui-select-sm' : ''}`} ref={root} style={minWidth ? { minWidth } : undefined}>
      <button
        type="button"
        className={`ui-select-trigger ${open ? 'open' : ''}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
      >
        {current?.icon}
        <span className="ui-select-value">{current?.label ?? 'Choisir…'}</span>
        <svg className="ui-select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {createPortal(
      <AnimatePresence>
        {open && pos && (
          <motion.ul
            ref={menu}
            id={listId}
            role="listbox"
            className="ui-select-menu"
            style={{ top: pos.top, left: pos.left, minWidth: pos.width }}
            initial={{ opacity: 0, y: pos.up ? 6 : -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
          >
            {options.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                className={`ui-select-option ${i === active ? 'active' : ''} ${o.value === value ? 'selected' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); choose(o.value); }}
              >
                {o.icon}
                <span className="ui-select-option-text">
                  <span>{o.label}</span>
                  {o.hint && <small>{o.hint}</small>}
                </span>
                {o.value === value && (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                )}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>,
      document.body,
      )}
    </div>
  );
}

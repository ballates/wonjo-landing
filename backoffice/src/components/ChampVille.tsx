import { useId, useMemo, useRef, useState } from 'react';

// Ville avec suggestions : les villes retenues en base pour le pays (corridor_villes), filtrees pendant la
// frappe et sans tenir compte des accents. Une ville absente de la liste se tape librement : la liste aide,
// elle n'interdit rien.
function sansAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function ChampVille({ valeur, onChange, villes, placeholder = 'Ex. Dakar', disabled }: {
  valeur: string;
  onChange: (v: string) => void;
  villes: string[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    const q = sansAccents(valeur);
    const triees = [...villes].sort((a, b) => a.localeCompare(b, 'fr'));
    if (!q) return triees.slice(0, 12);
    return triees.filter((v) => sansAccents(v).includes(q) && sansAccents(v) !== q).slice(0, 12);
  }, [valeur, villes]);

  const exacte = villes.some((v) => sansAccents(v) === sansAccents(valeur));

  function choisir(v: string) {
    onChange(v);
    setOuvert(false);
    input.current?.blur();
  }

  function onKey(e: React.KeyboardEvent) {
    if (!ouvert || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActif((a) => Math.min(suggestions.length - 1, a + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActif((a) => Math.max(0, a - 1)); }
    if (e.key === 'Enter') { e.preventDefault(); choisir(suggestions[actif]); }
    if (e.key === 'Escape') setOuvert(false);
  }

  return (
    <div className="combo">
      <input
        ref={input}
        type="text"
        value={valeur}
        disabled={disabled}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={ouvert && suggestions.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        onFocus={() => { setOuvert(true); setActif(0); }}
        onBlur={() => setTimeout(() => setOuvert(false), 120)}
        onChange={(e) => { onChange(e.target.value); setOuvert(true); setActif(0); }}
        onKeyDown={onKey}
      />
      {ouvert && suggestions.length > 0 && (
        <ul id={listId} role="listbox" className="combo-menu">
          {suggestions.map((v, i) => (
            <li
              key={v}
              role="option"
              aria-selected={i === actif}
              className={`ui-select-option ${i === actif ? 'active' : ''}`}
              onMouseEnter={() => setActif(i)}
              onMouseDown={(e) => { e.preventDefault(); choisir(v); }}
            >
              <span className="ui-select-option-text"><span>{v}</span></span>
            </li>
          ))}
        </ul>
      )}
      {valeur.trim() && !exacte && villes.length > 0 && !(ouvert && suggestions.length > 0) && (
        <span className="hint">Ville hors liste : elle sera enregistrée telle quelle.</span>
      )}
    </div>
  );
}

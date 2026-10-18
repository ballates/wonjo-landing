import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Adresse avec suggestions pendant la frappe : meme service que l'app (Photon, donnees OpenStreetMap ; voir
// utils/photon.ts du depot wonjo). Les suggestions sont limitees au pays du point et orientees vers sa ville. Rien ne
// sort ou rien ne convient : on garde ce qu'on a tape (saisie libre, toujours possible).

const PHOTON = 'https://photon.komoot.io/api/';

interface Proprietes {
  name?: string; housenumber?: string; street?: string; locality?: string; district?: string;
  city?: string; county?: string; state?: string; country?: string; countrycode?: string; postcode?: string;
}

// Libelle court enregistre (meme logique que libelleCourt de l'app, sans le code postal 99xxx herite d'OSM).
function libelle(p: Proprietes): string {
  const voie = [p.housenumber, p.street].filter(Boolean).join(' ');
  const tete = p.name || voie || p.street || p.locality || p.district || '';
  const quartier = p.district || p.locality || '';
  return [tete, quartier && quartier !== tete ? quartier : ''].filter(Boolean).join(', ');
}
function detail(p: Proprietes): string {
  const vus = new Set<string>();
  return [p.street, p.locality, p.district, p.city, p.state].filter((v): v is string => !!v && !vus.has(v) && (vus.add(v), true)).join(', ');
}

export function ChampAdresse({ valeur, onChange, pays, ville, placeholder }: {
  valeur: string; onChange: (v: string) => void; pays: string; ville: string; placeholder?: string;
}) {
  const [suggestions, setSuggestions] = useState<{ libelle: string; detail: string }[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(-1);
  const [chargement, setChargement] = useState(false);
  const racine = useRef<HTMLDivElement>(null);
  const liste = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const derniere = useRef(0);
  const tape = useRef(false);

  // Recherche apres 300 ms sans frappe, seulement si l'utilisateur tape (pas a l'ouverture d'un point existant).
  useEffect(() => {
    if (!tape.current) return;
    const texte = valeur.trim();
    if (texte.length < 3) { setSuggestions([]); return; }
    const n = ++derniere.current;
    const t = window.setTimeout(async () => {
      setChargement(true);
      try {
        const params = new URLSearchParams({ q: ville ? `${texte}, ${ville}` : texte, limit: '10', lang: 'fr' });
        const res = await fetch(`${PHOTON}?${params.toString()}`);
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json() as { features?: { properties: Proprietes }[] };
        if (n !== derniere.current) return;
        const vus = new Set<string>();
        const liste = (json.features ?? [])
          .map((f) => f.properties)
          .filter((p) => !pays || (p.countrycode ?? '').toUpperCase() === pays.toUpperCase())
          .map((p) => ({ libelle: libelle(p), detail: detail(p) }))
          .filter((s) => s.libelle && !vus.has(s.libelle) && (vus.add(s.libelle), true))
          .slice(0, 6);
        setSuggestions(liste);
        setOuvert(liste.length > 0);
        setActif(-1);
      } catch {
        // Service indisponible : la saisie libre continue, sans message bloquant.
        if (n === derniere.current) setSuggestions([]);
      } finally {
        if (n === derniere.current) setChargement(false);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [valeur, pays, ville]);

  useEffect(() => {
    if (!ouvert) return;
    function dehors(e: MouseEvent) {
      const t = e.target as Node;
      if (!racine.current?.contains(t) && !liste.current?.contains(t)) setOuvert(false);
    }
    document.addEventListener('mousedown', dehors);
    return () => document.removeEventListener('mousedown', dehors);
  }, [ouvert]);

  useLayoutEffect(() => {
    if (!ouvert) return;
    function placer() {
      const r = racine.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    placer();
    window.addEventListener('scroll', placer, true);
    window.addEventListener('resize', placer);
    return () => { window.removeEventListener('scroll', placer, true); window.removeEventListener('resize', placer); };
  }, [ouvert]);

  function choisir(s: { libelle: string }) {
    tape.current = false;
    onChange(s.libelle);
    setOuvert(false);
  }

  return (
    <div className="champ-adresse" ref={racine}>
      <input
        type="text"
        value={valeur}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={ouvert}
        aria-autocomplete="list"
        onChange={(e) => { tape.current = true; onChange(e.target.value); }}
        onFocus={() => { if (suggestions.length) setOuvert(true); }}
        onKeyDown={(e) => {
          if (!ouvert) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActif((a) => Math.min(suggestions.length - 1, a + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActif((a) => Math.max(-1, a - 1)); }
          if (e.key === 'Enter' && actif >= 0) { e.preventDefault(); choisir(suggestions[actif]); }
          if (e.key === 'Escape') setOuvert(false);
        }}
      />
      {chargement && <span className="champ-adresse-charge" aria-hidden="true" />}
      {createPortal(
        ouvert && pos ? (
          <ul ref={liste} className="ui-select-menu champ-adresse-menu" role="listbox" style={{ top: pos.top, left: pos.left, minWidth: pos.width, maxWidth: pos.width }}>
            {suggestions.map((s, i) => (
              <li key={s.libelle} role="option" aria-selected={i === actif} className={`ui-select-option ${i === actif ? 'active' : ''}`}
                  onMouseEnter={() => setActif(i)} onMouseDown={(e) => { e.preventDefault(); choisir(s); }}>
                <span className="ui-select-option-text"><span>{s.libelle}</span>{s.detail && <small>{s.detail}</small>}</span>
              </li>
            ))}
            <li className="champ-adresse-libre" role="presentation">Rien ne convient ? Gardez votre saisie.</li>
          </ul>
        ) : null,
        document.body,
      )}
    </div>
  );
}

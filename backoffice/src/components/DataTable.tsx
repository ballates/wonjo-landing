import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { IconFilter, IconSearch, IconSort } from './Icons';

export interface Column<T> {
  key: string;
  label: string;
  // Valeur utilisee pour trier ET filtrer ; absente = colonne ni triable ni filtrable.
  value?: (row: T) => string | number | null | undefined;
  render?: (row: T) => ReactNode;
  width?: number | string;
  // 'options' : colonne a modalites (statut, niveau...) -> filtre par cases a
  // cocher dans l'en-tete plutot qu'une recherche texte.
  filter?: 'options';
}

type Sort = { key: string; dir: 'asc' | 'desc' } | null;

function normalise(v: unknown): string {
  return String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const VIDE = '(vide)';
const cle = (v: unknown) => (v == null || v === '' ? VIDE : String(v));

export function DataTable<T>({
  rows, columns, rowKey, emptyText = 'Aucun résultat.', searchPlaceholder = 'Rechercher…',
  initialSort, title, toolbar, selected, onSelectedChange, pageSize = 10, limiteSansRecherche,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  emptyText?: string;
  searchPlaceholder?: string;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  // Titre affiche sur la meme ligne que la barre de recherche, a sa gauche.
  title?: ReactNode;
  toolbar?: ReactNode;
  // Selection multiple (cases a cocher) : absente = pas de colonne de selection.
  selected?: Set<string>;
  onSelectedChange?: (s: Set<string>) => void;
  pageSize?: number;
  // Sans recherche ni filtre, n'afficher que les N premieres lignes (ex. top
  // 20) ; une recherche fouille toujours dans toutes les lignes.
  limiteSansRecherche?: number;
}) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [choix, setChoix] = useState<Record<string, string[]>>({});
  const [sort, setSort] = useState<Sort>(initialSort ?? null);
  const [menu, setMenu] = useState<{ key: string; anchor: HTMLElement } | null>(null);
  const [page, setPage] = useState(0);

  const visible = useMemo(() => {
    const q = normalise(search.trim());
    const textes = Object.entries(filters).filter(([, v]) => v.trim() !== '');
    const options = Object.entries(choix).filter(([, v]) => v.length > 0);
    let out = rows.filter((row) => {
      if (q && !columns.some((c) => c.value && normalise(c.value(row)).includes(q))) return false;
      const okTexte = textes.every(([key, v]) => {
        const col = columns.find((c) => c.key === key);
        return !col?.value || normalise(col.value(row)).includes(normalise(v.trim()));
      });
      if (!okTexte) return false;
      return options.every(([key, vals]) => {
        const col = columns.find((c) => c.key === key);
        return !col?.value || vals.includes(cle(col.value(row)));
      });
    });
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.value) {
        const get = col.value;
        out = [...out].sort((a, b) => {
          const va = get(a);
          const vb = get(b);
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          const cmp = typeof va === 'number' && typeof vb === 'number'
            ? va - vb
            : String(va).localeCompare(String(vb), 'fr', { sensitivity: 'base', numeric: true });
          return sort.dir === 'asc' ? cmp : -cmp;
        });
      }
    }
    return out;
  }, [rows, columns, search, filters, choix, sort]);

  const rechercheActive = search.trim() !== ''
    || Object.values(filters).some((v) => v.trim() !== '')
    || Object.values(choix).some((v) => v.length > 0);
  const lignes = limiteSansRecherche && !rechercheActive ? visible.slice(0, limiteSansRecherche) : visible;
  const nbPages = Math.max(1, Math.ceil(lignes.length / pageSize));
  const pageCourante = Math.min(page, nbPages - 1);
  const lignesPage = lignes.slice(pageCourante * pageSize, (pageCourante + 1) * pageSize);

  // Retour a la premiere page des que le contenu affiche change.
  useEffect(() => { setPage(0); }, [search, filters, choix, sort, rows]);


  const selectable = !!selected && !!onSelectedChange;
  const visibleKeys = visible.map(rowKey);
  const allVisibleSelected = selectable && visibleKeys.length > 0 && visibleKeys.every((k) => selected!.has(k));

  function toggleRow(k: string) {
    const next = new Set(selected);
    if (next.has(k)) next.delete(k); else next.add(k);
    onSelectedChange!(next);
  }

  function toggleAllVisible() {
    const next = new Set(selected);
    if (allVisibleSelected) visibleKeys.forEach((k) => next.delete(k));
    else visibleKeys.forEach((k) => next.add(k));
    onSelectedChange!(next);
  }

  const choixActifs = columns.filter((c) => (choix[c.key]?.length ?? 0) > 0);
  const textesActifs = columns.filter((c) => c.filter !== 'options' && (filters[c.key] ?? '').trim() !== '');
  const menuCol = menu ? columns.find((c) => c.key === menu.key) : undefined;

  return (
    <div>
      <div className={`dt-toolbar ${title ? 'dt-toolbar--titled' : ''}`}>
        {title && <h3 className="dt-title">{title}</h3>}
        {toolbar}
        <div className="dt-search">
          <IconSearch />
          <input type="search" placeholder={searchPlaceholder} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span className="dt-count">
          {limiteSansRecherche && !rechercheActive && visible.length > limiteSansRecherche
            ? `${limiteSansRecherche} premiers sur ${rows.length} · recherchez pour voir les autres`
            : `${visible.length} / ${rows.length}`}
        </span>
      </div>

      {(choixActifs.length > 0 || textesActifs.length > 0) && (
        <div className="dt-active-filters">
          {choixActifs.map((c) => (
            <span key={c.key} className="dt-filter-chip">
              <b>{c.label} :</b> {choix[c.key].join(', ')}
              <button aria-label={`Retirer le filtre ${c.label}`} onClick={() => setChoix((f) => ({ ...f, [c.key]: [] }))}>×</button>
            </span>
          ))}
          {textesActifs.map((c) => (
            <span key={c.key} className="dt-filter-chip">
              <b>{c.label} :</b> contient « {filters[c.key].trim()} »
              <button aria-label={`Retirer le filtre ${c.label}`} onClick={() => setFilters((f) => ({ ...f, [c.key]: '' }))}>×</button>
            </span>
          ))}
          <button className="dt-clear" onClick={() => { setChoix({}); setFilters({}); }}>Tout effacer</button>
        </div>
      )}

      <div className="dt-wrap">
        <table>
          <thead>
            <tr>
              {selectable && (
                <th style={{ width: 44 }}>
                  <input type="checkbox" className="dt-check" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Tout sélectionner" />
                </th>
              )}
              {columns.map((c) => {
                const actif = !!c.value;
                const dir = sort?.key === c.key ? sort.dir : null;
                const nbFiltre = c.filter === 'options' ? (choix[c.key]?.length ?? 0) : (filters[c.key]?.trim() ? 1 : 0);
                return (
                  <th
                    key={c.key}
                    style={c.width ? { width: c.width } : undefined}
                    className={`${dir ? 'sorted' : ''} ${nbFiltre ? 'filtered' : ''}`}
                    aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}
                  >
                    {actif ? (
                      <button
                        type="button"
                        className={`th-button ${menu?.key === c.key ? 'open' : ''}`}
                        title={`Trier ou filtrer : ${c.label}`}
                        onClick={(e) => {
                          // currentTarget est remis a null apres l'evenement : a lire ici, pas dans l'updater.
                          const anchor = e.currentTarget;
                          setMenu((m) => (m?.key === c.key ? null : { key: c.key, anchor }));
                        }}
                      >
                        {c.label}
                        {dir && <span className="sort-ind"><IconSort dir={dir} /></span>}
                        <span className={`th-filter ${nbFiltre ? 'on' : ''}`}><IconFilter />{nbFiltre > 0 && c.filter === 'options' && <span>{nbFiltre}</span>}</span>
                      </button>
                    ) : c.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {lignesPage.length === 0 ? (
              <tr><td className="dt-empty" colSpan={columns.length + (selectable ? 1 : 0)}>{emptyText}</td></tr>
            ) : lignesPage.map((row) => (
              <tr key={rowKey(row)} className={selectable && selected!.has(rowKey(row)) ? 'dt-selected' : undefined}>
                {selectable && (
                  <td><input type="checkbox" className="dt-check" checked={selected!.has(rowKey(row))} onChange={() => toggleRow(rowKey(row))} aria-label="Sélectionner" /></td>
                )}
                {columns.map((c) => <td key={c.key}>{c.render ? c.render(row) : String(c.value?.(row) ?? '-')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nbPages > 1 && (
        <div className="dt-pager">
          <span className="hint">
            {pageCourante * pageSize + 1}-{Math.min((pageCourante + 1) * pageSize, lignes.length)} sur {lignes.length}
          </span>
          <div className="action-row">
            <button className="btn btn-sm" disabled={pageCourante === 0} onClick={() => setPage(pageCourante - 1)}>‹ Précédent</button>
            {Array.from({ length: nbPages }, (_, i) => i)
              .filter((i) => nbPages <= 7 || Math.abs(i - pageCourante) <= 2 || i === 0 || i === nbPages - 1)
              .map((i, k, arr) => (
                <span key={i} className="dt-pages">
                  {k > 0 && i - arr[k - 1] > 1 && <span className="hint">…</span>}
                  <button className={`btn btn-sm ${i === pageCourante ? 'btn-soft' : ''}`} onClick={() => setPage(i)} aria-current={i === pageCourante ? 'page' : undefined}>{i + 1}</button>
                </span>
              ))}
            <button className="btn btn-sm" disabled={pageCourante >= nbPages - 1} onClick={() => setPage(pageCourante + 1)}>Suivant ›</button>
          </div>
        </div>
      )}

      {menu && menuCol?.value && (
        <OptionsMenu
          anchor={menu.anchor}
          label={menuCol.label}
          mode={menuCol.filter === 'options' ? 'options' : 'texte'}
          numerique={rows.some((r) => typeof menuCol.value!(r) === 'number')}
          valeurs={rows.map((r) => cle(menuCol.value!(r)))}
          choisis={choix[menu.key] ?? []}
          texte={filters[menu.key] ?? ''}
          sort={sort?.key === menu.key ? sort.dir : null}
          onSort={(dir) => setSort(dir ? { key: menu.key, dir } : null)}
          onChange={(vals) => setChoix((f) => ({ ...f, [menu.key]: vals }))}
          onTexte={(v) => setFilters((f) => ({ ...f, [menu.key]: v }))}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

// Menu d'en-tete d'une colonne a modalites : tri + cases a cocher (une, deux
// ou plusieurs modalites a la fois), avec le nombre de lignes par modalite.
function OptionsMenu({
  anchor, label, mode, numerique, valeurs, choisis, texte, sort, onSort, onChange, onTexte, onClose,
}: {
  anchor: HTMLElement;
  label: string;
  mode: 'options' | 'texte';
  numerique: boolean;
  valeurs: string[];
  choisis: string[];
  texte: string;
  sort: 'asc' | 'desc' | null;
  onSort: (dir: 'asc' | 'desc' | null) => void;
  onChange: (vals: string[]) => void;
  onTexte: (v: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const modalites = useMemo(() => {
    const n = new Map<string, number>();
    valeurs.forEach((v) => n.set(v, (n.get(v) ?? 0) + 1));
    return [...n.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr', { numeric: true }));
  }, [valeurs]);

  useLayoutEffect(() => {
    function place() {
      const r = anchor.getBoundingClientRect();
      const largeur = 260;
      setPos({ top: r.bottom + 6, left: Math.min(Math.max(8, r.left - 12), window.innerWidth - largeur - 8) });
    }
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [anchor]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.contains(t)) onClose();
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [anchor, onClose]);

  function toggle(v: string) {
    onChange(choisis.includes(v) ? choisis.filter((x) => x !== v) : [...choisis, v]);
  }

  if (!pos) return null;
  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={ref}
        className="col-menu"
        style={{ top: pos.top, left: pos.left }}
        initial={{ opacity: 0, y: -6, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.14, ease: 'easeOut' }}
        role="dialog"
        aria-label={`Filtrer ${label}`}
      >
        <div className="col-menu-sort">
          <button className={sort === 'asc' ? 'on' : ''} onClick={() => onSort(sort === 'asc' ? null : 'asc')}>{numerique ? 'Croissant ↑' : 'Trier A → Z'}</button>
          <button className={sort === 'desc' ? 'on' : ''} onClick={() => onSort(sort === 'desc' ? null : 'desc')}>{numerique ? 'Décroissant ↓' : 'Trier Z → A'}</button>
        </div>
        {mode === 'texte' ? (
          <>
            <p className="col-menu-title">Rechercher dans cette colonne</p>
            <input
              className="col-menu-search"
              type="search"
              autoFocus
              placeholder="Contient…"
              value={texte}
              onChange={(e) => onTexte(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onClose(); }}
            />
          </>
        ) : (
        <>
        <p className="col-menu-title">Afficher uniquement</p>
        <ul>
          {modalites.map(([v, n]) => (
            <li key={v}>
              <label>
                <input type="checkbox" className="dt-check" checked={choisis.includes(v)} onChange={() => toggle(v)} />
                <span className="col-menu-label">{v}</span>
                <span className="col-menu-count">{n}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="col-menu-foot">
          <button onClick={() => onChange(modalites.map(([v]) => v))}>Tout cocher</button>
          <button onClick={() => onChange([])} disabled={choisis.length === 0}>Effacer</button>
        </div>
        </>
        )}
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

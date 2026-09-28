import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { IconFilter, IconSearch, IconSort } from './Icons';

export interface ServerColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  width?: number | string;
  // Present = colonne triable ; valeur envoyee au serveur comme p_tri.
  sortKey?: string;
  // Present = colonne filtrable ; filterKey est le champ utilise dans l'objet
  // filtres/onFiltreChange (souvent egal a sortKey ou a c.key). Choix
  // multiple (cases a cocher) parmi une liste fournie par l'appelant :
  // contrairement a DataTable, le serveur ne connait pas la liste des
  // valeurs possibles sans tout charger, donc pas de compteur par valeur.
  filterKey?: string;
  filterOptions?: { value: string; label: string }[];
  // Alternative a filterOptions pour une colonne numerique : un encadrement
  // min/max au lieu d'une liste de valeurs. filtres[filterKey] vaut alors
  // [min, max] (chaine vide = pas de borne) plutot qu'une liste de choix.
  filterRange?: boolean;
}

// Pendant de DataTable pour les listes trop grandes pour etre entierement
// telechargees (Comptes, Transactions, Avis - 253) : le parent fait la
// recherche/tri/pagination/filtre via une RPC qui ne renvoie qu'une page a
// la fois (LIMIT/OFFSET + total_count), ce composant n'est qu'un affichage.
export function ServerTable<T>({
  rows, columns, rowKey, loading, emptyText = 'Aucun résultat.',
  search, onSearchChange, searchPlaceholder = 'Rechercher…',
  toolbar, title,
  total, page, pageSize, onPageChange,
  sort, onSortChange,
  filtres, onFiltreChange,
  selected, onSelectedChange,
}: {
  rows: T[];
  columns: ServerColumn<T>[];
  rowKey: (row: T) => string;
  loading: boolean;
  emptyText?: string;
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  toolbar?: ReactNode;
  title?: ReactNode;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  sort: { key: string; dir: 'asc' | 'desc' } | null;
  onSortChange: (sort: { key: string; dir: 'asc' | 'desc' } | null) => void;
  filtres?: Record<string, string[]>;
  onFiltreChange?: (key: string, values: string[]) => void;
  // Selection multiple : cle par rowKey, persiste au-dela de la page
  // affichee (l'admin peut cocher sur une page, changer de page, revenir).
  selected?: Set<string>;
  onSelectedChange?: (s: Set<string>) => void;
}) {
  const [menu, setMenu] = useState<{ col: ServerColumn<T>; anchor: HTMLElement } | null>(null);
  const nbPages = Math.max(1, Math.ceil(total / pageSize));
  const pageCourante = Math.min(page, nbPages - 1);
  const selectable = !!selected && !!onSelectedChange;
  const visibleKeys = rows.map(rowKey);
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

  function trier(col: ServerColumn<T>, dir: 'asc' | 'desc' | null) {
    if (!col.sortKey) return;
    onSortChange(dir ? { key: col.sortKey, dir } : null);
  }

  function filtreActifPour(c: ServerColumn<T>): boolean {
    if (!c.filterKey) return false;
    const v = filtres?.[c.filterKey] ?? [];
    return c.filterRange ? v.some((x) => x !== '' && x != null) : v.length > 0;
  }
  const filtresActifs = columns.filter(filtreActifPour);

  return (
    <div>
      <div className={`dt-toolbar ${title ? 'dt-toolbar--titled' : ''}`}>
        {title && <h3 className="dt-title">{title}</h3>}
        {toolbar}
        <div className="dt-search">
          <IconSearch />
          <input type="search" placeholder={searchPlaceholder} value={search} onChange={(e) => onSearchChange(e.target.value)} />
        </div>
        <span className="dt-count">{loading ? 'Chargement…' : `${total} résultat${total > 1 ? 's' : ''}`}</span>
      </div>

      {filtresActifs.length > 0 && (
        <div className="dt-active-filters">
          {filtresActifs.map((c) => {
            const valeurs = filtres![c.filterKey!];
            const label = c.filterRange
              ? (valeurs[0] && valeurs[1] ? `${valeurs[0]} – ${valeurs[1]}` : valeurs[0] ? `≥ ${valeurs[0]}` : `≤ ${valeurs[1]}`)
              : valeurs.map((v) => c.filterOptions?.find((o) => o.value === v)?.label ?? v).join(', ');
            return (
              <span key={c.key} className="dt-filter-chip">
                <b>{c.label} :</b> {label}
                <button aria-label={`Retirer le filtre ${c.label}`} onClick={() => onFiltreChange!(c.filterKey!, [])}>×</button>
              </span>
            );
          })}
          <button className="dt-clear" onClick={() => filtresActifs.forEach((c) => onFiltreChange!(c.filterKey!, []))}>Tout effacer</button>
        </div>
      )}

      <div className="dt-wrap">
        <table>
          <thead>
            <tr>
              {selectable && (
                <th style={{ width: 44 }}>
                  <input type="checkbox" className="dt-check" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Tout sélectionner (page affichée)" />
                </th>
              )}
              {columns.map((c) => {
                const dir = sort && c.sortKey && sort.key === c.sortKey ? sort.dir : null;
                const filtreActif = filtreActifPour(c);
                const interactif = !!c.sortKey || !!c.filterOptions || !!c.filterRange;
                return (
                  <th
                    key={c.key}
                    style={c.width ? { width: c.width } : undefined}
                    className={`${dir ? 'sorted' : ''} ${filtreActif ? 'filtered' : ''}`}
                    aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}
                  >
                    {interactif ? (
                      <button
                        type="button"
                        className={`th-button ${menu?.col.key === c.key ? 'open' : ''}`}
                        title={`Trier ou filtrer : ${c.label}`}
                        onClick={(e) => {
                          const anchor = e.currentTarget;
                          setMenu((m) => (m?.col.key === c.key ? null : { col: c, anchor }));
                        }}
                      >
                        {c.label}
                        {dir && <span className="sort-ind"><IconSort dir={dir} /></span>}
                        {(c.filterOptions || c.filterRange) && <span className={`th-filter ${filtreActif ? 'on' : ''}`}><IconFilter /></span>}
                      </button>
                    ) : c.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td className="dt-empty" colSpan={columns.length + (selectable ? 1 : 0)}>{loading ? 'Chargement…' : emptyText}</td></tr>
            ) : rows.map((row) => (
              <tr key={rowKey(row)} className={selectable && selected!.has(rowKey(row)) ? 'dt-selected' : undefined}>
                {selectable && (
                  <td><input type="checkbox" className="dt-check" checked={selected!.has(rowKey(row))} onChange={() => toggleRow(rowKey(row))} aria-label="Sélectionner" /></td>
                )}
                {columns.map((c) => <td key={c.key}>{c.render(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nbPages > 1 && (
        <div className="dt-pager">
          <span className="hint">
            {pageCourante * pageSize + 1}-{Math.min((pageCourante + 1) * pageSize, total)} sur {total}
          </span>
          <div className="action-row">
            <button className="btn btn-sm" disabled={pageCourante === 0 || loading} onClick={() => onPageChange(pageCourante - 1)}>‹ Précédent</button>
            {Array.from({ length: nbPages }, (_, i) => i)
              .filter((i) => nbPages <= 7 || Math.abs(i - pageCourante) <= 2 || i === 0 || i === nbPages - 1)
              .map((i, k, arr) => (
                <span key={i} className="dt-pages">
                  {k > 0 && i - arr[k - 1] > 1 && <span className="hint">…</span>}
                  <button className={`btn btn-sm ${i === pageCourante ? 'btn-soft' : ''}`} disabled={loading} onClick={() => onPageChange(i)} aria-current={i === pageCourante ? 'page' : undefined}>{i + 1}</button>
                </span>
              ))}
            <button className="btn btn-sm" disabled={pageCourante >= nbPages - 1 || loading} onClick={() => onPageChange(pageCourante + 1)}>Suivant ›</button>
          </div>
        </div>
      )}

      {menu && (
        <MenuColonne
          anchor={menu.anchor}
          label={menu.col.label}
          sort={menu.col.sortKey && sort?.key === menu.col.sortKey ? sort.dir : null}
          onSort={menu.col.sortKey ? (dir) => trier(menu.col, dir) : undefined}
          options={menu.col.filterOptions}
          range={menu.col.filterRange}
          valeurs={menu.col.filterKey ? (filtres?.[menu.col.filterKey] ?? []) : []}
          onChange={menu.col.filterKey ? (v) => onFiltreChange!(menu.col.filterKey!, v) : undefined}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

// Menu d'en-tete simplifie : tri (si la colonne est triable) + un choix
// multiple parmi une liste fournie (si la colonne est filtrable). Pas de
// compteur par valeur - a la difference de DataTable, le serveur ne connait
// les valeurs possibles que si l'appelant les fournit explicitement.
function MenuColonne({
  anchor, label, sort, onSort, options, range, valeurs, onChange, onClose,
}: {
  anchor: HTMLElement;
  label: string;
  sort: 'asc' | 'desc' | null;
  onSort?: (dir: 'asc' | 'desc' | null) => void;
  options?: { value: string; label: string }[];
  range?: boolean;
  valeurs: string[];
  onChange?: (v: string[]) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [min, setMin] = useState(valeurs[0] ?? '');
  const [max, setMax] = useState(valeurs[1] ?? '');

  useLayoutEffect(() => {
    function place() {
      const r = anchor.getBoundingClientRect();
      const largeur = 240;
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
        aria-label={`Trier ou filtrer ${label}`}
      >
        {onSort && (
          <div className="col-menu-sort">
            <button className={sort === 'asc' ? 'on' : ''} onClick={() => onSort(sort === 'asc' ? null : 'asc')}>Trier A → Z</button>
            <button className={sort === 'desc' ? 'on' : ''} onClick={() => onSort(sort === 'desc' ? null : 'desc')}>Trier Z → A</button>
          </div>
        )}
        {options && onChange && (
          <>
            <p className="col-menu-title">Filtrer</p>
            <ul>
              <li>
                <label>
                  <input type="checkbox" checked={valeurs.length === 0} onChange={() => onChange([])} />
                  <span className="col-menu-label">Tous</span>
                </label>
              </li>
              {options.map((o) => (
                <li key={o.value}>
                  <label>
                    <input
                      type="checkbox"
                      checked={valeurs.includes(o.value)}
                      onChange={() => onChange(valeurs.includes(o.value) ? valeurs.filter((v) => v !== o.value) : [...valeurs, o.value])}
                    />
                    <span className="col-menu-label">{o.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
        {range && onChange && (
          <div className="col-menu-range">
            <div className="col-menu-range-row">
              <label className="col-menu-range-field">
                <span>Min</span>
                <input type="number" value={min} onChange={(e) => setMin(e.target.value)} placeholder="Sans min" />
              </label>
              <label className="col-menu-range-field">
                <span>Max</span>
                <input type="number" value={max} onChange={(e) => setMax(e.target.value)} placeholder="Sans max" />
              </label>
            </div>
            <div className="col-menu-range-actions">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => { setMin(''); setMax(''); onChange([]); }}
              >
                Effacer
              </button>
              <button type="button" className="btn btn-soft btn-sm" onClick={() => { onChange([min, max]); onClose(); }}>Appliquer</button>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

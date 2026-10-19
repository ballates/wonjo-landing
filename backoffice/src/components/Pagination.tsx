// Pagination des listes du back-office (memes classes que le pied des tableaux). Rien n'est affiche s'il n'y a qu'une page.
export function Pagination({ page, total, taille, onPage, unite = '' }: {
  page: number; total: number; taille: number; onPage: (p: number) => void; unite?: string;
}) {
  const nbPages = Math.max(1, Math.ceil(total / taille));
  if (nbPages <= 1) return null;
  const debut = page * taille + 1;
  const fin = Math.min((page + 1) * taille, total);
  return (
    <div className="dt-pager">
      <span className="hint">{debut}-{fin} sur {total}{unite ? ` ${unite}` : ''}</span>
      <div className="action-row">
        <button className="btn btn-sm" disabled={page === 0} onClick={() => onPage(page - 1)}>‹ Précédent</button>
        {Array.from({ length: nbPages }, (_, i) => i)
          .filter((i) => nbPages <= 7 || Math.abs(i - page) <= 2 || i === 0 || i === nbPages - 1)
          .map((i, k, arr) => (
            <span key={i} className="dt-pages">
              {k > 0 && i - arr[k - 1] > 1 && <span className="hint">…</span>}
              <button className={`btn btn-sm ${i === page ? 'btn-soft' : ''}`} onClick={() => onPage(i)} aria-current={i === page ? 'page' : undefined}>{i + 1}</button>
            </span>
          ))}
        <button className="btn btn-sm" disabled={page >= nbPages - 1} onClick={() => onPage(page + 1)}>Suivant ›</button>
      </div>
    </div>
  );
}

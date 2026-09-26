import { useNavigate } from 'react-router-dom';
import type { ElementAFaire } from '../lib/aFaire';

const GROUPES: { priorite: ElementAFaire['priorite']; titre: string; sous: string }[] = [
  { priorite: 'urgent', titre: 'Urgent', sous: 'Bloque des membres ou de l\'argent' },
  { priorite: 'important', titre: 'À traiter', sous: 'À faire dans les prochains jours' },
  { priorite: 'info', titre: 'Pour information', sous: 'À garder à l\'œil' },
];

export function CarteAFaire({ item }: { item: ElementAFaire; index?: number }) {
  const navigate = useNavigate();
  return (
    <div className={`todo-card todo-${item.priorite}`}>
      <span className="todo-count">{item.nb}</span>
      <div className="todo-text">
        <strong>{item.titre}</strong>
        <span>{item.detail}</span>
      </div>
      <button className="btn btn-soft btn-sm" onClick={() => navigate(item.lien, { state: item.onglet ? { tab: item.onglet } : undefined })}>
        {item.action}
      </button>
    </div>
  );
}

export function ListeAFaire({ items, error }: { items: ElementAFaire[] | null; error: string | null }) {
  return (
    <div>
      {error && <p className="page-error">{error}</p>}
      {!items && !error && <p className="loading-state">Chargement…</p>}
      {items && items.length === 0 && (
        <div className="empty-state todo-empty">
          <strong>Tout est à jour</strong>
          <span>Aucune action en attente pour votre rôle.</span>
        </div>
      )}
      {items && items.length > 0 && GROUPES.map((g) => {
        const liste = items.filter((i) => i.priorite === g.priorite);
        if (liste.length === 0) return null;
        return (
          <section key={g.priorite} className="todo-group">
            <h3>{g.titre} <span className="hint">· {g.sous}</span></h3>
            <div className="todo-list">
              {liste.map((i, k) => <CarteAFaire key={i.code} item={i} index={k} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

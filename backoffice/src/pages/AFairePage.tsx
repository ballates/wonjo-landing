import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAFaire, type ElementAFaire } from '../lib/aFaire';

const GROUPES: { priorite: ElementAFaire['priorite']; titre: string; sous: string }[] = [
  { priorite: 'urgent', titre: 'Urgent', sous: 'Bloque des membres ou de l\'argent' },
  { priorite: 'important', titre: 'À traiter', sous: 'À faire dans les prochains jours' },
  { priorite: 'info', titre: 'Pour information', sous: 'À garder à l\'œil' },
];

export function CarteAFaire({ item, index = 0 }: { item: ElementAFaire; index?: number }) {
  const navigate = useNavigate();
  return (
    <motion.div
      className={`todo-card todo-${item.priorite}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: 'easeOut' }}
    >
      <span className="todo-count">{item.nb}</span>
      <div className="todo-text">
        <strong>{item.titre}</strong>
        <span>{item.detail}</span>
      </div>
      <button className="btn btn-soft btn-sm" onClick={() => navigate(item.lien, { state: item.onglet ? { tab: item.onglet } : undefined })}>
        {item.action}
      </button>
    </motion.div>
  );
}

export function AFairePage() {
  const { items, error } = useAFaire();

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>À faire</h1>
          <p className="page-sub">Ce qui attend une action de votre part, calculé en direct sur les données de l'app.</p>
        </div>
      </div>
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

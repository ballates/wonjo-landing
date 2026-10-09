import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { JournalPage } from './JournalPage';

const SecuritePage = lazy(() => import('./SecuritePage').then((m) => ({ default: m.SecuritePage })));

type SousOnglet = 'securite' | 'actions';

export function AuditPage() {
  const [params, setParams] = useSearchParams();
  const onglet: SousOnglet = params.get('onglet') === 'actions' ? 'actions' : 'securite';

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Audit</h1>
          <p className="page-sub">Ce qui se passe sur la plateforme et ce que font les administrateurs.</p>
        </div>
      </div>

      <div className="tabs">
        <button className={onglet === 'securite' ? 'active' : ''} onClick={() => setParams({ onglet: 'securite' }, { replace: true })}>Sécurité</button>
        <button className={onglet === 'actions' ? 'active' : ''} onClick={() => setParams({ onglet: 'actions' }, { replace: true })}>Journal des actions</button>
      </div>

      {onglet === 'securite'
        ? <Suspense fallback={<p className="loading-state">Chargement…</p>}><SecuritePage integre /></Suspense>
        : <JournalPage integre />}
    </div>
  );
}

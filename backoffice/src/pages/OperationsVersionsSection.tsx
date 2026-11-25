import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { messageServeur } from '../lib/labels';
import { dateCourte, STATUTS, type Operation } from './VersionsAppSection';
import { Historique, type Ligne } from './ServicePage';

// Onglet « Service » d'Audit : les changements du service (maintenance, version minimale, interrupteurs, retours, suppressions) et
// les opérations sur les versions de l'app (retours, suppressions, relectures de la liste).
export function OperationsVersionsSection() {
  const [operations, setOperations] = useState<Operation[] | null>(null);
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    Promise.all([supabase.rpc('admin_ota_etat'), supabase.rpc('admin_etat_service')]).then(([o, e]) => {
      if (!vivant) return;
      const err = o.error ?? e.error;
      if (err) { setErreur(messageServeur(err.message)); return; }
      setOperations((o.data as { operations: Operation[] }).operations ?? []);
      setLignes((e.data as { historique: Ligne[] }).historique ?? []);
    });
    return () => { vivant = false; };
  }, []);

  if (erreur) return <p className="page-error">{erreur}</p>;
  if (!operations || !lignes) return <p className="loading-state">Chargement…</p>;
  return (
    <>
    <Historique lignes={lignes} />
    <div className="chart-card rg-carte">
      <h3>Opérations sur les versions de l’app</h3>
      <p className="chart-sub">Les 15 dernières : retours à une version, suppressions, relectures de la liste.</p>
      {operations.length === 0 ? <p className="hint service-hint">Aucune opération pour l’instant.</p> : (
        <table className="service-historique">
          <thead><tr><th>Date</th><th>Opération</th><th>État</th><th>Par</th></tr></thead>
          <tbody>
            {operations.map((o) => (
              <tr key={o.id}>
                <td className="service-date">{dateCourte(o.created_at)}</td>
                <td>
                  {o.type === 'revenir' ? `Retour arrière : ${o.motif}`
                    : o.type === 'supprimer' ? `Suppression de ${o.nb_versions ?? '?'} version(s) : ${o.motif}`
                    : 'Relecture de la liste'}
                  {o.erreur && <div className="service-erreur">{o.erreur}</div>}
                </td>
                <td>
                  <span className={`badge ${STATUTS[o.statut].badge}`}>{STATUTS[o.statut].libelle}</span>
                  {o.run_url && <> <a href={o.run_url} target="_blank" rel="noreferrer">détail</a></>}
                </td>
                <td>{o.par ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
    </>
  );
}

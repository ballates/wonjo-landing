import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { messageServeur } from '../lib/labels';

// [529] Versions de l'app publiées (mises à jour EAS) et retour à une version précédente. Un clic inscrit une opération
// (admin_ota_demander : super admin, double authentification, motif, journal) puis l'Edge Function admin-ota déclenche la tâche
// GitHub ota.yml, qui republie la version choisie. Les téléphones la reçoivent au lancement suivant de l'app.

interface Version {
  groupe: string;
  branche: string;
  message: string | null;
  plateformes: string[];
  commit_git: string | null;
  publie_at: string;
  republie_de: string | null;
  en_service: boolean;
}

interface Operation {
  id: string;
  type: 'actualiser' | 'revenir';
  groupe: string | null;
  branche: string | null;
  motif: string;
  statut: 'demande' | 'en_cours' | 'fait' | 'echec';
  erreur: string | null;
  run_url: string | null;
  created_at: string;
  termine_at: string | null;
  par: string | null;
}

export interface EtatOta {
  versions: Version[];
  operations: Operation[];
  en_cours: boolean;
  actualise_at: string | null;
}

const BRANCHES: Record<string, string> = { preview: 'Bêta (preview)', production: 'Production' };
const STATUTS: Record<Operation['statut'], { libelle: string; badge: string }> = {
  demande: { libelle: 'Demandée', badge: 'badge-amber' },
  en_cours: { libelle: 'En cours', badge: 'badge-amber' },
  fait: { libelle: 'Faite', badge: 'badge-green' },
  echec: { libelle: 'Échec', badge: 'badge-danger' },
};

const date = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

async function appeler(body: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('admin-ota', { body });
  if (!error && !data?.error) return null;
  let detail: string | undefined = data?.error;
  const ctx = (error as { context?: Response } | null)?.context;
  if (!detail && ctx) detail = await ctx.json().then((b: { error?: string }) => b.error).catch(() => undefined);
  return messageServeur(detail ?? error?.message ?? 'Demande impossible.');
}

// La page Service charge l'état (admin_ota_etat) et le relit seule pendant qu'une opération tourne.
export function VersionsAppSection({ etat, modifiable, onChange: charger }: { etat: EtatOta; modifiable: boolean; onChange: () => void }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [choisie, setChoisie] = useState<Version | null>(null);
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);

  async function actualiser() {
    setBusy(true); setErreur(null);
    const e = await appeler({ action: 'actualiser' });
    setBusy(false);
    if (e) setErreur(e);
    charger();
  }

  async function revenir() {
    if (!choisie || !motif.trim()) return;
    setBusy(true); setErreur(null);
    const e = await appeler({ action: 'revenir', groupe: choisie.groupe, motif: motif.trim() });
    setBusy(false);
    if (e) { setErreur(e); charger(); return; }
    setChoisie(null); setMotif('');
    charger();
  }

  const branches = [...new Set(etat.versions.map((v) => v.branche))];

  return (
    <div className="chart-card rg-carte">
      <div className="rg-tete">
        <div className="rg-tete-texte">
          <h3>Versions de l’app</h3>
          <p className="chart-sub">
            Mises à jour publiées. « Revenir » republie une version précédente : les téléphones la reçoivent au lancement suivant de l’app.
            {etat.actualise_at && <> Liste relue le {date(etat.actualise_at)}.</>}
          </p>
        </div>
        {modifiable && (
          <button type="button" className="btn btn-sm" disabled={busy || etat.en_cours} onClick={actualiser}>
            Actualiser la liste
          </button>
        )}
      </div>

      {etat.en_cours && <p className="rg-note">Opération en cours (une à deux minutes) : la page se met à jour seule.</p>}
      {erreur && <p className="page-error">{erreur}</p>}

      {choisie && (
        <div className="rg-confirmer is-off service-action">
          <strong>Revenir à « {choisie.message ?? choisie.groupe} » ({date(choisie.publie_at)}) ?</strong>
          <p className="hint">
            Tous les utilisateurs de la branche {BRANCHES[choisie.branche] ?? choisie.branche} recevront cette version au prochain lancement de l’app.
            Les changements publiés depuis disparaissent de l’app jusqu’à une nouvelle publication.
          </p>
          <div className="rg-confirmer-ligne">
            <input type="text" value={motif} autoFocus placeholder="Motif (inscrit au journal)" onChange={(e) => setMotif(e.target.value)} />
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { setChoisie(null); setMotif(''); }}>Annuler</button>
            <button type="button" className="btn btn-sm btn-danger" disabled={busy || !motif.trim()} onClick={revenir}>
              {busy ? '…' : 'Revenir à cette version'}
            </button>
          </div>
        </div>
      )}

      {etat.versions.length === 0 ? (
        <p className="hint service-hint">Aucune version connue : « Actualiser la liste » la relit chez Expo.</p>
      ) : branches.map((b) => (
        <div key={b}>
          <p className="section-title service-branche">{BRANCHES[b] ?? b}</p>
          <table className="service-historique">
            <thead><tr><th>Publiée</th><th>Message</th><th>Commit</th><th></th></tr></thead>
            <tbody>
              {etat.versions.filter((v) => v.branche === b).map((v) => (
                <tr key={v.groupe}>
                  <td>{date(v.publie_at)}</td>
                  <td>
                    {v.message ?? '—'}
                    {v.republie_de && <> <span className="badge badge-teal">Retour arrière</span></>}
                    {v.plateformes.length === 1 && <> <span className="badge badge-muted">{v.plateformes[0]} seul</span></>}
                  </td>
                  <td><code>{v.commit_git?.slice(0, 8) ?? '—'}</code></td>
                  <td className="service-cellule-action">
                    {v.en_service ? <span className="badge badge-green">En service</span>
                      : modifiable && (
                        <button type="button" className="btn btn-sm" disabled={busy || etat.en_cours}
                                onClick={() => { setChoisie(v); setMotif(''); setErreur(null); }}>
                          Revenir
                        </button>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {etat.operations.length > 0 && (
        <>
          <p className="section-title service-branche">Dernières opérations</p>
          <table className="service-historique">
            <thead><tr><th>Date</th><th>Opération</th><th>État</th><th>Par</th></tr></thead>
            <tbody>
              {etat.operations.map((o) => (
                <tr key={o.id}>
                  <td>{date(o.created_at)}</td>
                  <td>
                    {o.type === 'revenir' ? `Retour arrière : ${o.motif}` : 'Relecture de la liste'}
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
        </>
      )}
    </div>
  );
}

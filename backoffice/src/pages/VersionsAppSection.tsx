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
  rang: number;
}

interface Operation {
  id: string;
  type: 'actualiser' | 'revenir' | 'supprimer';
  groupe: string | null;
  branche: string | null;
  motif: string;
  statut: 'demande' | 'en_cours' | 'fait' | 'echec';
  erreur: string | null;
  run_url: string | null;
  nb_versions: number | null;
  created_at: string;
  termine_at: string | null;
  par: string | null;
}

export interface EtatOta {
  versions: Version[];
  protegees: number;
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

const PAR_PAGE = 5;

const date = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
// Pour les tableaux : « 23 nov. 18:27 » (l'année n'apparaît que si ce n'est pas l'année en cours), sur une seule ligne.
export function dateCourte(iso: string): string {
  const d = new Date(iso);
  const memeAnnee = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', ...(memeAnnee ? {} : { year: 'numeric' }), hour: '2-digit', minute: '2-digit' });
}

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
  const [aSupprimer, setASupprimer] = useState<Version | null>(null);
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState<Record<string, number>>({});

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

  async function supprimer() {
    if (!aSupprimer || !motif.trim()) return;
    setBusy(true); setErreur(null);
    const e = await appeler({ action: 'supprimer', groupe: aSupprimer.groupe, motif: motif.trim() });
    setBusy(false);
    if (e) { setErreur(e); charger(); return; }
    setASupprimer(null); setMotif('');
    charger();
  }

  const nbASupprimer = aSupprimer
    ? etat.versions.filter((v) => v.branche === aSupprimer.branche && new Date(v.publie_at) <= new Date(aSupprimer.publie_at)).length
    : 0;

  const branches = [...new Set(etat.versions.map((v) => v.branche))];

  return (
    <div className="chart-card rg-carte">
      <div className="rg-tete">
        <div className="rg-tete-texte">
          <h3>Versions de l’app</h3>
          <p className="chart-sub">
            Mises à jour publiées. « Revenir » republie une version précédente, reçue au lancement suivant.
            {etat.actualise_at && <> Liste relue le {date(etat.actualise_at)}.</>}
          </p>
        </div>
        {modifiable && (
          <button type="button" className="btn btn-sm" disabled={busy || etat.en_cours} onClick={actualiser}>
            Actualiser la liste
          </button>
        )}
      </div>

      {etat.en_cours && <p className="rg-note">Opération en cours (1 à 2 minutes) : mise à jour automatique.</p>}
      {erreur && <p className="page-error">{erreur}</p>}

      {choisie && (
        <div className="rg-confirmer is-off service-action">
          <strong>Revenir à « {choisie.message ?? choisie.groupe} » ({date(choisie.publie_at)}) ?</strong>
          <p className="hint">
            Tous les utilisateurs de la branche {BRANCHES[choisie.branche] ?? choisie.branche} la recevront au prochain lancement.
            Les changements publiés depuis disparaissent jusqu’à une nouvelle publication.
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

      {aSupprimer && (
        <div className="rg-confirmer is-off service-action">
          <strong>Supprimer {nbASupprimer} version{nbASupprimer > 1 ? 's' : ''} ({BRANCHES[aSupprimer.branche] ?? aSupprimer.branche}) ?</strong>
          <p className="hint">
            « {aSupprimer.message ?? aSupprimer.groupe} » ({dateCourte(aSupprimer.publie_at)}) et toutes les plus anciennes disparaissent chez Expo,
            sans retour possible. Les {etat.protegees} plus récentes sont gardées. Les téléphones ne changent pas.
          </p>
          <div className="rg-confirmer-ligne">
            <input type="text" value={motif} autoFocus placeholder="Motif (inscrit au journal)" onChange={(e) => setMotif(e.target.value)} />
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { setASupprimer(null); setMotif(''); }}>Annuler</button>
            <button type="button" className="btn btn-sm btn-danger" disabled={busy || !motif.trim()} onClick={supprimer}>
              {busy ? '…' : `Supprimer ${nbASupprimer} version${nbASupprimer > 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {etat.versions.length === 0 ? (
        <p className="hint service-hint">Aucune version connue : « Actualiser la liste ».</p>
      ) : branches.map((b) => {
        const deLaBranche = etat.versions.filter((v) => v.branche === b);
        const nbPages = Math.max(1, Math.ceil(deLaBranche.length / PAR_PAGE));
        const page = Math.min(pages[b] ?? 0, nbPages - 1);
        const visibles = deLaBranche.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE);
        return (
        <div key={b}>
          <p className="section-title service-branche">{BRANCHES[b] ?? b}</p>
          <table className="service-historique service-versions">
            <thead><tr><th>Publiée</th><th>Message</th><th>Commit</th><th></th></tr></thead>
            <tbody>
              {visibles.map((v) => (
                <tr key={v.groupe} className={v.en_service ? 'service-ligne-service' : undefined}>
                  <td className="service-date">{dateCourte(v.publie_at)}</td>
                  <td>
                    {v.message ?? '—'}
                    {v.republie_de && <> <span className="badge badge-teal">Retour arrière</span></>}
                    {v.plateformes.length === 1 && <> <span className="badge badge-muted">{v.plateformes[0]} seul</span></>}
                  </td>
                  <td><code>{v.commit_git?.slice(0, 8) ?? '—'}</code></td>
                  <td className="service-cellule-action">
                    {v.en_service ? <span className="badge badge-green">En service</span>
                      : modifiable && (
                        <>
                          <button type="button" className="btn btn-sm" disabled={busy || etat.en_cours}
                                  onClick={() => { setChoisie(v); setASupprimer(null); setMotif(''); setErreur(null); }}>
                            Revenir
                          </button>
                          {v.rang > etat.protegees && (
                            <button type="button" className="btn btn-sm btn-danger-ghost" disabled={busy || etat.en_cours}
                                    title="Supprime cette version et toutes les plus anciennes"
                                    onClick={() => { setASupprimer(v); setChoisie(null); setMotif(''); setErreur(null); }}>
                              Supprimer
                            </button>
                          )}
                        </>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {nbPages > 1 && (
            <div className="rg-confirmer-ligne service-pagination">
              <button type="button" className="btn btn-sm" disabled={page === 0}
                      onClick={() => setPages((p) => ({ ...p, [b]: page - 1 }))}>Plus récentes</button>
              <span className="hint">Page {page + 1} sur {nbPages} ({deLaBranche.length} versions)</span>
              <button type="button" className="btn btn-sm" disabled={page >= nbPages - 1}
                      onClick={() => setPages((p) => ({ ...p, [b]: page + 1 }))}>Plus anciennes</button>
            </div>
          )}
        </div>
        );
      })}

      {etat.operations.length > 0 && (
        <>
          <p className="section-title service-branche">Dernières opérations</p>
          <table className="service-historique">
            <thead><tr><th>Date</th><th>Opération</th><th>État</th><th>Par</th></tr></thead>
            <tbody>
              {etat.operations.map((o) => (
                <tr key={o.id}>
                  <td className="service-date">{dateCourte(o.created_at)}</td>
                  <td>
                    {o.type === 'revenir' ? `Retour arrière : ${o.motif}` : o.type === 'supprimer' ? `Suppression de ${o.nb_versions ?? '?'} version(s) : ${o.motif}` : 'Relecture de la liste'}
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

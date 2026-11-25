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

export interface Operation {
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

export const BRANCHES: Record<string, string> = { preview: 'Bêta (preview)', production: 'Production' };
export const STATUTS: Record<Operation['statut'], { libelle: string; badge: string }> = {
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
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [suppression, setSuppression] = useState(false);
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
    if (selection.size === 0 || !motif.trim()) return;
    setBusy(true); setErreur(null);
    const e = await appeler({ action: 'supprimer_plusieurs', groupes: [...selection], motif: motif.trim() });
    setBusy(false);
    if (e) { setErreur(e); charger(); return; }
    setSelection(new Set()); setSuppression(false); setMotif('');
    charger();
  }

  const basculer = (groupe: string) => setSelection((cur) => {
    const n = new Set(cur); if (n.has(groupe)) n.delete(groupe); else n.add(groupe); return n;
  });
  const supprimables = (liste: Version[]) => liste.filter((v) => v.rang > etat.protegees).map((v) => v.groupe);
  const toutBasculer = (liste: Version[]) => setSelection((cur) => {
    const ids = supprimables(liste); const n = new Set(cur);
    if (ids.length > 0 && ids.every((g) => n.has(g))) ids.forEach((g) => n.delete(g)); else ids.forEach((g) => n.add(g));
    return n;
  });

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

      {selection.size > 0 && (
        <div className="rg-confirmer is-off service-action">
          <strong>{selection.size} version{selection.size > 1 ? 's' : ''} sélectionnée{selection.size > 1 ? 's' : ''}</strong>
          {!suppression ? (
            <div className="rg-confirmer-ligne">
              <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setSelection(new Set())}>Tout désélectionner</button>
              <button type="button" className="btn btn-sm btn-danger" disabled={busy || etat.en_cours} onClick={() => { setSuppression(true); setChoisie(null); setMotif(''); setErreur(null); }}>
                Supprimer la sélection
              </button>
            </div>
          ) : (
            <>
              <p className="hint">Ces versions disparaissent chez Expo, sans retour possible. Les {etat.protegees} plus récentes de chaque branche sont gardées. Les téléphones ne changent pas.</p>
              <div className="rg-confirmer-ligne">
                <input type="text" value={motif} autoFocus placeholder="Motif (inscrit au journal)" onChange={(e) => setMotif(e.target.value)} />
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { setSuppression(false); setMotif(''); }}>Annuler</button>
                <button type="button" className="btn btn-sm btn-danger" disabled={busy || !motif.trim()} onClick={supprimer}>
                  {busy ? '…' : `Supprimer ${selection.size} version${selection.size > 1 ? 's' : ''}`}
                </button>
              </div>
            </>
          )}
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
            <thead><tr><th className="service-case">{modifiable && supprimables(deLaBranche).length > 0 && <input type="checkbox" aria-label="Tout sélectionner" title="Tout sélectionner (versions supprimables)" checked={supprimables(deLaBranche).every((g) => selection.has(g))} onChange={() => toutBasculer(deLaBranche)} />}</th><th>Publiée</th><th>Appareils</th><th>Message</th><th>Commit</th><th></th></tr></thead>
            <tbody>
              {visibles.map((v) => (
                <tr key={v.groupe} className={v.en_service ? 'service-ligne-service' : undefined}>
                  <td className="service-case">{modifiable && v.rang > etat.protegees && <input type="checkbox" aria-label="Sélectionner" checked={selection.has(v.groupe)} onChange={() => basculer(v.groupe)} />}</td>
                  <td className="service-date">{dateCourte(v.publie_at)}</td>
                  <td className="service-appareils">
                    {['ios', 'android'].map((pf) => (
                      <span key={pf} className={`badge ${v.plateformes.includes(pf) ? (pf === 'ios' ? 'badge-teal' : 'badge-green') : 'badge-muted'}`}
                            title={v.plateformes.includes(pf) ? undefined : 'Non publiée sur cette plateforme'}>
                        {pf === 'ios' ? 'iOS' : 'Android'}
                      </span>
                    ))}
                  </td>
                  <td>
                    {v.message ?? '—'}
                    {v.republie_de && <> <span className="badge badge-teal">Retour arrière</span></>}
                  </td>
                  <td><code>{v.commit_git?.slice(0, 8) ?? '—'}</code></td>
                  <td className="service-cellule-action">
                    {v.en_service ? <span className="badge badge-green">En service</span>
                      : modifiable && (
                        <>
                          <button type="button" className="btn btn-sm" disabled={busy || etat.en_cours}
                                  onClick={() => { setChoisie(v); setSuppression(false); setMotif(''); setErreur(null); }}>
                            Revenir
                          </button>
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

      <p className="hint service-hint">L’historique des opérations (retours, suppressions, relectures) est dans Audit, onglet « Service ».</p>
    </div>
  );
}

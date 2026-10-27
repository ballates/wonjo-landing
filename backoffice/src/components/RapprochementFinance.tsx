import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { euros } from './Kpi';

// [460] Rapprochement : l'argent réellement détenu (Stripe, moins ce qui est dû aux voyageurs, plus les caisses des points) doit retomber sur la marge
// nette (acquise + à venir). Vert quand c'est égal, rouge sinon, avec ce qui explique l'écart. Finance et super_admin ; la base décide des droits.

interface Rapprochement {
  egal: boolean;
  stripe: { disponible: number; en_attente: number; total: number; autres_devises: { devise: string; montant: number }[] };
  voyageurs_a_payer: number;
  nb_voyageurs_a_payer: number;
  caisses: number;
  points: { point: string; eur: number }[];
  siege: { recu: number; avance: number; paye_voyageurs: number; poche: number };
  detenu: number;
  marge: { acquise: number; a_venir: number; total: number };
  ecart: number;
  paiements_sans_dossier: { id: string; date: string | null; devise: string; net: number | null }[];
  acceptes: { id: string; motif: string; par: string | null; le: string; net: number | null }[];
  acceptes_total: number;
  versements_banque: number;
  ecarts_acceptes_total: number;
  ecart_explique: number;
  ecart_inexplique: number;
  lu_a: string;
}

const signe = (n: number) => `${n > 0 ? '+' : ''}${euros(n)}`;

export function RapprochementFinance() {
  const [data, setData] = useState<Rapprochement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const charger = useCallback(async () => {
    setBusy(true);
    setError(null);
    const { data: d, error: e } = await supabase.functions.invoke('admin-rapprochement-finance');
    if (e) {
      const ctx = (e as { context?: Response }).context;
      const corps = ctx ? await ctx.json().catch(() => null) as { error?: string } | null : null;
      setError(corps?.error ?? e.message);
    } else {
      setData(d as Rapprochement);
    }
    setBusy(false);
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  const etat = data ? (data.egal ? 'ok' : 'ecart') : error ? 'ecart' : 'attente';

  return (
    <section className={`rapp rapp--${etat}`} aria-busy={busy} aria-label="Rapprochement Stripe, caisses et marge nette">
      <header className="rapp-tete">
        <span className="rapp-sceau" aria-hidden="true">
          {etat === 'ok' ? (
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          ) : etat === 'ecart' ? (
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 6.5v7" /><circle cx="12" cy="17.6" r="0.6" fill="currentColor" /></svg>
          ) : (
            <span className="rapp-pulse" />
          )}
        </span>
        <div className="rapp-titre">
          <h3>Rapprochement</h3>
        </div>
        {data && (
          <div className="rapp-cible rapp-tip rapp-tip--centre" tabIndex={0} data-tip={`Marge nette : acquise ${euros(data.marge.acquise)} + à venir ${euros(data.marge.a_venir)}`}>
            <span>L'argent à Wonjo doit égaler la marge nette</span>
            <strong>{euros(data.marge.total)}</strong>
          </div>
        )}
        <div className="rapp-actions">
          <button type="button" className="rapp-rafraichir rapp-tip rapp-tip--droite" onClick={() => void charger()} disabled={busy} aria-label="Actualiser le rapprochement"
            data-tip={data ? `Actualiser · lu à ${new Date(data.lu_a).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : 'Actualiser'}>
            <svg className={busy ? 'rapp-tourne' : undefined} viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" />
            </svg>
          </button>
        </div>
      </header>

      {error && <p className="page-error">{error}</p>}

      {!data && !error && (
        <div className="rapp-squelette" aria-hidden="true">
          <span /><span /><span /><span />
        </div>
      )}

      {data && (
        <>
          <p className="rapp-verdict" role="status">
            {data.egal
              ? <>Tout concorde : l'argent détenu <strong>correspond à la marge nette</strong>.</>
              : <><strong>{euros(Math.abs(data.ecart))}</strong> {data.ecart > 0 ? 'de plus' : 'de moins'} que la marge nette attendue.</>}
          </p>

          <div className="rapp-equation" role="group" aria-label="Calcul de l'argent détenu">
            <Tuile titre="Solde Stripe" valeur={euros(data.stripe.total)} note={`${euros(data.stripe.disponible)} disponible · ${euros(data.stripe.en_attente)} en attente`} />
            <Operateur signe="−" />
            <Tuile ton="voyageur" titre="Dû aux voyageurs" valeur={euros(data.voyageurs_a_payer)} note={`${data.nb_voyageurs_a_payer} dossier(s) pas encore payé(s)`} />
            <Operateur signe="+" />
            <Tuile titre="Caisses des points" valeur={euros(data.caisses)}
              note={data.points.length ? data.points.map((p) => `${p.point} ${euros(p.eur)}`).join(' · ') : 'aucun mouvement'} />
            {data.siege.poche !== 0 && (
              <>
                <Operateur signe="+" />
                <Tuile titre="Remis au siège" valeur={euros(data.siege.poche)}
                  note={`remis ${euros(data.siege.recu)} − avances ${euros(data.siege.avance)} − voyageurs payés hors Stripe ${euros(data.siege.paye_voyageurs)}`} />
              </>
            )}
            {data.versements_banque !== 0 && (
              <>
                <Operateur signe="+" />
                <Tuile titre="Déjà versé à la banque" valeur={euros(data.versements_banque)} note="Argent sorti du solde Stripe vers la banque de Wonjo : il est toujours à Wonjo" />
              </>
            )}
            {(data.acceptes_total !== 0 || data.ecarts_acceptes_total !== 0) && (
              <>
                <Operateur signe="−" />
                <Tuile titre="Écarts acceptés" valeur={euros(data.acceptes_total + data.ecarts_acceptes_total)}
                  note={`Paiements sans dossier ${euros(data.acceptes_total)} · lignes du détail Stripe ${euros(data.ecarts_acceptes_total)} (motif et auteur dans l'audit)`} />
              </>
            )}
            <Operateur signe="=" />
            <Tuile ton="total" titre="Argent à Wonjo" valeur={euros(data.detenu)} note="une fois les voyageurs mis de côté" />
          </div>

          {!data.egal && (
            <details className="rapp-reste">
              <summary className="rapp-reste-tete">
                <strong>Pour que ce soit égal : {signe(-data.ecart)}</strong>
                <span className="rapp-puce rapp-puce--danger">Reste inexpliqué {signe(data.ecart_inexplique)}</span>
                <span className="rapp-reste-fleche" aria-hidden="true" />
              </summary>
              {data.paiements_sans_dossier.length > 0 && (
                <details className="rapp-detail">
                  <summary>
                    {data.paiements_sans_dossier.length} paiement(s) Stripe sans dossier
                    {data.ecart_explique !== 0 && <> · <strong>{signe(data.ecart_explique)}</strong></>}
                  </summary>
                  <ul className="rapp-puces">
                    {data.paiements_sans_dossier.map((p) => (
                      <li key={p.id} className="rapp-puce rapp-puce--ligne">
                        <code>{p.id.slice(0, 14)}…</code>
                        {p.date && <span>{new Date(p.date).toLocaleDateString('fr-FR')}</span>}
                        <b>{p.net != null ? euros(p.net) : `en ${p.devise}, non compté`}</b>
                        <Accepter paiementId={p.id} onFait={() => void charger()} />
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {Math.abs(data.ecart_inexplique) >= 0.01 && (
                <p className="rapp-alerte">Un mouvement que l'application ne connaît pas (virement vers une banque, remboursement, litige, écart de caisse…). À vérifier dans Stripe.</p>
              )}
            </details>
          )}

          <DetailStripe onAccepte={() => void charger()} version={data.lu_a} />

          {data.stripe.autres_devises.length > 0 && (
            <p className="rapp-note">Soldes en autre devise, non comptés : {data.stripe.autres_devises.map((m) => `${m.montant.toLocaleString('fr-FR')} ${m.devise}`).join(' · ')}.</p>
          )}
        </>
      )}
    </section>
  );
}

function Tuile({ titre, valeur, note, ton }: { titre: string; valeur: string; note?: string; ton?: 'voyageur' | 'total' }) {
  return (
    <div className={`rapp-colonne${note ? ' rapp-tip' : ''}`} data-tip={note} tabIndex={note ? 0 : undefined}>
      <span className="rapp-tuile-titre">{titre}</span>
      <div className={`rapp-tuile${ton ? ` rapp-tuile--${ton}` : ''}`}>
        <strong className="rapp-tuile-valeur">{valeur}</strong>
      </div>
    </div>
  );
}

function Operateur({ signe: s }: { signe: string }) {
  return <span className="rapp-operateur" aria-hidden="true">{s}</span>;
}

// « Accepter » un paiement Stripe sans dossier : motif obligatoire, la base refuse sinon (465). La finance seule, session vérifiée.
function Accepter({ paiementId, onFait }: { paiementId: string; onFait: () => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function valider() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc('admin_rapprochement_accepter_paiement', { p_payment_intent: paiementId, p_motif: motif.trim() });
    setBusy(false);
    if (e) { setError(e.message); return; }
    onFait();
  }

  if (!ouvert) return <button type="button" className="rapp-accepter" onClick={() => setOuvert(true)}>Accepter</button>;
  return (
    <span className="rapp-accepter-form">
      <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif (ex. test de juin, dossier supprimé)" maxLength={300} aria-label="Motif" autoFocus />
      <button type="button" className="rapp-accepter" onClick={() => void valider()} disabled={busy || motif.trim().length < 10}>{busy ? '…' : 'Confirmer'}</button>
      <button type="button" className="rapp-accepter rapp-accepter--neutre" onClick={() => { setOuvert(false); setMotif(''); setError(null); }}>Annuler</button>
      {error && <span className="rapp-accepter-erreur">{error}</span>}
    </span>
  );
}

interface LigneDetail {
  cle: string; libelle: string; nb: number; stripe: number; hors_dossier: number; application: number;
  ecart: number; accepte: number; reste: number; note: string | null;
}
interface Detail {
  lignes: LigneDetail[]; total_ecritures: number; solde_stripe: number; ecart_solde: number; sans_dossier_net: number; nb_ecritures: number; tronque: boolean;
}

const aUnEcart = (n: number) => Math.abs(n) >= 0.01;

// « Détail Stripe » (466, 467) : les écritures du solde Stripe regroupées par type, comparées à ce que l'application attend. Lu à la demande, à l'ouverture.
// L'écart restant d'une ligne peut être ACCEPTÉ (motif obligatoire, tracé) : le montant est relu chez Stripe par le serveur, jamais saisi ici.
function DetailStripe({ onAccepte, version }: { onAccepte: () => void; version: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const charger = useCallback(async () => {
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.functions.invoke('admin-rapprochement-finance', { body: { detail: true } });
    if (e) {
      const ctx = (e as { context?: Response }).context;
      const corps = ctx ? await ctx.json().catch(() => null) as { error?: string } | null : null;
      setError(corps?.error ?? e.message);
    } else {
      setDetail((data as { detail: Detail }).detail);
    }
    setBusy(false);
  }, []);

  // Lu d'avance, dès que la carte est affichée (et relu quand elle est actualisée) : le tableau est déjà là quand on ouvre « Détail Stripe ».
  useEffect(() => { void charger(); }, [charger, version]);

  return (
    <details className="rapp-detail rapp-detail--stripe" onToggle={(e) => setOuvert((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>Détail Stripe</summary>
      {ouvert && (
        <div className="rapp-tableau">
          {busy && !detail && <p className="loading-state">Lecture des écritures Stripe…</p>}
          {error && <p className="page-error">{error}</p>}
          {detail && (
            <>
              <div className="marge-table-cadre">
                <table className="marge-table marge-table--detail">
                  <thead>
                    <tr><th>Écritures Stripe</th><th>Nb</th><th>Selon Stripe</th><th>Selon les dossiers</th><th>Écart</th></tr>
                  </thead>
                  <tbody>
                    {detail.lignes.map((l) => (
                      <tr key={l.cle}>
                        <td>
                          <span className={`rapp-table-nom${l.note ? ' rapp-tip rapp-tip--bas' : ''}`} data-tip={l.note ?? undefined} tabIndex={l.note ? 0 : undefined}>
                            <span className={`marge-pastille ${l.stripe >= 0 ? 'marge-pastille--plus' : 'marge-pastille--moins'}`} aria-hidden="true">{l.stripe >= 0 ? '+' : '−'}</span>
                            {l.libelle}
                          </span>
                          {l.hors_dossier !== 0 && <small>dont {signe(l.hors_dossier)} de paiements sans dossier</small>}
                        </td>
                        <td className="rapp-table-nb">{l.nb}</td>
                        <td>{euros(l.stripe)}</td>
                        <td>{euros(l.application)}</td>
                        <td>
                          <div className="rapp-table-etat">
                            {aUnEcart(l.reste)
                              ? <span className="rapp-pastille rapp-pastille--rouge">{signe(l.reste)}</span>
                              : <span className="rapp-pastille rapp-pastille--vert">{aUnEcart(l.accepte) ? 'accepté' : 'juste'}</span>}
                            {aUnEcart(l.accepte) && <small>{signe(l.accepte)} accepté</small>}
                            {aUnEcart(l.reste) && l.cle !== 'versements' && (
                              <AccepterLigne cle={l.cle} onFait={() => { void charger(); onAccepte(); }} />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className={aUnEcart(detail.ecart_solde) ? 'marge-pied--rouge' : undefined}>
                      <td>Total</td>
                      <td />
                      <td>{euros(detail.total_ecritures)}</td>
                      <td>Solde Stripe</td>
                      <td>{euros(detail.solde_stripe)} {aUnEcart(detail.ecart_solde) ? `· écart ${signe(detail.ecart_solde)}` : '✓'}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {detail.tronque && <p className="rapp-note">Liste tronquée : seules les écritures les plus récentes sont lues.</p>}
            </>
          )}
        </div>
      )}
    </details>
  );
}

// Accepter l'écart restant d'une ligne : motif obligatoire ; le serveur relit l'écart chez Stripe et refuse s'il n'y a plus rien à accepter.
function AccepterLigne({ cle, onFait }: { cle: string; onFait: () => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function valider() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.functions.invoke('admin-rapprochement-finance', { body: { accepter_ecart: { cle, motif: motif.trim() } } });
    if (e) {
      const ctx = (e as { context?: Response }).context;
      const corps = ctx ? await ctx.json().catch(() => null) as { error?: string } | null : null;
      setError(corps?.error ?? e.message);
      setBusy(false);
      return;
    }
    setBusy(false);
    onFait();
  }

  if (!ouvert) return <button type="button" className="rapp-accepter" onClick={() => setOuvert(true)}>Accepter</button>;
  return (
    <span className="rapp-accepter-form">
      <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif (ex. paiements de test de juin)" maxLength={300} aria-label="Motif" autoFocus />
      <button type="button" className="rapp-accepter" onClick={() => void valider()} disabled={busy || motif.trim().length < 10}>{busy ? '…' : 'Confirmer'}</button>
      <button type="button" className="rapp-accepter rapp-accepter--neutre" onClick={() => { setOuvert(false); setMotif(''); setError(null); }}>Annuler</button>
      {error && <span className="rapp-accepter-erreur">{error}</span>}
    </span>
  );
}

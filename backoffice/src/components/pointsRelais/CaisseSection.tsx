import { ChampMontant } from '../ChampMontant';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../Modal';
import { InfoBulle } from '../InfoBulle';
import { Badge } from '../Badge';
import { DataTable, type Column } from '../DataTable';
import { BasculeUnite, type Unite } from '../BasculeUnite';
import {
  COULEUR_OPERATEUR, LABEL_OPERATEUR, dateCourte, equivalentEuros, libelleDevise, montantEuros, montantLocal, tauxDe, useTauxEuros, type Operateur, type PointRelais,
} from '../../lib/pointsRelais';
import { LogoOperateur } from './LogoOperateur';

// Caisse d'un point relais (migrations 409-410, docs/POINTS_RELAIS.md § 8.4 et § 11) : soldes par poche (especes,
// chaque compte mobile money), operations a valider, historique, rapprochements. Separation des taches : celui qui
// declare ne valide jamais ; le serveur decide qui peut quoi, cette page n'affiche que ses reponses.

interface Solde { moyen: string; solde: number; rapproche_at: string | null; dernier_ecart: number | null }
interface Attente {
  id: number; type: TypeOperation; sens: number; moyen: string; montant_local: number; reference: string | null;
  motif: string | null; created_at: string; cree_par_nom: string | null; de_moi: boolean;
}
interface Caisse { devise: string; plafond_especes: number | null; soldes: Solde[]; attente: Attente[] }
interface Mouvement {
  id: number; created_at: string; type: string; sens: number; moyen: string; montant_local: number; devise: string;
  montant_eur: number; reference: string | null; motif: string | null; demande_ref: string | null; cree_par_nom: string | null;
  contrepasse_id: number | null; contrepasse: boolean;
}
interface Rapprochement {
  id: number; created_at: string; moyen: string; solde_theorique: number; solde_constate: number; ecart: number;
  note: string | null; cree_par_nom: string | null;
}
interface PointReseau {
  point_id: string; nom: string; ville: string; devise: string; solde_especes: number; solde_mobile: number;
  operations_en_attente: number; rapproche_at: string | null; ecart_non_nul: boolean;
}
type TypeOperation = 'versement_siege' | 'approvisionnement' | 'ajustement';

const LIBELLE_TYPE: Record<string, string> = {
  encaissement_expediteur: 'Encaissement', paiement_voyageur: 'Paiement voyageur', remboursement_expediteur: 'Remboursement',
  versement_siege: 'Versement au siège', approvisionnement: 'Approvisionnement', ajustement: 'Ajustement', contrepassation: 'Contre-passation',
};
const LIBELLE_MOYEN: Record<string, string> = { ...LABEL_OPERATEUR, especes: 'Espèces', autre_mobile: 'Mobile money', virement: 'Virement' };
const COULEUR_MOYEN = (m: string) => (m === 'especes' ? '#1D9E75' : COULEUR_OPERATEUR[m as Operateur] ?? '#8A879E');
const OPERABLE = ['versement_siege', 'approvisionnement', 'ajustement'];

// reseauSeul : vue « Tous les points » de la finance (une ligne par point, total du reseau) ; onChoisirPoint ouvre le detail d'un point.
export function CaisseSection({ point, finance, reseauSeul = false, onChoisirPoint }: {
  point: PointRelais; finance: boolean; reseauSeul?: boolean; onChoisirPoint?: (id: string) => void;
}) {
  const [caisse, setCaisse] = useState<Caisse | null>(null);
  const [mouvements, setMouvements] = useState<Mouvement[] | null>(null);
  const [rapprochements, setRapprochements] = useState<Rapprochement[]>([]);
  const [reseau, setReseau] = useState<PointReseau[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [declarer, setDeclarer] = useState<TypeOperation | null>(null);
  const [rapprocher, setRapprocher] = useState<Solde | null>(null);
  const [refuser, setRefuser] = useState<Attente | null>(null);
  const [contrepasser, setContrepasser] = useState<Mouvement | null>(null);
  const [etat, setEtat] = useState<{ cloturee: boolean; a_bouge: boolean } | null>(null);
  const [cloturer, setCloturer] = useState(false);
  const [regularisations, setRegularisations] = useState<Record<number, { par_nom: string | null; at: string; motif: string }>>({});
  const [aRegulariser, setARegulariser] = useState<Rapprochement | null>(null);

  function charger() {
    if (reseauSeul) {
      supabase.rpc('admin_pr_caisses_reseau').then(({ data, error: e }) => { if (e) setError(e.message); else setReseau((data ?? []) as PointReseau[]); });
      return;
    }
    supabase.rpc('admin_pr_caisse', { p_point_id: point.id }).then(({ data, error: e }) => {
      if (e) { setError(e.message); return; }
      setCaisse(data as Caisse);
    });
    supabase.rpc('admin_pr_mouvements', { p_point_id: point.id, p_limite: 300 }).then(({ data }) => setMouvements((data ?? []) as Mouvement[]));
    supabase.rpc('admin_pr_rapprochements', { p_point_id: point.id }).then(({ data }) => setRapprochements((data ?? []) as Rapprochement[]));
    supabase.rpc('admin_pr_regularisations', { p_point_id: point.id }).then(({ data }) => setRegularisations(Object.fromEntries(((data ?? []) as { rapprochement_id: number; par_nom: string | null; at: string; motif: string }[]).map((x) => [x.rapprochement_id, x]))));
    supabase.rpc('admin_pr_cloture_etat', { p_point_id: point.id }).then(({ data }) => setEtat(((data ?? [])[0] ?? null) as { cloturee: boolean; a_bouge: boolean } | null));
  }
  useEffect(() => { setCaisse(null); setMouvements(null); charger(); }, [point.id, reseauSeul]); // eslint-disable-line react-hooks/exhaustive-deps
  useTauxEuros([point.devise, ...(reseau ?? []).map((r) => r.devise)]); // taux du serveur pour l'équivalent en euros

  async function valider(a: Attente) {
    setError(null);
    const { error: e } = await supabase.rpc('admin_pr_decider_operation', { p_operation_id: a.id, p_valider: true, p_motif: null });
    if (e) { setError(e.message); return; }
    setMessage(`${LIBELLE_TYPE[a.type]} de ${montantLocal(a.montant_local, caisse?.devise ?? point.devise)} validé : inscrit dans l'historique de la caisse.`);
    charger();
  }

  const total = useMemo(() => (caisse?.soldes ?? []).reduce((s, x) => s + Number(x.solde), 0), [caisse]);
  const devise = caisse?.devise ?? point.devise;

  const colonnes: Column<Mouvement>[] = [
    { key: 'date', label: 'Date', value: (m) => m.created_at, render: (m) => dateCourte(m.created_at), width: 150, filter: 'date' },
    { key: 'type', label: 'Opération', value: (m) => LIBELLE_TYPE[m.type] ?? m.type, filter: 'options',
      render: (m) => <>{LIBELLE_TYPE[m.type] ?? m.type}{m.demande_ref ? <span className="hint"> · #{m.demande_ref}</span> : null}{m.contrepasse ? <> <Badge tone="muted">contre-passé</Badge></> : null}</> },
    { key: 'moyen', label: 'Poche', value: (m) => LIBELLE_MOYEN[m.moyen] ?? m.moyen, filter: 'options', width: 130 },
    { key: 'montant', label: 'Montant', value: (m) => m.sens * Number(m.montant_local), width: 140,
      render: (m) => <strong style={{ color: m.sens < 0 ? 'var(--badge-danger-fg)' : 'var(--badge-green-fg)' }}>{m.sens < 0 ? '−' : '+'} {montantLocal(m.montant_local, m.devise)}</strong> },
    { key: 'ref', label: 'Référence / motif', value: (m) => `${m.reference ?? ''} ${m.motif ?? ''}`,
      render: (m) => <span className="hint">{[m.reference, m.motif].filter(Boolean).join(' · ') || '-'}</span> },
    { key: 'par', label: 'Par', value: (m) => m.cree_par_nom ?? '', width: 140 },
    ...(finance ? [{
      key: 'actions', label: '', width: 130,
      render: (m: Mouvement) => (OPERABLE.includes(m.type) && !m.contrepasse
        ? <button className="btn btn-soft btn-sm" onClick={() => { setMessage(null); setContrepasser(m); }}>Contre-passer</button> : null),
    }] : []),
  ];

  return (
    <div>
      {reseauSeul && (
        <>
          {error && <p className="page-error">{error}</p>}
          {!reseau ? <p className="loading-state">Chargement…</p> : <ReseauCaisse reseau={reseau} onChoisir={onChoisirPoint} />}
        </>
      )}
      {reseauSeul ? null : <>
      <div className="pr-entete">
        <div>
          <h3>Caisse · {point.nom}<InfoBulle>Argent détenu par le point, poche par poche. Toute opération est déclarée par une personne et validée par une autre ; l'historique ne se modifie jamais.</InfoBulle></h3>
        </div>
        <div className="pr-total pr-total--ligne"><span>Total détenu</span><strong>{montantLocal(total, devise)}</strong>{!!equivalentEuros(total, devise) && <small className="pr-equiv">{equivalentEuros(total, devise)}</small>}</div>
      </div>

      {message && <p className="success-text" style={{ marginBottom: 12 }}>{message}</p>}
      {error && <p className="page-error">{error}</p>}

      <div className="ca-actions">
        <button className="btn btn-primary btn-sm" onClick={() => { setMessage(null); setCloturer(true); }} disabled={!caisse}>Clôturer la journée</button>
        {etat && (
          etat.cloturee ? <Badge tone="green">Clôturée aujourd'hui</Badge>
            : etat.a_bouge ? <Badge tone="amber">À clôturer</Badge>
            : null
        )}
        <span className="ca-sep" aria-hidden="true" />
        <button className="btn btn-soft btn-sm" onClick={() => { setMessage(null); setDeclarer('versement_siege'); }}>Versement au siège</button>
        {finance && <button className="btn btn-soft btn-sm" onClick={() => { setMessage(null); setDeclarer('approvisionnement'); }}>Approvisionner</button>}
        <button className="btn btn-soft btn-sm" onClick={() => { setMessage(null); setDeclarer('ajustement'); }}>Déclarer un écart</button>
      </div>

      {!caisse ? <p className="loading-state">Chargement…</p> : (
        <div className="ca-poches">
          {caisse.soldes.map((s) => {
            const plafond = s.moyen === 'especes' && caisse.plafond_especes ? Number(caisse.plafond_especes) : null;
            const ecart = s.dernier_ecart != null && Number(s.dernier_ecart) !== 0;
            return (
              <article key={s.moyen} className="ca-poche">
                <div className="ca-poche-haut">
                  <span className="pr-poche"><LogoOperateur operateur={s.moyen} couleur={COULEUR_MOYEN(s.moyen)} />{LIBELLE_MOYEN[s.moyen] ?? s.moyen}</span>
                  {ecart ? <Badge tone="danger">Écart {montantLocal(s.dernier_ecart, devise)}</Badge>
                    : s.rapproche_at ? <Badge tone="green">Compté</Badge> : <Badge tone="muted">Jamais compté</Badge>}
                </div>
                <strong className="ca-poche-montant">{montantLocal(s.solde, devise)}</strong>
                {plafond && (
                  <div className="pr-jauge" title={`Plafond d'espèces : ${montantLocal(plafond, devise)}`}>
                    <span style={{ width: `${Math.min(100, (Number(s.solde) / plafond) * 100)}%` }} className={Number(s.solde) > plafond * 0.8 ? 'haut' : ''} />
                  </div>
                )}
                <div className="ca-poche-bas">
                  <small>{s.rapproche_at ? `Dernier comptage : ${dateCourte(s.rapproche_at)}` : 'Aucun comptage'}</small>
                  <button type="button" className="ca-lien" onClick={() => { setMessage(null); setRapprocher(s); }}>Compter</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {caisse && caisse.attente.length > 0 && (
        <>
          <div className="pr-entete" style={{ marginTop: 24 }}><div><h3>À valider<InfoBulle>Opérations déclarées, pas encore dans l'historique.</InfoBulle></h3></div></div>
          <div className="pr-table">
            {caisse.attente.map((a) => (
              <div key={a.id} className="pr-table-ligne pr-table-ligne--attente">
                <span>{LIBELLE_TYPE[a.type]}</span>
                <span className="hint">{LIBELLE_MOYEN[a.moyen] ?? a.moyen}{a.reference ? ` · ${a.reference}` : ''}{a.motif ? ` · ${a.motif}` : ''}</span>
                <strong>{a.sens < 0 ? '−' : '+'} {montantLocal(a.montant_local, devise)}</strong>
                <span className="hint">{a.cree_par_nom ?? '-'} · {dateCourte(a.created_at)}</span>
                {a.de_moi
                  ? <span className="hint">Votre déclaration : une autre personne la valide</span>
                  : (
                    <div className="action-row">
                      <button className="btn btn-primary btn-sm" onClick={() => valider(a)}>Valider</button>
                      <button className="btn btn-sm" onClick={() => { setMessage(null); setRefuser(a); }}>Refuser</button>
                    </div>
                  )}
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: 24 }}>
        {!mouvements ? <p className="loading-state">Chargement de l'historique…</p> : (
          <DataTable rows={mouvements} columns={colonnes} rowKey={(m) => String(m.id)} title="Historique de la caisse" integre
            emptyText="Aucun mouvement." initialSort={{ key: 'date', dir: 'desc' }} pageSize={15} />
        )}
      </div>

      {rapprochements.length > 0 && (
        <>
          <div className="pr-entete" style={{ marginTop: 24 }}><div><h3>Comptages</h3></div></div>
          <div className="pr-table">
            {rapprochements.slice(0, 20).map((r) => {
              const regul = regularisations[r.id];
              const dernier = rapprochements.find((x) => x.moyen === r.moyen)?.id === r.id; // la liste est du plus recent au plus ancien
              return (
                <div key={r.id} className="pr-table-ligne pr-table-ligne--attente">
                  <span>{dateCourte(r.created_at)}</span>
                  <span>{LIBELLE_MOYEN[r.moyen] ?? r.moyen}</span>
                  <span className="hint">Calculé {montantLocal(r.solde_theorique, devise)} · compté {montantLocal(r.solde_constate, devise)}</span>
                  {Number(r.ecart) === 0 ? <Badge tone="green">Juste</Badge>
                    : regul ? <Badge tone="teal">Écart régularisé</Badge>
                    : <Badge tone="danger">Écart {Number(r.ecart) > 0 ? '+' : ''}{montantLocal(r.ecart, devise)}</Badge>}
                  <span className="hint">
                    {regul ? `Régularisé par ${regul.par_nom ?? '-'} · ${dateCourte(regul.at)} · ${regul.motif}` : `${r.cree_par_nom ?? '-'}${r.note ? ` · ${r.note}` : ''}`}
                  </span>
                  {finance && Number(r.ecart) !== 0 && !regul && dernier && (
                    <button className="pr-paie-btn pr-paie-btn--stripe" onClick={() => { setMessage(null); setARegulariser(r); }}>Régulariser</button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      </>}

      {aRegulariser && (
        <RegulariserModal r={aRegulariser} devise={devise} onClose={() => setARegulariser(null)}
          onFait={(t) => { setARegulariser(null); setMessage(t); charger(); }} />
      )}
      {cloturer && caisse && (
        <ClotureModal point={point} soldes={caisse.soldes} devise={devise} onClose={() => setCloturer(false)}
          onFait={(t) => { setCloturer(false); setMessage(t); charger(); }} />
      )}
      {declarer && caisse && (
        <DeclarerModal point={point} type={declarer} soldes={caisse.soldes} devise={devise} onClose={() => setDeclarer(null)}
          onFait={(t) => { setDeclarer(null); setMessage(t); charger(); }} />
      )}
      {rapprocher && (
        <RapprocherModal point={point} solde={rapprocher} devise={devise} onClose={() => setRapprocher(null)}
          onFait={(t) => { setRapprocher(null); setMessage(t); charger(); }} />
      )}
      {refuser && (
        <MotifModal titre={`Refuser : ${LIBELLE_TYPE[refuser.type]} de ${montantLocal(refuser.montant_local, devise)}`} libelle="Motif du refus" min={5}
          onClose={() => setRefuser(null)}
          onValider={async (motif) => {
            const { error: e } = await supabase.rpc('admin_pr_decider_operation', { p_operation_id: refuser.id, p_valider: false, p_motif: motif });
            if (e) return e.message;
            setRefuser(null); setMessage('Opération refusée : rien n\'est inscrit dans l\'historique.'); charger(); return null;
          }} />
      )}
      {contrepasser && (
        <MotifModal titre={`Contre-passer : ${LIBELLE_TYPE[contrepasser.type]} de ${montantLocal(contrepasser.montant_local, contrepasser.devise)}`}
          libelle="Pourquoi ce mouvement est-il erroné ?" min={10}
          aide="Un mouvement inverse est inscrit ; le mouvement d'origine reste visible dans l'historique."
          onClose={() => setContrepasser(null)}
          onValider={async (motif) => {
            const { error: e } = await supabase.rpc('admin_pr_contrepasser', { p_mouvement_id: contrepasser.id, p_motif: motif });
            if (e) return e.message;
            setContrepasser(null); setMessage('Mouvement contre-passé.'); charger(); return null;
          }} />
      )}
    </div>
  );
}

function DeclarerModal({ point, type, soldes, devise, onClose, onFait }: {
  point: PointRelais; type: TypeOperation; soldes: Solde[]; devise: string; onClose: () => void; onFait: (t: string) => void;
}) {
  const poches = soldes.map((s) => s.moyen);
  const [moyen, setMoyen] = useState(poches.includes('especes') ? 'especes' : poches[0] ?? 'especes');
  const [montant, setMontant] = useState('');
  const [sens, setSens] = useState<1 | -1>(-1);
  const [reference, setReference] = useState('');
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const montantNum = Number(montant.replace(/\s/g, ''));
  const solde = Number(soldes.find((s) => s.moyen === moyen)?.solde ?? 0);
  const sortie = type === 'versement_siege' || (type === 'ajustement' && sens === -1);
  const montantOk = Number.isInteger(montantNum) && montantNum > 0 && (!sortie || montantNum <= solde);
  const refOk = type === 'ajustement' || moyen === 'especes' || reference.trim().length >= 4;
  const motifOk = type !== 'ajustement' || motif.trim().length >= 10;
  const titres: Record<TypeOperation, string> = {
    versement_siege: 'Versement au siège', approvisionnement: 'Approvisionner le point', ajustement: 'Déclarer un écart',
  };
  const aides: Record<TypeOperation, string> = {
    versement_siege: 'Vous remettez de l\'argent du point au siège Wonjo. Il entre dans l\'historique quand la finance confirme l\'avoir reçu.',
    approvisionnement: 'Le siège envoie de l\'argent au point. Il entre dans l\'historique quand un agent du point confirme l\'avoir reçu.',
    ajustement: 'Un écart entre ce que dit l\'historique de la caisse et ce que vous avez réellement (billet faux, erreur de rendu…). La finance le valide.',
  };

  async function envoyer() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc('admin_pr_declarer_operation', {
      p_point_id: point.id, p_type: type, p_moyen: moyen, p_montant: montantNum, p_sens: type === 'ajustement' ? sens : type === 'versement_siege' ? -1 : 1,
      p_reference: reference.trim(), p_motif: motif.trim(),
    });
    setBusy(false);
    if (e) { setError(e.message); return; }
    onFait(`${titres[type]} de ${montantLocal(montantNum, devise)} déclaré : en attente de validation par une autre personne.`);
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="modal-title">{titres[type]}</h2>
      <div className="modal-body">
        <p className="hint">{aides[type]}</p>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <div>
            <strong style={{ fontSize: 13 }}>Poche</strong>
            <div className="moyens" role="radiogroup" aria-label="Poche">
              {poches.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={moyen === m} className={`moyen-pill ${moyen === m ? 'on' : ''}`} onClick={() => setMoyen(m)}>
                  <LogoOperateur operateur={m} couleur={COULEUR_MOYEN(m)} />
                  <span className="moyen-texte"><strong>{LIBELLE_MOYEN[m] ?? m}</strong><small>Solde {montantLocal(soldes.find((s) => s.moyen === m)?.solde, devise)}</small></span>
                </button>
              ))}
            </div>
          </div>
          {type === 'ajustement' && (
            <div className="action-row">
              <button type="button" className={`chip-filter ${sens === -1 ? 'on' : ''}`} onClick={() => setSens(-1)}>Il manque de l'argent</button>
              <button type="button" className={`chip-filter ${sens === 1 ? 'on' : ''}`} onClick={() => setSens(1)}>Il y a de l'argent en trop</button>
            </div>
          )}
          <label>Montant ({libelleDevise(devise)})
            <ChampMontant valeur={montant} onChange={setMontant} unite={libelleDevise(devise)} invalide={!!montant && !montantOk} autoFocus ariaLabel="Montant" />
            {montant && sortie && montantNum > solde && <span className="hint" style={{ color: 'var(--badge-danger-fg)' }}>Au plus {montantLocal(solde, devise)} dans cette poche.</span>}
          </label>
          {type !== 'ajustement' && (
            <label>{moyen === 'especes' ? 'Numéro du bordereau ou du reçu (facultatif)' : 'Référence du transfert (SMS de l\'opérateur)'}
              <input type="text" value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} />
            </label>
          )}
          <label>{type === 'ajustement' ? 'Ce qui s\'est passé (obligatoire)' : 'Note (facultatif)'}
            <textarea rows={2} maxLength={300} value={motif} onChange={(e) => setMotif(e.target.value)} />
          </label>
        </div>
        {error && <p className="page-error" style={{ marginTop: 12 }}>{error}</p>}
        <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn" onClick={onClose} disabled={busy}>Annuler</button>
          <button className="btn btn-primary" onClick={envoyer} disabled={busy || !montantOk || !refOk || !motifOk}>{busy ? 'Envoi…' : 'Déclarer'}</button>
        </div>
      </div>
    </Modal>
  );
}

function RapprocherModal({ point, solde, devise, onClose, onFait }: {
  point: PointRelais; solde: Solde; devise: string; onClose: () => void; onFait: (t: string) => void;
}) {
  // Comptage a l'aveugle : l'ecart n'est revele qu'apres l'envoi, pour qu'on ne puisse pas « ajuster » son comptage.
  const [constate, setConstate] = useState('');
  const [note, setNote] = useState('');
  const [ecartSignale, setEcartSignale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = Number(constate.replace(/\s/g, ''));
  const saisi = constate.trim() !== '' && Number.isFinite(n) && n >= 0;

  async function envoyer() {
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc('admin_pr_rapprocher', { p_point_id: point.id, p_moyen: solde.moyen, p_solde_constate: n, p_note: note.trim() });
    setBusy(false);
    if (e) {
      if (e.message.includes('Ecart constate')) { setEcartSignale(true); return; }
      setError(e.message);
      return;
    }
    const r = data as { ecart: number };
    onFait(Number(r.ecart) === 0 ? 'Rapprochement juste : la caisse correspond à l\'historique.'
      : `Rapprochement enregistré avec un écart de ${montantLocal(r.ecart, devise)} : il est visible par la finance.`);
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="modal-title">Rapprocher · {LIBELLE_MOYEN[solde.moyen] ?? solde.moyen}</h2>
      <div className="modal-body">
        <p className="hint">{solde.moyen === 'especes' ? 'Comptez les espèces présentes dans la caisse.' : 'Relevez le solde affiché par l\'application de l\'opérateur.'} Saisissez ce que vous constatez réellement.</p>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <label>Solde constaté ({libelleDevise(devise)})
            {ecartSignale
              ? <input type="text" value={constate} disabled />
              : <ChampMontant valeur={constate} onChange={setConstate} unite={libelleDevise(devise)} autoFocus ariaLabel="Solde constaté" />}
          </label>
          {ecartSignale && (
            <>
              <p className="page-error">Votre comptage ne correspond pas à l'historique de la caisse. Recomptez si besoin, puis expliquez ce qui s'est passé : l'écart sera enregistré et visible par la finance.</p>
              <label>Ce qui s'est passé (obligatoire)
                <textarea rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
              </label>
              <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => { setEcartSignale(false); setNote(''); }}>Recompter</button>
            </>
          )}
        </div>
        {error && <p className="page-error" style={{ marginTop: 12 }}>{error}</p>}
        <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn" onClick={onClose} disabled={busy}>Annuler</button>
          <button className="btn btn-primary" onClick={envoyer} disabled={busy || !saisi || (ecartSignale && note.trim().length < 10)}>{busy ? 'Envoi…' : 'Enregistrer'}</button>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>Un écart n'efface rien : il se corrige par un ajustement validé par la finance.</p>
      </div>
    </Modal>
  );
}

function MotifModal({ titre, libelle, aide, min, onClose, onValider }: {
  titre: string; libelle: string; aide?: string; min: number; onClose: () => void; onValider: (motif: string) => Promise<string | null>;
}) {
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal onClose={onClose}>
      <h2 className="modal-title">{titre}</h2>
      <div className="modal-body">
        {aide && <p className="hint">{aide}</p>}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, fontWeight: 700, fontSize: 13 }}>{libelle}
          <textarea rows={3} maxLength={300} value={motif} onChange={(e) => setMotif(e.target.value)} autoFocus />
        </label>
        {error && <p className="page-error" style={{ marginTop: 12 }}>{error}</p>}
        <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn" onClick={onClose} disabled={busy}>Annuler</button>
          <button className="btn btn-primary" disabled={busy || motif.trim().length < min}
                  onClick={async () => { setBusy(true); setError(null); const e = await onValider(motif.trim()); setBusy(false); if (e) setError(e); }}>
            {busy ? 'Envoi…' : 'Confirmer'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Vue « Tous les points » : une ligne par point (espèces, mobile money, total), chacun dans sa monnaie ou tout en euros pour comparer,
// et le total du réseau en euros. Les poches, l'historique et les rapprochements restent dans la monnaie du point (argent réellement compté).
function versEuros(v: number, devise: string): number | null {
  if (devise === 'EUR') return v;
  const t = tauxDe(devise);
  return t == null ? null : Math.round((v / t) * 100) / 100;
}

function ReseauCaisse({ reseau, onChoisir }: { reseau: PointReseau[]; onChoisir?: (id: string) => void }) {
  const [unite, setUnite] = useState<Unite>('local');
  useTauxEuros(reseau.map((r) => r.devise));
  const montant = (v: number, devise: string) => {
    if (unite === 'local') return montantLocal(v, devise);
    const e = versEuros(v, devise);
    return e == null ? 'taux ?' : montantEuros(e);
  };
  const lignes = reseau.map((r) => ({ ...r, esp: Number(r.solde_especes), mob: Number(r.solde_mobile) }));
  const connues = lignes.filter((l) => versEuros(l.esp + l.mob, l.devise) != null);
  const totalEur = connues.reduce((a, l) => a + (versEuros(l.esp + l.mob, l.devise) ?? 0), 0);
  const aValider = lignes.reduce((a, l) => a + l.operations_en_attente, 0);

  if (reseau.length === 0) return <p className="empty-state">Aucun point relais.</p>;
  return (
    <div>
      <div className="pr-reseau-tete">
        <h3>Caisses du réseau</h3>
        {lignes.some((l) => l.ecart_non_nul) && <Badge tone="danger">{lignes.filter((l) => l.ecart_non_nul).length} écart{lignes.filter((l) => l.ecart_non_nul).length > 1 ? 's' : ''} à régulariser</Badge>}
        <div className="pr-total pr-total--ligne"><span>Total détenu</span><strong>{montantEuros(Math.round(totalEur * 100) / 100)}</strong>
          <small className="pr-equiv">{connues.length < lignes.length ? `${lignes.length - connues.length} point(s) sans taux, non comptés` : `${lignes.length} point${lignes.length > 1 ? 's' : ''}${aValider ? ` · ${aValider} à valider` : ''}`}</small>
        </div>
        <BasculeUnite valeur={unite} onChange={setUnite} libelleLocal="Monnaie du point" ariaLabel="Unité de la vue du réseau" />
      </div>
      <div className="pr-reseau-tableau" role="table">
        <div className="pr-reseau-rang pr-reseau-rang--tete" role="row">
          <span>Point</span><span>Espèces</span><span>Mobile money</span><span>Total</span><span>À valider</span><span>Comptage</span><span />
        </div>
        {lignes.map((l) => (
          <div key={l.point_id} className="pr-reseau-rang pr-reseau-rang--ligne" role="row" onClick={() => onChoisir?.(l.point_id)}>
            <span className="pr-reseau-nom"><strong>{l.nom}</strong></span>
            <span>{montant(l.esp, l.devise)}</span>
            <span>{montant(l.mob, l.devise)}</span>
            <strong>{montant(l.esp + l.mob, l.devise)}</strong>
            <span className="hint">{l.operations_en_attente ? `${l.operations_en_attente} à valider` : '-'}</span>
            <span>{l.ecart_non_nul ? <Badge tone="danger">Écart</Badge> : l.rapproche_at ? <Badge tone="green">Rapproché</Badge> : <Badge tone="muted">Jamais</Badge>}</span>
            <button type="button" className="pr-paie-btn pr-paie-btn--autre" onClick={(e) => { e.stopPropagation(); onChoisir?.(l.point_id); }} title="Ouvrir la caisse de ce point">Détail ›</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Clôture de la journée (449) : on compte TOUTES les poches d'un coup, à l'aveugle. Un écart n'est révélé (par poche, jamais de combien) qu'après
// l'envoi ; rien n'est enregistré tant qu'il n'est pas expliqué.
function ClotureModal({ point, soldes, devise, onClose, onFait }: {
  point: PointRelais; soldes: Solde[]; devise: string; onClose: () => void; onFait: (t: string) => void;
}) {
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [ecartPoches, setEcartPoches] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nombre = (m: string) => Number((valeurs[m] ?? '').replace(/\s/g, ''));
  const saisi = (m: string) => (valeurs[m] ?? '').trim() !== '' && Number.isFinite(nombre(m)) && nombre(m) >= 0;
  const complet = soldes.every((x) => saisi(x.moyen));

  async function envoyer() {
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc('admin_pr_cloturer', {
      p_point_id: point.id, p_comptages: soldes.map((x) => ({ moyen: x.moyen, solde: nombre(x.moyen) })), p_note: note.trim(),
    });
    setBusy(false);
    if (e) { setError(e.message); return; }
    const r = data as { ok: boolean; ecart?: boolean; moyens?: string[]; ecarts?: number };
    if (!r.ok) { setEcartPoches(r.moyens ?? []); return; }
    onFait(r.ecarts ? `Journée clôturée avec ${r.ecarts} écart${r.ecarts > 1 ? 's' : ''} : visible${r.ecarts > 1 ? 's' : ''} par la finance.` : 'Journée clôturée : la caisse correspond à l\'historique.');
  }

  const comptees = soldes.filter((x) => saisi(x.moyen)).length;
  const date = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <Modal onClose={onClose} narrow>
      <div className="cl-tete">
        <span className="cl-pastille" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 11h18M9 16l2 2 4-4" /></svg>
        </span>
        <div>
          <h2>Clôturer la journée</h2>
          <p>{point.nom} · {date}</p>
        </div>
      </div>
      <div className="modal-body" style={{ gap: 10, paddingTop: 12 }}>
        <p className="cl-aide">Comptez chaque poche : les espèces dans la caisse, et le solde affiché dans l'application de chaque opérateur.</p>
        <div className="cl-liste">
          {soldes.map((x) => {
            const fait = saisi(x.moyen);
            const ecart = ecartPoches?.includes(x.moyen);
            return (
              <label key={x.moyen} className={`cl-ligne ${fait ? 'fait' : ''} ${ecart ? 'ecart' : ''}`}>
                <span className="cl-nom">
                  <LogoOperateur operateur={x.moyen} couleur={COULEUR_MOYEN(x.moyen)} />
                  <strong>{LIBELLE_MOYEN[x.moyen] ?? x.moyen}</strong>
                  {ecart && <Badge tone="danger">À vérifier</Badge>}
                </span>
                <ChampMontant valeur={valeurs[x.moyen] ?? ''} onChange={(v) => setValeurs((o) => ({ ...o, [x.moyen]: v }))} unite={libelleDevise(devise)}
                              ariaLabel={`Solde constaté ${LIBELLE_MOYEN[x.moyen] ?? x.moyen}`} autoFocus={x === soldes[0]} placeholder="0" />
              </label>
            );
          })}
        </div>
        {ecartPoches !== null && (
          <div className="cl-ecart">
            <p><strong>Ça ne correspond pas à l'historique</strong> pour {ecartPoches.map((m) => LIBELLE_MOYEN[m] ?? m).join(', ')}. Recomptez si besoin, puis expliquez ce qui s'est passé : l'écart sera enregistré et visible par la finance.</p>
            <textarea rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ce qui s'est passé (obligatoire, 10 caractères au moins)" autoFocus />
            <button type="button" className="ca-lien" onClick={() => { setEcartPoches(null); setNote(''); }}>Recompter</button>
          </div>
        )}
        {error && <p className="page-error">{error}</p>}
        <div className="cl-pied">
          <span className="cl-progres" title={`${comptees} poche${comptees > 1 ? 's' : ''} sur ${soldes.length}`}>
            <span className="cl-barre"><span style={{ width: `${soldes.length ? (comptees / soldes.length) * 100 : 0}%` }} /></span>
            <small>{comptees}/{soldes.length} comptée{comptees > 1 ? 's' : ''}</small>
          </span>
          <button className="btn" onClick={onClose} disabled={busy}>Annuler</button>
          <button className="btn btn-primary" onClick={envoyer} disabled={busy || !complet || (ecartPoches !== null && note.trim().length < 10)}>
            {busy ? 'Envoi…' : ecartPoches !== null ? 'Clôturer avec cette explication' : 'Clôturer'}
          </button>
        </div>
        <p className="cl-aide cl-aide--bas">Un écart n'efface rien : il se corrige par un ajustement validé par la finance.</p>
      </div>
    </Modal>
  );
}

// Régulariser un écart (451) : la finance ou un Admin remet l'historique d'accord avec le comptage. Le montant et le sens viennent de l'écart.
function RegulariserModal({ r, devise, onClose, onFait }: { r: Rapprochement; devise: string; onClose: () => void; onFait: (t: string) => void }) {
  const [motif, setMotif] = useState(r.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ecart = Number(r.ecart);
  const manque = ecart < 0;

  async function valider() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc('admin_pr_regulariser', { p_rapprochement_id: r.id, p_motif: motif.trim() });
    setBusy(false);
    if (e) { setError(e.message); return; }
    onFait(`Écart régularisé : ${LIBELLE_MOYEN[r.moyen] ?? r.moyen} ${manque ? 'diminué' : 'augmenté'} de ${montantLocal(Math.abs(ecart), devise)}. L'historique correspond au comptage.`);
  }

  return (
    <Modal onClose={onClose} narrow>
      <div className="cl-tete">
        <span className="cl-pastille" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </span>
        <div>
          <h2>Régulariser l'écart</h2>
          <p style={{ textTransform: 'none' }}>{LIBELLE_MOYEN[r.moyen] ?? r.moyen} · comptage du {dateCourte(r.created_at)}</p>
        </div>
      </div>
      <div className="modal-body" style={{ gap: 10, paddingTop: 12 }}>
        <div className="rg-chiffres">
          <div><small>Historique</small><strong>{montantLocal(r.solde_theorique, devise)}</strong></div>
          <div><small>Compté</small><strong>{montantLocal(r.solde_constate, devise)}</strong></div>
          <div className={manque ? 'rg-manque' : 'rg-surplus'}><small>{manque ? 'Il manquait' : 'En trop'}</small><strong>{montantLocal(Math.abs(ecart), devise)}</strong></div>
        </div>
        <p className="cl-aide">Un ajustement de <strong>{montantLocal(Math.abs(ecart), devise)}</strong> sera {manque ? 'retiré de' : 'ajouté à'} l'historique de la poche pour qu'il corresponde au comptage. Rien d'autre ne change et l'opération reste visible, avec votre nom.</p>
        <label className="cl-motif">Motif (obligatoire)
          <textarea rows={2} maxLength={300} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ce qui explique l'écart, comme vous l'avez constaté" />
        </label>
        {error && <p className="page-error">{error}</p>}
        <div className="cl-pied">
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={onClose} disabled={busy}>Annuler</button>
          <button className="btn btn-primary" onClick={valider} disabled={busy || motif.trim().length < 10}>{busy ? 'Enregistrement…' : 'Régulariser'}</button>
        </div>
      </div>
    </Modal>
  );
}

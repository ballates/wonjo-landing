import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Badge } from '../components/Badge';
import { DataTable, type Column } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { TransactionModal } from '../components/TransactionModal';
import { useFicheCompte } from '../components/FicheCompte';
import { dateHeure } from '../lib/labels';
import {
  LABELS_GRAVITE, TONS_GRAVITE, causeSignal, cibleSignal, ficheSignal, phraseCourte, resumeSignal, titreSignal, type SignalSecurite,
} from '../lib/securite';

type Vue = 'ouverts' | 'traites';

interface Decompte { alerte: number; a_verifier: number; a_surveiller: number }

export function SecuritePage({ integre = false }: { integre?: boolean }) {
  const [vue, setVue] = useState<Vue>('ouverts');
  const [signaux, setSignaux] = useState<SignalSecurite[] | null>(null);
  const [decompte, setDecompte] = useState<Decompte | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [courant, setCourant] = useState<SignalSecurite | null>(null);
  const [transaction, setTransaction] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [retrait, setRetrait] = useState(false);
  const { ouvrir, modal } = useFicheCompte();

  const charger = useCallback(() => {
    setSignaux(null);
    setError(null);
    setSelection(new Set());
    supabase.rpc('admin_lister_signaux_securite', { p_traites: vue === 'traites' }).then(({ data, error: e }) => {
      if (e) { setError(e.message); return; }
      setSignaux((data ?? []) as SignalSecurite[]);
    });
    supabase.rpc('admin_nb_signaux_securite').then(({ data }) => setDecompte((data ?? null) as Decompte | null));
  }, [vue]);

  useEffect(() => { charger(); }, [charger]);

  async function retirerSelection() {
    setRetrait(true);
    const { error: e } = await supabase.rpc('admin_masquer_signaux_securite', { p_ids: [...selection] });
    setRetrait(false);
    if (e) { setError(e.message); return; }
    charger();
  }

  function ouvrirCible(s: SignalSecurite) {
    const c = cibleSignal(s);
    if (!c) return;
    if (c.kind === 'compte') ouvrir(c.id);
    else setTransaction(c.id);
  }

  const colonnes: Column<SignalSecurite>[] = [
    {
      key: 'gravite', label: 'Niveau', filter: 'options', width: 120,
      value: (s) => LABELS_GRAVITE[s.gravite],
      render: (s) => <Badge tone={TONS_GRAVITE[s.gravite]}>{LABELS_GRAVITE[s.gravite]}</Badge>,
    },
    { key: 'date', label: 'Détecté', value: (s) => s.detecte_at, filter: 'date', width: 150, render: (s) => dateHeure(s.detecte_at) },
    {
      key: 'signal', label: 'Signal', value: (s) => `${titreSignal(s)} ${resumeSignal(s)}`,
      render: (s) => (
        <div className="signal-cell">
          <b>{titreSignal(s)}</b>
          <span>{resumeSignal(s)}</span>
        </div>
      ),
    },
    {
      key: 'cause', label: 'Cause', filter: 'options', width: 230,
      value: (s) => causeSignal(s).code,
      render: (s) => {
        const c = causeSignal(s);
        return (
          <div className="signal-cell">
            <span><Badge tone={c.ton}>{c.code}</Badge></span>
            <span>{c.raison}</span>
          </div>
        );
      },
    },
    ...(vue === 'traites' ? [
      {
        key: 'traite', label: 'Traité', width: 190, value: (s: SignalSecurite) => s.traite_at ?? '', filter: 'date' as const,
        render: (s: SignalSecurite) => (
          <div className="signal-cell">
            <b>{s.traite_par_nom ? `Par ${s.traite_par_nom}` : 'Refermé automatiquement'}</b>
            <span>{s.traite_at ? dateHeure(s.traite_at) : ''}</span>
          </div>
        ),
      } as Column<SignalSecurite>,
      {
        key: 'note', label: 'Note', value: (s: SignalSecurite) => s.note ?? '',
        render: (s: SignalSecurite) => s.note
          ? <span className="signal-note" title={s.note}>{s.note}</span>
          : <span className="hint">{s.traite_par_nom ? 'Aucune note' : 'La situation est revenue à la normale'}</span>,
      } as Column<SignalSecurite>,
    ] : []),
    {
      key: 'actions', label: '', width: 150,
      render: (s) => (
        <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          {cibleSignal(s) && <button className="btn btn-soft btn-sm" onClick={() => ouvrirCible(s)}>Ouvrir</button>}
          <button className="btn btn-soft btn-sm" onClick={() => setCourant(s)}>{vue === 'ouverts' ? 'Traiter' : 'Voir'}</button>
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          {!integre && <h1>Sécurité</h1>}
          <p className="page-sub" style={integre ? { margin: 0 } : undefined}>Relevés toutes les heures : une alerte veut dire qu'une règle semble contournée.</p>
        </div>
        <div className="role-pills">
          <button className={`role-pill ${vue === 'ouverts' ? 'is-on' : ''}`} onClick={() => setVue('ouverts')}>Ouverts</button>
          <button className={`role-pill ${vue === 'traites' ? 'is-on' : ''}`} onClick={() => setVue('traites')}>Historique</button>
        </div>
      </div>

      {decompte && vue === 'ouverts' && (
        <div className="cards">
          <div className="card"><span className="card-value">{decompte.alerte}</span><span className="card-label">Alertes à traiter</span></div>
          <div className="card"><span className="card-value">{decompte.a_verifier}</span><span className="card-label">À vérifier</span></div>
          <div className="card"><span className="card-value">{decompte.a_surveiller}</span><span className="card-label">À surveiller</span></div>
        </div>
      )}

      {error && <p className="page-error">{error}</p>}
      {!signaux && !error ? <p className="loading-state">Chargement…</p> : signaux && (
        <DataTable
          rows={signaux}
          columns={colonnes}
          rowKey={(s) => s.id}
          initialSort={{ key: 'date', dir: 'desc' }}
          pageSize={10}
          {...(vue === 'traites' ? { selected: selection, onSelectedChange: setSelection } : {})}
          emptyText={vue === 'ouverts' ? 'Aucun signal à traiter. Les contrôles n\'ont rien relevé.' : 'Aucun signal traité.'}
        />
      )}

      {vue === 'traites' && selection.size > 0 && (
        <div className="selection-bar">
          <span>{selection.size} signal(aux) sélectionné(s)</span>
          <div className="action-row">
            <button className="btn btn-sm" disabled={retrait} onClick={() => setSelection(new Set())}>Tout désélectionner</button>
            <button className="btn btn-danger btn-sm" disabled={retrait} onClick={retirerSelection}>
              {retrait ? '…' : 'Retirer de l\'historique'}
            </button>
          </div>
        </div>
      )}

      {courant && (
        <DetailSignal
          signal={courant}
          modifiable={vue === 'ouverts'}
          onClose={() => setCourant(null)}
          onTraite={() => {
            // Le decompte baisse tout de suite ; le rechargement le confirme.
            const g = courant.gravite;
            setDecompte((d) => d ? { ...d, [g]: Math.max(0, d[g] - 1) } : d);
            setSignaux((l) => l ? l.filter((x) => x.id !== courant.id) : l);
            setCourant(null);
            charger();
          }}
        />
      )}
      {transaction && <TransactionModal demandeId={transaction} onClose={() => setTransaction(null)} />}
      {modal}
    </div>
  );
}

function DetailSignal({ signal, modifiable, onClose, onTraite }: {
  signal: SignalSecurite; modifiable: boolean; onClose: () => void; onTraite: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const fiche = ficheSignal(signal.type);
  const cause = causeSignal(signal);
  const d = signal.details as { ajoutes?: string[]; retires?: string[] };
  const aDuTechnique = signal.type === 'droits_modifies' || Array.isArray(signal.details.chemins) || Array.isArray(signal.details.messages);

  async function traiter() {
    setBusy(true);
    setErreur(null);
    const { error } = await supabase.rpc('admin_traiter_signal_securite', { p_id: signal.id, p_note: note.trim() });
    setBusy(false);
    if (error) { setErreur(error.message); return; }
    onTraite();
  }

  return (
    <Modal onClose={onClose} wide>
      <div className="signal-modal">
        <div className="signal-modal-tete">
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Badge tone={TONS_GRAVITE[signal.gravite]}>{LABELS_GRAVITE[signal.gravite]}</Badge>
            <Badge tone={cause.ton}>{cause.code}</Badge>
          </span>
          <h2>{titreSignal(signal)}</h2>
          <p className="page-sub" style={{ margin: 0 }}>Détecté le {dateHeure(signal.detecte_at)}</p>
        </div>

        <div className="signal-modal-corps">
          <div className="signal-bloc signal-bloc--rouge">
            <b>Ce qui s'est passé</b>
            <span>{resumeSignal(signal)}</span>
            <span>{cause.raison}.</span>
          </div>

          {fiche.sens && (
            <div className="signal-bloc signal-bloc--ambre">
              <b>Ce que ça veut dire</b>
              <span>{phraseCourte(fiche.sens)}</span>
            </div>
          )}

          {fiche.conduite.length > 0 && (
            <div className="signal-bloc signal-bloc--vert">
              <b>Ce qu'il faut faire</b>
              <ol>
                {fiche.conduite.map((c) => <li key={c}>{c}</li>)}
              </ol>
            </div>
          )}

          {aDuTechnique && (
            <details className="signal-technique">
              <summary>Voir le détail technique</summary>
              {signal.type === 'droits_modifies' && (
                <>
                  {(d.ajoutes?.length ?? 0) > 0 && (
                    <><strong>Ajouté ou modifié</strong><pre>{d.ajoutes!.join('\n')}</pre></>
                  )}
                  {(d.retires?.length ?? 0) > 0 && (
                    <><strong>Retiré ou ancienne valeur</strong><pre>{d.retires!.join('\n')}</pre></>
                  )}
                </>
              )}
              {(Array.isArray(signal.details.chemins) || Array.isArray(signal.details.messages)) && (
                <>
                  <strong>{Array.isArray(signal.details.messages) ? 'Messages les plus fréquents' : 'Chemins refusés'}</strong>
                  <pre>
                    {Array.isArray(signal.details.messages)
                      ? (signal.details.messages as { message: string; n: number }[]).map((m) => `${m.n} × ${m.message}`).join('\n')
                      : (signal.details.chemins as string[]).join('\n')}
                  </pre>
                </>
              )}
            </details>
          )}

          {!modifiable && (
            <div className="signal-bloc">
              <b>Traité</b>
              <span>
                {signal.traite_at ? dateHeure(signal.traite_at) : '-'}
                {signal.traite_par_nom ? ` par ${signal.traite_par_nom}` : ', refermé automatiquement'}
              </span>
              {signal.note && <span>{signal.note}</span>}
            </div>
          )}
        </div>

        {modifiable ? (
          <div className="signal-modal-pied">
            <label htmlFor="note-signal"><strong>Note de traitement</strong> (obligatoire)</label>
            <textarea
              id="note-signal"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex. migrations 335 à 337 appliquées, changement attendu."
            />
            {erreur && <p className="page-error">{erreur}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-soft btn-sm" onClick={onClose}>Fermer</button>
              <button className="btn btn-primary btn-sm" disabled={busy || note.trim().length < 3} onClick={traiter}>
                {busy ? '…' : 'Marquer comme traité'}
              </button>
            </div>
          </div>
        ) : (
          <div className="signal-modal-pied">
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-soft btn-sm" onClick={onClose}>Fermer</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

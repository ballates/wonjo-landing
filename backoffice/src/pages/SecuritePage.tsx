import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Badge } from '../components/Badge';
import { DataTable, type Column } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { TransactionModal } from '../components/TransactionModal';
import { useFicheCompte } from '../components/FicheCompte';
import { dateHeure } from '../lib/labels';
import {
  LABELS_GRAVITE, TONS_GRAVITE, cibleSignal, ficheSignal, resumeSignal, titreSignal, type SignalSecurite,
} from '../lib/securite';

type Vue = 'ouverts' | 'traites';

interface Decompte { alerte: number; a_verifier: number; a_surveiller: number }

export function SecuritePage() {
  const [vue, setVue] = useState<Vue>('ouverts');
  const [signaux, setSignaux] = useState<SignalSecurite[] | null>(null);
  const [decompte, setDecompte] = useState<Decompte | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [courant, setCourant] = useState<SignalSecurite | null>(null);
  const [transaction, setTransaction] = useState<string | null>(null);
  const { ouvrir, modal } = useFicheCompte();

  const charger = useCallback(() => {
    setSignaux(null);
    setError(null);
    supabase.rpc('admin_lister_signaux_securite', { p_traites: vue === 'traites' }).then(({ data, error: e }) => {
      if (e) { setError(e.message); return; }
      setSignaux((data ?? []) as SignalSecurite[]);
    });
    supabase.rpc('admin_nb_signaux_securite').then(({ data }) => setDecompte((data ?? null) as Decompte | null));
  }, [vue]);

  useEffect(() => { charger(); }, [charger]);

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
          <h1>Sécurité</h1>
          <p className="page-sub">Relevés toutes les heures : une alerte veut dire qu'une règle semble contournée.</p>
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
          emptyText={vue === 'ouverts' ? 'Aucun signal à traiter. Les contrôles n\'ont rien relevé.' : 'Aucun signal traité.'}
        />
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
  const d = signal.details as { ajoutes?: string[]; retires?: string[] };

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
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <Badge tone={TONS_GRAVITE[signal.gravite]}>{LABELS_GRAVITE[signal.gravite]}</Badge>
          <h2 style={{ margin: '8px 0 2px' }}>{titreSignal(signal)}</h2>
          <p className="page-sub" style={{ margin: 0 }}>Détecté le {dateHeure(signal.detecte_at)} · {resumeSignal(signal)}</p>
        </div>

        {fiche.sens && (
          <div>
            <strong>Ce que ça veut dire</strong>
            <p style={{ margin: '4px 0 0' }}>{fiche.sens}</p>
          </div>
        )}

        {signal.type === 'droits_modifies' && (
          <div style={{ display: 'grid', gap: 10 }}>
            {(d.ajoutes?.length ?? 0) > 0 && (
              <div>
                <strong>Ajouté ou modifié</strong>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: '4px 0 0', maxHeight: 180, overflow: 'auto' }}>{d.ajoutes!.join('\n')}</pre>
              </div>
            )}
            {(d.retires?.length ?? 0) > 0 && (
              <div>
                <strong>Retiré ou ancienne valeur</strong>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: '4px 0 0', maxHeight: 180, overflow: 'auto' }}>{d.retires!.join('\n')}</pre>
              </div>
            )}
          </div>
        )}

        {(Array.isArray(signal.details.chemins) || Array.isArray(signal.details.messages)) && (
          <div>
            <strong>{Array.isArray(signal.details.messages) ? 'Messages les plus fréquents' : 'Chemins refusés'}</strong>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: '4px 0 0', maxHeight: 160, overflow: 'auto' }}>
              {Array.isArray(signal.details.messages)
                ? (signal.details.messages as { message: string; n: number }[]).map((m) => `${m.n} × ${m.message}`).join('\n')
                : (signal.details.chemins as string[]).join('\n')}
            </pre>
          </div>
        )}

        {fiche.conduite.length > 0 && (
          <div>
            <strong>Ce qu'il faut faire</strong>
            <ol style={{ margin: '6px 0 0', paddingLeft: 20, display: 'grid', gap: 4 }}>
              {fiche.conduite.map((c) => <li key={c}>{c}</li>)}
            </ol>
          </div>
        )}

        {modifiable ? (
          <>
            <label style={{ display: 'grid', gap: 6 }}>
              <strong>Note de traitement (obligatoire)</strong>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex. migration 334 appliquée à 14 h, changement attendu."
              />
            </label>
            <p className="page-sub" style={{ margin: 0 }}>
              Le signal passe dans l'Historique et la décision est inscrite au journal des actions.
            </p>
            {erreur && <p className="page-error">{erreur}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-soft btn-sm" onClick={onClose}>Fermer</button>
              <button className="btn btn-primary btn-sm" disabled={busy || note.trim().length < 3} onClick={traiter}>
                {busy ? '…' : 'Marquer comme traité'}
              </button>
            </div>
          </>
        ) : (
          <p className="page-sub" style={{ margin: 0 }}>
            Traité le {signal.traite_at ? dateHeure(signal.traite_at) : '-'}
            {signal.traite_par_nom ? ` par ${signal.traite_par_nom}` : ' automatiquement'}{signal.note ? ` : ${signal.note}` : ''}
          </p>
        )}
      </div>
    </Modal>
  );
}

import { useState, type ReactNode } from 'react';

// En-tete d'un reglage a interrupteur : titre, sous-titre et bascule a droite. La
// bascule ne change rien tout de suite : elle ouvre une confirmation avec le motif,
// obligatoire puisqu'il est inscrit au journal.
interface Props {
  titre: string;
  sousTitre: ReactNode;
  actif: boolean | null;
  etatOn: string;
  etatOff: string;
  questionAllumer: string;
  questionEteindre: string;
  modifiable: boolean;
  onConfirmer: (allumer: boolean, motif: string) => Promise<string | null>;
}

export function ReglageTete({ titre, sousTitre, actif, etatOn, etatOff, questionAllumer, questionEteindre, modifiable, onConfirmer }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function confirmer() {
    if (actif === null || !motif.trim()) return;
    setBusy(true);
    setErreur(null);
    const e = await onConfirmer(!actif, motif.trim());
    setBusy(false);
    if (e) { setErreur(e); return; }
    setMotif('');
    setOuvert(false);
  }

  return (
    <>
      <div className="rg-tete">
        <div className="rg-tete-texte">
          <h3>{titre}</h3>
          <p className="chart-sub">{sousTitre}</p>
        </div>
        {actif !== null && (
          <div className={`rg-etat ${actif ? 'is-on' : ''}`}>
            <span>{actif ? etatOn : etatOff}</span>
            <button
              type="button"
              role="switch"
              aria-checked={actif}
              aria-label={actif ? questionEteindre : questionAllumer}
              className={`rg-switch ${actif ? 'is-on' : ''} ${ouvert ? 'is-pending' : ''}`}
              disabled={!modifiable || busy}
              title={modifiable ? undefined : 'Modifiable par un super admin'}
              onClick={() => { setOuvert((o) => !o); setErreur(null); }}
            />
          </div>
        )}
      </div>
      {ouvert && actif !== null && (
        <div className={`rg-confirmer ${actif ? 'is-off' : ''}`}>
          <strong>{actif ? questionEteindre : questionAllumer}</strong>
          <div className="rg-confirmer-ligne">
            <input type="text" value={motif} autoFocus placeholder="Motif (inscrit au journal)"
                   onChange={(e) => setMotif(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') confirmer(); if (e.key === 'Escape') setOuvert(false); }} />
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setOuvert(false)}>Annuler</button>
            <button type="button" className={`btn btn-sm ${actif ? 'btn-danger' : 'btn-primary'}`} disabled={busy || !motif.trim()} onClick={confirmer}>
              {busy ? '…' : actif ? 'Éteindre' : 'Allumer'}
            </button>
          </div>
          {erreur && <p className="page-error">{erreur}</p>}
        </div>
      )}
    </>
  );
}

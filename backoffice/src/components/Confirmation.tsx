import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Modal } from './Modal';

// Fenetres de confirmation du back-office, a la place de window.confirm / window.prompt / window.alert : la boite
// native du navigateur sort du design, peut etre bloquee par le navigateur, et ne se lit pas en mode sombre.
//
//   const { confirmer, demanderTexte, informer, fenetre } = useConfirmation();
//   if (!(await confirmer({ titre: 'Supprimer ?', texte: '…', danger: true }))) return;
//   …
//   return <>{…}{fenetre}</>;

interface Demande {
  type: 'confirmer' | 'texte' | 'info';
  titre: string;
  texte?: ReactNode;
  libelleOui?: string;
  libelleNon?: string;
  danger?: boolean;
  champ?: { libelle: string; obligatoire?: boolean; min?: number };
}

export function useConfirmation() {
  const [demande, setDemande] = useState<Demande | null>(null);
  const [saisie, setSaisie] = useState('');
  const reponse = useRef<((v: boolean | string | null) => void) | null>(null);

  const ouvrir = useCallback((d: Demande) => new Promise<boolean | string | null>((resolve) => {
    reponse.current = resolve;
    setSaisie('');
    setDemande(d);
  }), []);

  function fermer(v: boolean | string | null) {
    reponse.current?.(v);
    reponse.current = null;
    setDemande(null);
  }

  const confirmer = useCallback(async (d: Omit<Demande, 'type' | 'champ'>) => (await ouvrir({ ...d, type: 'confirmer' })) === true, [ouvrir]);
  const demanderTexte = useCallback(async (d: Omit<Demande, 'type'> & { champ: NonNullable<Demande['champ']> }) => {
    const v = await ouvrir({ ...d, type: 'texte' });
    return typeof v === 'string' ? v : null;
  }, [ouvrir]);
  const informer = useCallback(async (d: Omit<Demande, 'type' | 'champ' | 'libelleNon'>) => { await ouvrir({ ...d, type: 'info' }); }, [ouvrir]);

  const min = demande?.champ ? (demande.champ.obligatoire ? Math.max(1, demande.champ.min ?? 1) : 0) : 0;
  const fenetre = demande ? (
    <Modal onClose={() => fermer(demande.type === 'texte' ? null : false)} narrow>
      <h2 className="modal-title">{demande.titre}</h2>
      <div className="modal-body">
        {demande.texte && <div className="hint" style={{ fontSize: 14, lineHeight: 1.5 }}>{demande.texte}</div>}
        {demande.type === 'texte' && demande.champ && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12, fontWeight: 700, fontSize: 13 }}>
            {demande.champ.libelle}
            <textarea rows={3} maxLength={300} value={saisie} onChange={(e) => setSaisie(e.target.value)} autoFocus />
          </label>
        )}
        <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
          {demande.type !== 'info' && (
            <button className="btn" onClick={() => fermer(demande.type === 'texte' ? null : false)}>{demande.libelleNon ?? 'Annuler'}</button>
          )}
          <button
            className={`btn ${demande.danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={demande.type === 'texte' && saisie.trim().length < min}
            autoFocus={demande.type !== 'texte'}
            onClick={() => fermer(demande.type === 'texte' ? saisie.trim() : true)}
          >
            {demande.libelleOui ?? (demande.type === 'info' ? 'Compris' : 'Confirmer')}
          </button>
        </div>
      </div>
    </Modal>
  ) : null;

  return { confirmer, demanderTexte, informer, fenetre };
}

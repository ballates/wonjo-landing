import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthContext';
import { peutGererAdmins } from '../../lib/permissions';
import { dateHeure } from '../../lib/labels';

// Interrupteurs des points relais (migration 430, docs/POINTS_RELAIS.md § 9) : même principe que les réglages de tarification. La bascule ne
// change rien toute seule : elle ouvre un motif obligatoire, et c'est « Valider » qui enregistre. Modifiable par le super admin seul (session
// vérifiée), lisible par la finance ; chaque changement est inscrit au journal avec son motif. Le serveur ne touche à aucune autre clé.

export type CleInterrupteur = 'points_relais_actif' | 'points_relais_virement_avance';
interface Etat { actif: boolean; modifie_at: string | null; modifie_par: string | null; motif: string | null }
type Etats = Record<CleInterrupteur, Etat>;

const EVENEMENT = 'interrupteurs-pr-change';

/** État des deux interrupteurs ; `null` tant qu'il n'est pas lu (ou si le rôle ne peut pas le lire). Se rafraîchit après chaque validation. */
export function useInterrupteursPointsRelais() {
  const [etats, setEtats] = useState<Etats | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  function charger() {
    supabase.rpc('admin_interrupteurs_points_relais').then(({ data, error }) => {
      if (error) { setErreur(error.message); return; }
      setErreur(null);
      setEtats(data as Etats);
    });
  }
  useEffect(() => {
    charger();
    window.addEventListener(EVENEMENT, charger);
    return () => window.removeEventListener(EVENEMENT, charger);
  }, []);
  return { etats, erreur };
}

interface Props {
  cle: CleInterrupteur;
  titre: string;
  sousTitre: string;
  /** Mise en garde affichée au moment d'allumer. */
  avertissementAllumer?: string;
}

export function InterrupteurPointsRelais({ cle, titre, sousTitre, avertissementAllumer }: Props) {
  const { roles } = useAuth();
  const modifiable = peutGererAdmins(roles);
  const { etats, erreur: erreurLecture } = useInterrupteursPointsRelais();
  const actuel = etats?.[cle] ?? null;
  const [actif, setActif] = useState(false);
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => { if (actuel) setActif(actuel.actif); }, [actuel]);

  const modifie = !!actuel && actif !== actuel.actif;

  async function valider() {
    if (!motif.trim()) { setErreur('Le motif est obligatoire.'); return; }
    setBusy(true);
    setErreur(null);
    const { data, error } = await supabase.rpc('admin_definir_interrupteur_points_relais', { p_cle: cle, p_actif: actif, p_motif: motif.trim() });
    setBusy(false);
    if (error) { setErreur(error.message === 'Deja dans cet etat' ? 'Cet interrupteur est déjà dans cet état.' : error.message); return; }
    setMotif('');
    setOk(data === 'allume' ? 'Allumé : le changement s\'applique tout de suite.' : 'Éteint : le changement s\'applique tout de suite.');
    window.dispatchEvent(new Event(EVENEMENT));
  }

  return (
    <div className="chart-card" style={{ marginBottom: 16 }}>
      <div className="chart-head">
        <div className="chart-head-titre">
          <h3>{titre}</h3>
          {actuel && <span className={`badge ${actuel.actif ? 'badge-green' : 'badge-muted'}`}>{actuel.actif ? 'Allumé' : 'Éteint'}</span>}
        </div>
        {actuel && (
          <label className={`corridor-toggle ${actif ? 'is-on' : ''}`} title={modifiable ? (actif ? 'Éteindre' : 'Allumer') : 'Modifiable par un super admin'}>
            <input type="checkbox" checked={actif} disabled={!modifiable || busy} onChange={() => { setActif((v) => !v); setOk(null); setErreur(null); }} />
            <span className="corridor-toggle-switch" />
          </label>
        )}
      </div>
      <p className="chart-sub">{sousTitre}</p>
      {actuel?.modifie_at && (
        <p className="hint">Dernier changement : {dateHeure(actuel.modifie_at)}{actuel.modifie_par ? ` par ${actuel.modifie_par}` : ''}{actuel.motif ? ` — « ${actuel.motif} »` : ''}.</p>
      )}
      {modifiable && modifie && (
        <div className="action-group motif-form">
          {actif && avertissementAllumer && <p className="page-error">{avertissementAllumer}</p>}
          <textarea value={motif} onChange={(e) => setMotif(e.target.value)}
                    placeholder={actif ? 'Motif (journal) - ex. essai en mode test réussi, solde Stripe suffisant.' : 'Motif (journal) - ex. incident à analyser.'} />
          <div className="action-row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-sm" disabled={busy}
                    onClick={() => { if (actuel) setActif(actuel.actif); setMotif(''); setErreur(null); }}>Annuler</button>
            <button type="button" className={`btn btn-sm ${actif ? 'btn-primary' : 'btn-danger'}`} disabled={busy || motif.trim().length < 4} onClick={valider}>
              {busy ? '…' : 'Valider'}
            </button>
          </div>
        </div>
      )}
      {ok && <p className="hint">{ok}</p>}
      {(erreur || erreurLecture) && <p className="page-error">{erreur ?? erreurLecture}</p>}
    </div>
  );
}

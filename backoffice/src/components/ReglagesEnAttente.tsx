import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { peutGererAdmins } from '../lib/permissions';
import { dateHeure } from '../lib/labels';

// [347] Revue à deux des réglages de prix : un changement qui BAISSE le revenu (protection,
// protection renforcée, commission fixe d'une zone) attend la validation d'un AUTRE super admin.
// Une hausse, un allumage ou une extinction s'appliquent tout de suite et n'apparaissent pas ici.
interface Item {
  id: string; reglage: string; resume: string; motif: string;
  demande_par: string; demande_par_nom: string | null; created_at: string;
}
interface File { moi: string; nb_super_admins: number; items: Item[] }

const EVENEMENT = 'reglages-change';
// A appeler apres l'enregistrement d'un reglage de prix : rafraichit la file « a valider ».
export function signalerReglagesChange() { window.dispatchEvent(new Event(EVENEMENT)); }

export function ReglagesEnAttente({ onChange }: { onChange: () => void }) {
  const { roles } = useAuth();
  const autorise = peutGererAdmins(roles);
  const [file, setFile] = useState<File | null>(null);
  const [motifs, setMotifs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  function charger() {
    if (!autorise) return;
    supabase.rpc('admin_reglages_en_attente').then(({ data, error }) => {
      if (error) { setErreur(error.message); return; }
      setFile(data as File);
    });
  }
  useEffect(() => {
    charger();
    window.addEventListener(EVENEMENT, charger);
    return () => window.removeEventListener(EVENEMENT, charger);
  }, [autorise]); // eslint-disable-line react-hooks/exhaustive-deps

  async function decider(item: Item, approuver: boolean) {
    const motif = (motifs[item.id] ?? '').trim();
    if (!approuver && !motif) { setErreur('Indiquez le motif du refus.'); return; }
    setBusy(item.id);
    setErreur(null);
    const { error } = await supabase.rpc('admin_reglage_decider', { p_id: item.id, p_approuver: approuver, p_motif: motif || null });
    setBusy(null);
    if (error) { setErreur(error.message); return; }
    charger();
    onChange();
  }

  async function annuler(item: Item) {
    setBusy(item.id);
    setErreur(null);
    const { error } = await supabase.rpc('admin_reglage_annuler', { p_id: item.id });
    setBusy(null);
    if (error) { setErreur(error.message); return; }
    charger();
  }

  if (!autorise || !file || file.items.length === 0) {
    return erreur ? <p className="page-error">{erreur}</p> : null;
  }

  return (
    <div className="chart-card" style={{ marginBottom: 16 }}>
      <div className="chart-head">
        <div className="chart-head-titre">
          <h3>Changements de tarif à valider</h3>
          <span className="badge badge-amber">{file.items.length}</span>
        </div>
      </div>
      <p className="chart-sub">
        Une baisse de tarif n'a aucun effet tant qu'un autre super admin ne l'a pas approuvée. Le réglage actuel reste en vigueur.
        {file.nb_super_admins < 2 && ' Il n\'y a qu\'un seul super admin : invitez-en un second (Administration), sinon ces demandes restent en attente.'}
      </p>
      <ul className="pending-list">
        {file.items.map((it) => (
          <li key={it.id}>
            <div>
              <strong>{it.resume}</strong>
              <span className="hint">Demandé par {it.demande_par_nom ?? '-'} · {dateHeure(it.created_at)} · motif : {it.motif}</span>
            </div>
            {it.demande_par === file.moi ? (
              <div className="action-row" style={{ alignItems: 'center' }}>
                <span className="hint">En attente d'un autre super admin</span>
                <button type="button" className="btn btn-sm" disabled={busy === it.id} onClick={() => annuler(it)}>Retirer ma demande</button>
              </div>
            ) : (
              <div className="action-row" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="text" placeholder="Motif (obligatoire pour refuser)" value={motifs[it.id] ?? ''}
                       onChange={(e) => setMotifs({ ...motifs, [it.id]: e.target.value })} style={{ minWidth: 220 }} />
                <button type="button" className="btn btn-success btn-sm" disabled={busy === it.id} onClick={() => decider(it, true)}>Approuver</button>
                <button type="button" className="btn btn-danger-outline btn-sm" disabled={busy === it.id} onClick={() => decider(it, false)}>Refuser</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {erreur && <p className="page-error">{erreur}</p>}
    </div>
  );
}

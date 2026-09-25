import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { FicheCompte, Litige, Signalement } from '../lib/types';

type Tab = 'signalements' | 'litiges';

export function ModerationPage() {
  const [tab, setTab] = useState<Tab>('signalements');
  return (
    <div>
      <h1>Modération</h1>
      <div className="tabs">
        <button className={tab === 'signalements' ? 'active' : ''} onClick={() => setTab('signalements')}>Signalements</button>
        <button className={tab === 'litiges' ? 'active' : ''} onClick={() => setTab('litiges')}>Litiges</button>
      </div>
      {tab === 'signalements' ? <SignalementsTab /> : <LitigesTab />}
    </div>
  );
}

function SignalementsTab() {
  const [items, setItems] = useState<Signalement[]>([]);
  const [statut, setStatut] = useState<string>('nouveau');
  const [error, setError] = useState<string | null>(null);
  const [fiche, setFiche] = useState<FicheCompte | null>(null);

  async function load() {
    const { data, error: rpcError } = await supabase.rpc('admin_lister_signalements', {
      p_statut: statut || null,
      p_limite: 50,
      p_offset: 0,
    });
    if (rpcError) { setError(rpcError.message); return; }
    setItems((data ?? []) as Signalement[]);
  }

  useEffect(() => { load(); }, [statut]); // eslint-disable-line react-hooks/exhaustive-deps

  async function traiter(id: string, nouveauStatut: string) {
    const note = window.prompt('Note (optionnelle) :') ?? undefined;
    const { error: rpcError } = await supabase.rpc('admin_traiter_signalement', {
      p_id: id,
      p_statut: nouveauStatut,
      p_note: note || null,
    });
    if (rpcError) { alert(rpcError.message); return; }
    await load();
  }

  async function voirCompte(userId: string) {
    const { data, error: rpcError } = await supabase.rpc('admin_fiche_compte', { p_user_id: userId }).single();
    if (rpcError) { alert(rpcError.message); return; }
    setFiche(data as FicheCompte);
  }

  return (
    <div>
      <select value={statut} onChange={(e) => setStatut(e.target.value)}>
        <option value="nouveau">Nouveau</option>
        <option value="en_cours">En cours</option>
        <option value="clos_sans_suite">Clos sans suite</option>
        <option value="clos_action_prise">Clos - action prise</option>
        <option value="">Tous</option>
      </select>
      {error && <p className="page-error">{error}</p>}
      <table>
        <thead><tr><th>Raison</th><th>Détails</th><th>Créé le</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id}>
              <td>{s.raison}</td>
              <td>{s.details}</td>
              <td>{new Date(s.created_at).toLocaleString('fr-FR')}</td>
              <td>{s.statut}</td>
              <td>
                <button onClick={() => voirCompte(s.cible_id)}>Voir le compte</button>
                <button onClick={() => traiter(s.id, 'en_cours')}>En cours</button>
                <button onClick={() => traiter(s.id, 'clos_sans_suite')}>Clore sans suite</button>
                <button onClick={() => traiter(s.id, 'clos_action_prise')}>Clore - action prise</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {fiche && <FicheCompteModal fiche={fiche} onClose={() => setFiche(null)} onChanged={() => voirCompte(fiche.id)} />}
    </div>
  );
}

function LitigesTab() {
  const [items, setItems] = useState<Litige[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('admin_lister_litiges', { p_limite: 50, p_offset: 0 }).then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setItems((data ?? []) as Litige[]);
    });
  }, []);

  if (error) return <p className="page-error">{error}</p>;

  return (
    <table>
      <thead><tr><th>Colis</th><th>Montant</th><th>Statut paiement</th><th>Contesté le</th><th>Résolutions en attente</th></tr></thead>
      <tbody>
        {items.map((l) => (
          <tr key={l.id}>
            <td>{l.description_colis}</td>
            <td>{l.montant_total} €</td>
            <td>{l.statut_paiement}</td>
            <td>{l.conteste_at ? new Date(l.conteste_at).toLocaleString('fr-FR') : '—'}</td>
            <td>{l.resolutions_en_attente}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FicheCompteModal({ fiche, onClose, onChanged }: { fiche: FicheCompte; onClose: () => void; onChanged: () => void }) {
  async function bloquer() {
    const motif = window.prompt('Motif du blocage (obligatoire) :');
    if (!motif) return;
    const { error } = await supabase.rpc('admin_bloquer_compte', { p_user_id: fiche.id, p_motif: motif });
    if (error) { alert(error.message); return; }
    onChanged();
  }

  async function debloquer() {
    const motif = window.prompt('Motif du déblocage (optionnel) :') ?? undefined;
    const { error } = await supabase.rpc('admin_debloquer_compte', { p_user_id: fiche.id, p_motif: motif || null });
    if (error) { alert(error.message); return; }
    onChanged();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{fiche.prenom} {fiche.nom}</h2>
        <p>Statut : {fiche.bloque ? 'BLOQUÉ' : 'actif'} · KYC : {fiche.kyc_status ?? '—'}</p>
        <p>Livraisons : {fiche.nombre_livraisons ?? 0} · Colis confiés : {fiche.nombre_colis_confies ?? 0}</p>
        <p>Signalements reçus : {fiche.signalements} ({fiche.signaleurs_distincts} personnes distinctes)</p>
        {fiche.raisons && <p>Raisons : {fiche.raisons.filter(Boolean).join(', ')}</p>}
        <div className="modal-actions">
          {fiche.bloque
            ? <button onClick={debloquer}>Débloquer ce compte</button>
            : <button className="danger" onClick={bloquer}>Bloquer ce compte</button>}
          <button onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

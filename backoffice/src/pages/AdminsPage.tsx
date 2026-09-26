import { useEffect, useState } from 'react';
import { Select, type Option } from '../components/Select';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { LABELS_ROLES } from '../lib/permissions';
import { Person } from '../components/Avatar';
import { DataTable, type Column } from '../components/DataTable';
import type { AdminRow } from '../lib/adminTypes';
import type { AdminRole } from '../auth/AuthContext';

const ROLES: AdminRole[] = ['super_admin', 'moderation', 'finance', 'lecture_seule'];
const HINTS_ROLES: Record<AdminRole, string> = {
  super_admin: 'Tout, y compris gérer les administrateurs',
  moderation: 'Comptes, signalements, litiges, KYC',
  finance: 'Chiffres et revenus uniquement',
  lecture_seule: 'Consultation du tableau de bord',
};
const ROLE_OPTIONS: Option<AdminRole>[] = ROLES.map((r) => ({ value: r, label: LABELS_ROLES[r], hint: HINTS_ROLES[r] }));

export function AdminsPage() {
  const { profil } = useAuth();
  const [admins, setAdmins] = useState<AdminRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error: rpcError } = await supabase.rpc('admin_lister_admins');
    if (rpcError) { setError(rpcError.message); return; }
    setAdmins((data ?? []) as AdminRow[]);
  }

  useEffect(() => { load(); }, []);

  async function changerRole(userId: string, role: AdminRole) {
    const { error: rpcError } = await supabase.rpc('admin_changer_role', { p_user_id: userId, p_role: role });
    if (rpcError) { alert(rpcError.message); return; }
    await load();
  }

  async function toggleActif(admin: AdminRow) {
    const verbe = admin.actif ? 'Désactiver' : 'Réactiver';
    if (!window.confirm(`${verbe} l'accès de ${admin.nom_affiche ?? admin.email} au back-office ?`)) return;
    const fn = admin.actif ? 'admin_desactiver_admin' : 'admin_reactiver_admin';
    const { error: rpcError } = await supabase.rpc(fn, { p_user_id: admin.user_id });
    if (rpcError) { alert(rpcError.message); return; }
    await load();
  }

  const columns: Column<AdminRow>[] = [
    { key: 'nom', label: 'Administrateur', value: (a) => a.nom_affiche ?? a.email, render: (a) => <Person src={a.avatar_url} nom={a.nom_affiche ?? a.email} sub={a.email} /> },
    {
      key: 'role', filter: 'options', label: 'Rôle', value: (a) => LABELS_ROLES[a.role], render: (a) => (
        <Select
          size="sm"
          ariaLabel="Rôle"
          value={a.role}
          disabled={a.user_id === profil?.user_id}
          onChange={(v) => changerRole(a.user_id, v)}
          minWidth={170}
          options={ROLE_OPTIONS}
        />
      ),
    },
    { key: 'statut', filter: 'options', label: 'Statut', value: (a) => (a.actif ? 'Actif' : 'Désactivé'), render: (a) => <span className={`badge ${a.actif ? 'badge-green' : 'badge-muted'}`}>{a.actif ? 'Actif' : 'Désactivé'}</span> },
    { key: 'depuis', label: 'Depuis', value: (a) => a.created_at, render: (a) => new Date(a.created_at).toLocaleDateString('fr-FR') },
    {
      key: 'actions', label: '', render: (a) => (a.user_id === profil?.user_id ? <span className="hint">C'est vous</span> : (
        <button className={`btn btn-sm ${a.actif ? 'btn-danger-outline' : 'btn-soft'}`} onClick={() => toggleActif(a)}>{a.actif ? 'Désactiver' : 'Réactiver'}</button>
      )),
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Administrateurs</h1>
          <p className="page-sub">Gérer les accès au back-office. Chaque action est tracée dans le journal.</p>
        </div>
      </div>
      {error && <p className="page-error">{error}</p>}
      {!admins ? <p className="loading-state">Chargement…</p> : (
        <DataTable rows={admins} columns={columns} rowKey={(a) => a.user_id} searchPlaceholder="Rechercher un administrateur…" />
      )}
      <InviteForm onInvited={load} />
    </div>
  );
}

function InviteForm({ onInvited }: { onInvited: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('lecture_seule');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const { error: fnError } = await supabase.functions.invoke('admin-inviter', { body: { email, role } });
      if (fnError) throw fnError;
      setSuccess(true);
      setEmail('');
      onInvited();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invitation échouée');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="panel invite-form" onSubmit={handleSubmit}>
      <h3>Inviter un administrateur</h3>
      <p className="chart-sub">La personne reçoit un email pour choisir son mot de passe, puis active la double authentification.</p>
      <div className="invite-row">
        <input type="email" placeholder="email@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Select ariaLabel="Rôle" value={role} onChange={setRole} minWidth={200} options={ROLE_OPTIONS} />
        <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Envoi…' : 'Envoyer l\'invitation'}</button>
      </div>
      {error && <p className="page-error" style={{ marginTop: 10 }}>{error}</p>}
      {success && <p className="invite-success">Invitation envoyée.</p>}
    </form>
  );
}

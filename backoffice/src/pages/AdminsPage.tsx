import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { LABELS_ROLES } from '../lib/permissions';
import type { AdminRow } from '../lib/adminTypes';
import type { AdminRole } from '../auth/AuthContext';

const ROLES: AdminRole[] = ['super_admin', 'moderation', 'finance', 'lecture_seule'];

export function AdminsPage() {
  const { email: monEmail } = useAuth();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
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
    const fn = admin.actif ? 'admin_desactiver_admin' : 'admin_reactiver_admin';
    const { error: rpcError } = await supabase.rpc(fn, { p_user_id: admin.user_id });
    if (rpcError) { alert(rpcError.message); return; }
    await load();
  }

  return (
    <div>
      <h1>Administrateurs</h1>
      {error && <p className="page-error">{error}</p>}
      <table>
        <thead><tr><th>Email</th><th>Rôle</th><th>Statut</th><th>Depuis</th><th>Actions</th></tr></thead>
        <tbody>
          {admins.map((a) => (
            <tr key={a.user_id}>
              <td>{a.email}</td>
              <td>
                <select value={a.role} onChange={(e) => changerRole(a.user_id, e.target.value as AdminRole)}>
                  {ROLES.map((r) => <option key={r} value={r}>{LABELS_ROLES[r]}</option>)}
                </select>
              </td>
              <td>{a.actif ? 'Actif' : 'Désactivé'}</td>
              <td>{new Date(a.created_at).toLocaleDateString('fr-FR')}</td>
              <td>
                {a.email !== monEmail && (
                  <button onClick={() => toggleActif(a)}>{a.actif ? 'Désactiver' : 'Réactiver'}</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

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
      const { error: fnError } = await supabase.functions.invoke('admin-inviter', {
        body: { email, role },
      });
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
    <form className="invite-form" onSubmit={handleSubmit}>
      <h2>Inviter un administrateur</h2>
      <div className="invite-row">
        <input
          type="email"
          placeholder="email@exemple.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <select value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
          {ROLES.map((r) => <option key={r} value={r}>{LABELS_ROLES[r]}</option>)}
        </select>
        <button type="submit" disabled={loading}>{loading ? 'Envoi…' : 'Inviter'}</button>
      </div>
      {error && <p className="auth-error">{error}</p>}
      {success && <p className="invite-success">Invitation envoyée.</p>}
    </form>
  );
}

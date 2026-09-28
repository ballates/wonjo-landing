import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { LABELS_ROLES } from '../lib/permissions';
import { Person } from '../components/Avatar';
import { DataTable, type Column } from '../components/DataTable';
import { IconSquarePencil } from '../components/Icons';
import type { AdminRow } from '../lib/adminTypes';
import type { AdminRole } from '../auth/AuthContext';

const ROLES: AdminRole[] = ['super_admin', 'moderation', 'finance', 'commercial', 'data', 'stagiaire', 'lecture_seule'];
const HINTS_ROLES: Record<AdminRole, string> = {
  super_admin: 'Tout, y compris gérer les administrateurs (max 5)',
  moderation: 'Comptes, signalements, litiges, KYC',
  finance: 'Chiffres, revenus, commissions',
  commercial: 'Envoi d\'emails et modèles (Wmail)',
  data: 'Consultation des tableaux de bord',
  stagiaire: 'Accès très limité, en lecture',
  lecture_seule: 'Consultation du tableau de bord',
};

function RolePill({ role, checked, onToggle }: { role: AdminRole; checked: boolean; onToggle: () => void }) {
  return (
    <label className={`role-pill role-info ${checked ? 'is-on' : ''}`} tabIndex={0}>
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <span className="role-pill-dot" />
      {LABELS_ROLES[role]}
      <div className="role-popover">
        <span className="role-popover-title">{LABELS_ROLES[role]}</span>
        <p className="role-popover-desc">{HINTS_ROLES[role]}</p>
      </div>
    </label>
  );
}

function RolesDropdown({ roles, onToggleRole }: { roles: AdminRole[]; onToggleRole: (r: AdminRole) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function toggleOpen() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: r.left });
    }
    setOpen((o) => !o);
  }

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        panelRef.current && !panelRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    function onScrollOrResize() { setOpen(false); }
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  return (
    <div className="roles-view">
      <span className="chips">{roles.map((r) => <span key={r} className="chip">{LABELS_ROLES[r]}</span>)}</span>
      <button ref={btnRef} className="icon-button" title="Modifier les rôles" aria-label="Modifier les rôles" onClick={toggleOpen}>
        <IconSquarePencil />
      </button>
      {open && createPortal(
        <div ref={panelRef} className="roles-dropdown" style={{ top: pos.top, left: pos.left }}>
          <div className="role-checkboxes role-checkboxes-vertical">
            {ROLES.map((r) => (
              <RolePill key={r} role={r} checked={roles.includes(r)} onToggle={() => onToggleRole(r)} />
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export function AdminsPage() {
  const { profil } = useAuth();
  if (profil?.roles.includes('super_admin')) return <AdminsPageComplete />;
  if (profil?.peut_inviter) return <FormulaireInvitationSeul />;
  return null;
}

function AdminsPageComplete() {
  const { profil } = useAuth();
  const [admins, setAdmins] = useState<AdminRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    const { data, error: rpcError } = await supabase.rpc('admin_lister_admins');
    if (rpcError) { setError(rpcError.message); return; }
    setAdmins((data ?? []) as AdminRow[]);
  }

  useEffect(() => { load(); }, []);

  async function definirRoles(userId: string, roles: AdminRole[]) {
    if (roles.length === 0) { alert('Au moins un rôle est requis.'); return; }
    const { error: rpcError } = await supabase.rpc('admin_definir_roles', { p_user_id: userId, p_roles: roles });
    if (rpcError) { alert(rpcError.message); return; }
    await load();
  }

  async function toggleRole(admin: AdminRow, role: AdminRole) {
    const next = admin.roles.includes(role) ? admin.roles.filter((r) => r !== role) : [...admin.roles, role];
    await definirRoles(admin.user_id, next);
  }

  async function togglePeutInviter(admin: AdminRow) {
    const { error: rpcError } = await supabase.rpc('admin_definir_peut_inviter', { p_user_id: admin.user_id, p_peut_inviter: !admin.peut_inviter });
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
      key: 'roles', label: 'Rôles', value: (a) => a.roles.map((r) => LABELS_ROLES[r]).join(', '), render: (a) => (
        a.user_id === profil?.user_id ? (
          <span className="chips">{a.roles.map((r) => <span key={r} className="chip">{LABELS_ROLES[r]}</span>)}</span>
        ) : (
          <RolesDropdown roles={a.roles} onToggleRole={(r) => toggleRole(a, r)} />
        )
      ),
    },
    {
      key: 'peut_inviter', label: 'Peut inviter',
      value: (a) => (a.roles.includes('super_admin') || a.peut_inviter ? 'Oui' : 'Non'),
      render: (a) => a.roles.includes('super_admin') ? (
        <span className="hint" title="Le rôle Admin donne automatiquement le droit d'inviter, quel que soit ce réglage">Oui</span>
      ) : a.user_id === profil?.user_id ? (
        <span className="hint">{a.peut_inviter ? 'Oui' : 'Non'}</span>
      ) : (
        <label className="role-checkbox" title="Peut inviter de nouveaux administrateurs, hors rôle Admin">
          <input type="checkbox" className="dt-check" checked={a.peut_inviter} onChange={() => togglePeutInviter(a)} />
        </label>
      ),
    },
    {
      key: 'statut', filter: 'options', label: 'Statut',
      value: (a) => (!a.invitation_confirmee ? 'En attente' : a.actif ? 'Actif' : 'Désactivé'),
      render: (a) => !a.invitation_confirmee
        ? <span className="badge badge-amber">En attente</span>
        : <span className={`badge ${a.actif ? 'badge-green' : 'badge-muted'}`}>{a.actif ? 'Actif' : 'Désactivé'}</span>,
    },
    { key: 'depuis', label: 'Depuis', value: (a) => a.created_at, filter: 'date', render: (a) => new Date(a.created_at).toLocaleDateString('fr-FR') },
    {
      key: 'actions', label: '', render: (a) => (a.user_id === profil?.user_id ? <span className="hint">Mon profil</span> : (
        <button className={`btn btn-sm ${a.actif ? 'btn-danger-outline' : 'btn-soft'}`} onClick={() => toggleActif(a)}>{a.actif ? 'Désactiver' : 'Réactiver'}</button>
      )),
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Administration</h1>
          <p className="page-sub">Gérer les accès à Wonjo. Une personne peut cumuler plusieurs rôles. Chaque action est tracée dans le journal.</p>
        </div>
      </div>
      {error && <p className="page-error">{error}</p>}
      {!admins ? <p className="loading-state">Chargement…</p> : (
        <DataTable rows={admins} columns={columns} rowKey={(a) => a.user_id} searchPlaceholder="Rechercher un administrateur…" pageSize={20} />
      )}
      <InviteForm rolesAutorises={ROLES} onInvited={load} />
    </div>
  );
}

// Vue reduite pour un compte qui a la capacite "peut_inviter" mais n'est pas
// super_admin : il peut inviter (hors role super_admin), mais ne voit ni ne
// gere la liste complete des administrateurs (admin_lister_admins reste
// reservee au super_admin cote serveur).
function FormulaireInvitationSeul() {
  const rolesAutorises = ROLES.filter((r) => r !== 'super_admin');
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Administration</h1>
          <p className="page-sub">Vous pouvez inviter de nouveaux administrateurs (hors rôle super_admin).</p>
        </div>
      </div>
      <InviteForm rolesAutorises={rolesAutorises} onInvited={() => {}} />
    </div>
  );
}

function InviteForm({ rolesAutorises, onInvited }: { rolesAutorises: AdminRole[]; onInvited: () => void }) {
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<Set<AdminRole>>(new Set(['lecture_seule']));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function toggleRole(r: AdminRole) {
    setRoles((s) => {
      const n = new Set(s);
      if (n.has(r)) n.delete(r); else n.add(r);
      return n;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (roles.size === 0) { setError('Sélectionnez au moins un rôle.'); return; }
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const { error: fnError } = await supabase.functions.invoke('admin-inviter', { body: { email, roles: [...roles] } });
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
      <p className="chart-sub">La personne reçoit un email pour choisir son mot de passe, puis active la double authentification. Un ou plusieurs rôles peuvent être cochés.</p>
      <div className="invite-row">
        <input type="email" placeholder="email@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="role-checkboxes" style={{ marginTop: 10 }}>
        {rolesAutorises.map((r) => (
          <RolePill key={r} role={r} checked={roles.has(r)} onToggle={() => toggleRole(r)} />
        ))}
      </div>
      <div className="action-row" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Envoi…' : 'Envoyer l\'invitation'}</button>
      </div>
      {error && <p className="page-error" style={{ marginTop: 10 }}>{error}</p>}
      {success && <p className="invite-success">Invitation envoyée.</p>}
    </form>
  );
}

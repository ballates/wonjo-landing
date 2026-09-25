import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { LABELS_ROLES, peutGererAdmins, peutModerer, peutVoirKyc } from '../lib/permissions';

export function Layout() {
  const { signOut, role, email } = useAuth();
  return (
    <div className="layout">
      <nav className="sidebar">
        <h2>Wonjo</h2>
        <NavLink to="/" end>Tableau de bord</NavLink>
        {peutModerer(role) && <NavLink to="/moderation">Modération</NavLink>}
        {peutVoirKyc(role) && <NavLink to="/kyc">KYC</NavLink>}
        {peutGererAdmins(role) && <NavLink to="/admins">Administrateurs</NavLink>}
        <div className="sidebar-user">
          <span>{email}</span>
          <span className="role-badge">{role ? LABELS_ROLES[role] : ''}</span>
        </div>
        <button className="auth-secondary" onClick={() => signOut()}>Déconnexion</button>
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

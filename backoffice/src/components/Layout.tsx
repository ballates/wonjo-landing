import { useState } from 'react';
import { motion } from 'framer-motion';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { LABELS_ROLES, peutGererAdmins, peutModerer, peutVoirKyc } from '../lib/permissions';
import { useTheme } from '../lib/theme';
import { nbActions, useAFaire } from '../lib/aFaire';
import { brandMark } from './Brand';
import { Avatar } from './Avatar';
import { ProfilModal } from './ProfilModal';
import {
  IconDashboard, IconHistory, IconId, IconLogout, IconMoon, IconPanelClose, IconPanelOpen,
  IconChecklist, IconMail, IconPercent, IconShield, IconSun, IconUsers,
} from './Icons';

const STORAGE_KEY = 'wonjo-backoffice-sidebar-collapsed';

export function Layout() {
  const { signOut, role, email, profil } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const location = useLocation();
  const [profilOuvert, setProfilOuvert] = useState(false);
  // Rafraichi a chaque changement de page : le badge suit les actions traitees.
  const { items: aFaire } = useAFaire(location.pathname);
  const nbAFaire = nbActions(aFaire);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });

  function toggleSidebar() {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* navigation privee */ }
      return next;
    });
  }

  const nom = profil?.nom ?? email ?? '';
  const liens = [
    { to: '/', label: 'Tableau de bord', icon: <IconDashboard />, visible: true, end: true },
    { to: '/a-faire', label: 'À faire', icon: <IconChecklist />, visible: true, badge: nbAFaire },
    { to: '/moderation', label: 'Modération', icon: <IconShield />, visible: peutModerer(role) },
    { to: '/kyc', label: 'KYC', icon: <IconId />, visible: peutVoirKyc(role) },
    { to: '/admins', label: 'Administrateurs', icon: <IconUsers />, visible: peutGererAdmins(role) },
    { to: '/commissions', label: 'Commissions', icon: <IconPercent />, visible: peutGererAdmins(role) },
    { to: '/emails', label: 'Emails', icon: <IconMail />, visible: peutGererAdmins(role) },
    { to: '/journal', label: 'Journal des actions', icon: <IconHistory />, visible: peutGererAdmins(role) },
  ];

  return (
    <div className="layout">
      <motion.nav
        className={`sidebar ${collapsed ? 'collapsed' : ''}`}
        animate={{ width: collapsed ? 76 : 248 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      >
        <div className="sidebar-head">
          <span className="sidebar-logo"><img src={brandMark} alt="Wonjo" /></span>
          {!collapsed && <span className="sidebar-wordmark">WONJO</span>}
          <button
            className="icon-button"
            onClick={toggleSidebar}
            title={collapsed ? 'Déplier le menu' : 'Replier le menu'}
            aria-label={collapsed ? 'Déplier le menu' : 'Replier le menu'}
          >
            {collapsed ? <IconPanelOpen /> : <IconPanelClose />}
          </button>
        </div>

        <div className="sidebar-nav">
          {liens.filter((l) => l.visible).map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} title={collapsed ? l.label : undefined} className="nav-link">
              <span className="nav-icon">
                {l.icon}
                {collapsed && !!l.badge && <span className="nav-dot" />}
              </span>
              {!collapsed && <span className="nav-label">{l.label}</span>}
              {!collapsed && !!l.badge && <span className="nav-badge">{l.badge}</span>}
            </NavLink>
          ))}
        </div>

        <div className="sidebar-foot">
          <div className="sidebar-tools">
            <button className="icon-button tool-wide" onClick={toggleTheme} title={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}>
              {theme === 'dark' ? <IconSun /> : <IconMoon />}
              {!collapsed && (theme === 'dark' ? 'Mode clair' : 'Mode sombre')}
            </button>
            <button className="icon-button" onClick={() => signOut()} title="Se déconnecter" aria-label="Se déconnecter">
              <IconLogout />
            </button>
          </div>
          <button className="sidebar-me" onClick={() => setProfilOuvert(true)} title="Mon profil">
            <Avatar src={profil?.avatar_url} nom={nom} size={collapsed ? 36 : 38} />
            {!collapsed && (
              <span className="sidebar-me-text">
                <span className="sidebar-me-name">{nom}</span>
                <span className="badge badge-teal" style={{ alignSelf: 'flex-start' }}>{role ? LABELS_ROLES[role] : ''}</span>
              </span>
            )}
          </button>
        </div>
      </motion.nav>

      <main className="content">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          <Outlet />
        </motion.div>
      </main>

      {profilOuvert && <ProfilModal onClose={() => setProfilOuvert(false)} />}
    </div>
  );
}

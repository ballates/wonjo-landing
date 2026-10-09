import { Suspense, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { LABELS_ROLES, peutEnvoyerEmails, peutGererAdmins, peutGererCorridors, peutModerer, peutVoirKyc, peutVoirLitiges } from '../lib/permissions';
import { useTheme } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { brandMark } from './Brand';
import { Avatar } from './Avatar';
import { ProfilModal } from './ProfilModal';
import {
  IconDashboard, IconExchange, IconHistory, IconId, IconLock, IconLogout, IconMoon, IconPanelClose, IconPanelOpen,
  IconWmail, IconTag, IconShield, IconStar, IconSun, IconUsers,
} from './Icons';

const STORAGE_KEY = 'wonjo-backoffice-sidebar-collapsed';

export function Layout() {
  const { signOut, roles, email, profil } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const location = useLocation();
  const [profilOuvert, setProfilOuvert] = useState(false);
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

  // Pastille de la page Securite : alertes + elements a verifier encore ouverts.
  // Relue a chaque changement de page, donc apres un traitement.
  const [nbSecurite, setNbSecurite] = useState(0);
  const estSuperAdmin = peutGererAdmins(roles);
  useEffect(() => {
    if (!estSuperAdmin) return;
    supabase.rpc('admin_nb_signaux_securite').then(({ data }) => {
      const d = data as { alerte?: number; a_verifier?: number } | null;
      setNbSecurite((d?.alerte ?? 0) + (d?.a_verifier ?? 0));
    });
  }, [estSuperAdmin, location.pathname]);

  const nom = profil?.nom ?? email ?? '';
  const liens = [
    { to: '/', label: 'Tableau de bord', icon: <IconDashboard />, visible: true, end: true },
    { to: '/moderation', label: 'Confiance', icon: <IconShield />, visible: peutModerer(roles) || peutVoirLitiges(roles) },
    { to: '/kyc', label: 'KYC', icon: <IconId />, visible: peutVoirKyc(roles) },
    { to: '/transactions', label: 'Transactions', icon: <IconExchange />, visible: peutModerer(roles) },
    { to: '/avis', label: 'Avis', icon: <IconStar />, visible: peutModerer(roles) },
    { to: '/tarification', label: 'Tarification', icon: <IconTag />, visible: peutGererAdmins(roles) || peutGererCorridors(roles) },
    { to: '/emails', label: 'Emails', icon: <IconWmail />, visible: peutEnvoyerEmails(roles) },
    { to: '/journal', label: 'Actions', icon: <IconHistory />, visible: peutGererAdmins(roles) },
    { to: '/securite', label: 'Sécurité', icon: <IconLock />, visible: peutGererAdmins(roles), count: nbSecurite },
    { to: '/admins', label: 'Admin', icon: <IconUsers />, visible: peutGererAdmins(roles) || !!profil?.peut_inviter },
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
              <span className="nav-icon">{l.icon}{collapsed && !!l.count && <span className="nav-dot" />}</span>
              {!collapsed && <span className="nav-label">{l.label}</span>}
              {!collapsed && !!l.count && <span className="nav-count">{l.count}</span>}
            </NavLink>
          ))}
        </div>

        <div className="sidebar-foot">
          <div className="sidebar-tools">
            <button className="icon-button" onClick={toggleTheme} title={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'} aria-label={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}>
              {theme === 'dark' ? <IconSun /> : <IconMoon />}
            </button>
            <button className="icon-button icon-button-danger" onClick={() => signOut()} title="Se déconnecter" aria-label="Se déconnecter">
              <IconLogout />
            </button>
          </div>
          <button className="sidebar-me" onClick={() => setProfilOuvert(true)} title="Mon profil">
            <Avatar src={profil?.avatar_url} nom={nom} size={collapsed ? 36 : 38} />
            {!collapsed && (
              <span className="sidebar-me-text">
                <span className="sidebar-me-name">{nom}</span>
                <span className="sidebar-me-roles">
                  {roles.map((r) => <span key={r} className="badge badge-teal">{LABELS_ROLES[r]}</span>)}
                </span>
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
          <Suspense fallback={<p className="loading-state">Chargement…</p>}>
            <Outlet />
          </Suspense>
        </motion.div>
      </main>

      {profilOuvert && <ProfilModal onClose={() => setProfilOuvert(false)} />}
    </div>
  );
}

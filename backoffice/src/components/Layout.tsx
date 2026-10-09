import { Suspense, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { LABELS_ROLES, peutEnvoyerEmails, peutGererAdmins, peutGererCorridors, peutModerer, peutVoirKyc, peutVoirLitiges, peutVoirTransactions } from '../lib/permissions';
import { useTheme } from '../lib/theme';
import { brandMark } from './Brand';
import { Avatar } from './Avatar';
import { ProfilModal } from './ProfilModal';
import {
  IconDashboard, IconExchange, IconId, IconLock, IconLogout, IconMoon, IconPanelClose, IconPanelOpen,
  IconWmail, IconTag, IconShield, IconStar, IconSun, IconUsers, IconUser, IconChevronUp, IconMenu, IconClose,
} from './Icons';

const STORAGE_KEY = 'wonjo-backoffice-sidebar-collapsed';
const REQUETE_MOBILE = '(max-width: 860px)';

function useEstMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia(REQUETE_MOBILE).matches);
  useEffect(() => {
    const mq = window.matchMedia(REQUETE_MOBILE);
    const maj = () => setMobile(mq.matches);
    mq.addEventListener('change', maj);
    return () => mq.removeEventListener('change', maj);
  }, []);
  return mobile;
}

export function Layout() {
  const { signOut, roles, email, profil } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const location = useLocation();
  const [profilOuvert, setProfilOuvert] = useState(false);
  const [menuOuvert, setMenuOuvert] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!menuOuvert) return;
    function dehors(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOuvert(false);
    }
    function echap(e: KeyboardEvent) { if (e.key === 'Escape') setMenuOuvert(false); }
    document.addEventListener('mousedown', dehors);
    window.addEventListener('keydown', echap);
    return () => {
      document.removeEventListener('mousedown', dehors);
      window.removeEventListener('keydown', echap);
    };
  }, [menuOuvert]);

  const estMobile = useEstMobile();
  const [tiroirOuvert, setTiroirOuvert] = useState(false);
  useEffect(() => { setMenuOuvert(false); setTiroirOuvert(false); }, [location.pathname]);
  useEffect(() => { if (!estMobile) setTiroirOuvert(false); }, [estMobile]);
  useEffect(() => {
    if (!tiroirOuvert) return;
    function echap(e: KeyboardEvent) { if (e.key === 'Escape') setTiroirOuvert(false); }
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [tiroirOuvert]);
  const [collapsedPref, setCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });

  function toggleSidebar() {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* navigation privee */ }
      return next;
    });
  }

  // Sur mobile le menu est un tiroir plein : jamais replie.
  const collapsed = collapsedPref && !estMobile;
  const nom = profil?.nom ?? email ?? '';
  const liens = [
    { to: '/', label: 'Tableau de bord', icon: <IconDashboard />, visible: true, end: true },
    { to: '/moderation', label: 'Confiance', icon: <IconShield />, visible: peutModerer(roles) || peutVoirLitiges(roles) },
    { to: '/kyc', label: 'KYC', icon: <IconId />, visible: peutVoirKyc(roles) },
    { to: '/transactions', label: 'Transactions', icon: <IconExchange />, visible: peutVoirTransactions(roles) },
    { to: '/avis', label: 'Avis', icon: <IconStar />, visible: peutModerer(roles) },
    { to: '/tarification', label: 'Tarification', icon: <IconTag />, visible: peutGererAdmins(roles) || peutGererCorridors(roles) },
    { to: '/emails', label: 'Emails', icon: <IconWmail />, visible: peutEnvoyerEmails(roles) },
    { to: '/audit', label: 'Audit', icon: <IconLock />, visible: peutGererAdmins(roles) },
  ];
  const accesAdmin = peutGererAdmins(roles) || !!profil?.peut_inviter;

  return (
    <div className={`layout ${estMobile ? 'is-mobile' : ''}`}>
      {estMobile && (
        <header className="mobile-topbar">
          <button className="icon-button" onClick={() => setTiroirOuvert(true)} aria-label="Ouvrir le menu" aria-expanded={tiroirOuvert}>
            <IconMenu />
          </button>
          <span className="mobile-topbar-brand"><img src={brandMark} alt="" /><span className="sidebar-wordmark">WONJO</span></span>
          <button className="mobile-topbar-me" onClick={() => setProfilOuvert(true)} aria-label="Mon profil">
            <Avatar src={profil?.avatar_url} nom={nom} size={32} />
          </button>
        </header>
      )}
      <AnimatePresence>
        {estMobile && tiroirOuvert && (
          <motion.div
            className="sidebar-backdrop"
            onClick={() => setTiroirOuvert(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </AnimatePresence>
      <motion.nav
        className={`sidebar ${collapsed ? 'collapsed' : ''} ${estMobile ? 'sidebar--tiroir' : ''}`}
        initial={false}
        animate={estMobile ? { width: 272, x: tiroirOuvert ? 0 : -290 } : { width: collapsed ? 76 : 248, x: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        aria-hidden={estMobile && !tiroirOuvert ? true : undefined}
      >
        <div className="sidebar-head">
          <span className="sidebar-logo"><img src={brandMark} alt="Wonjo" /></span>
          {!collapsed && <span className="sidebar-wordmark">WONJO</span>}
          {estMobile ? (
            <button className="icon-button" onClick={() => setTiroirOuvert(false)} title="Fermer le menu" aria-label="Fermer le menu">
              <IconClose />
            </button>
          ) : (
            <button
              className="icon-button"
              onClick={toggleSidebar}
              title={collapsed ? 'Déplier le menu' : 'Replier le menu'}
              aria-label={collapsed ? 'Déplier le menu' : 'Replier le menu'}
            >
              {collapsed ? <IconPanelOpen /> : <IconPanelClose />}
            </button>
          )}
        </div>

        <div className="sidebar-nav">
          {liens.filter((l) => l.visible).map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} title={collapsed ? l.label : undefined} className="nav-link">
              <span className="nav-icon">{l.icon}</span>
              {!collapsed && <span className="nav-label">{l.label}</span>}
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
          <div className="sidebar-me-wrap" ref={menuRef}>
            <AnimatePresence>
              {menuOuvert && (
                <motion.div
                  className={`me-menu ${collapsed ? 'is-collapsed' : ''}`}
                  role="menu"
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.97 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                >
                  <button className="me-menu-item" role="menuitem" onClick={() => { setMenuOuvert(false); setProfilOuvert(true); }}>
                    <span className="nav-icon"><IconUser /></span>
                    <span>
                      <b>Mon profil</b>
                      <small>Photo et pseudo</small>
                    </span>
                  </button>
                  {accesAdmin && (
                    <button className="me-menu-item" role="menuitem" onClick={() => { setMenuOuvert(false); navigate('/admins'); }}>
                      <span className="nav-icon"><IconUsers /></span>
                      <span>
                        <b>Équipe et accès</b>
                        <small>{peutGererAdmins(roles) ? 'Rôles et invitations' : 'Inviter un collaborateur'}</small>
                      </span>
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            <button className={`sidebar-me ${menuOuvert ? 'is-open' : ''}`} onClick={() => setMenuOuvert((o) => !o)} aria-haspopup="menu" aria-expanded={menuOuvert} title="Mon compte">
              <Avatar src={profil?.avatar_url} nom={nom} size={collapsed ? 36 : 38} />
              {!collapsed && (
                <>
                  <span className="sidebar-me-text">
                    <span className="sidebar-me-name">{nom}</span>
                    <span className="sidebar-me-roles">
                      {roles.map((r) => <span key={r} className="badge badge-teal">{LABELS_ROLES[r]}</span>)}
                    </span>
                  </span>
                  <span className="sidebar-me-chevron"><IconChevronUp /></span>
                </>
              )}
            </button>
          </div>
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

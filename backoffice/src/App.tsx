import { lazy, type ComponentType, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth, type AdminRole } from './auth/AuthContext';
import { LoginPage } from './auth/LoginPage';
import { SetPasswordPage } from './auth/SetPasswordPage';
import { MfaEnrollPage } from './auth/MfaEnrollPage';
import { MfaChallengePage } from './auth/MfaChallengePage';
import { Layout } from './components/Layout';
import {
  peutEnvoyerEmails, peutGererAdmins, peutGererCorridors, peutModerer, peutVoirKyc, peutVoirLitiges,
} from './lib/permissions';

// Pages chargees a la demande : les ecrans de connexion n'embarquent plus
// recharts ni le reste du back-office (bundle unique de 1,1 Mo avant).
function page<K extends string>(charger: () => Promise<Record<K, ComponentType>>, nom: K) {
  return lazy(() => charger().then((m) => ({ default: m[nom] })));
}
const DashboardPage = page(() => import('./pages/DashboardPage'), 'DashboardPage');
const ModerationPage = page(() => import('./pages/ModerationPage'), 'ModerationPage');
const TransactionsPage = page(() => import('./pages/TransactionsPage'), 'TransactionsPage');
const AvisPage = page(() => import('./pages/AvisPage'), 'AvisPage');
const KycPage = page(() => import('./pages/KycPage'), 'KycPage');
const AdminsPage = page(() => import('./pages/AdminsPage'), 'AdminsPage');
const JournalPage = page(() => import('./pages/JournalPage'), 'JournalPage');
const EmailsPage = page(() => import('./pages/EmailsPage'), 'EmailsPage');
const TarificationPage = page(() => import('./pages/TarificationPage'), 'TarificationPage');

// Meme regle que le menu (Layout) : une URL tapee a la main (#/admins...)
// renvoie au tableau de bord au lieu d'afficher une page en erreur. Le
// serveur reste la seule vraie protection.
function Protege({ si, children }: { si: (roles: AdminRole[]) => boolean; children: ReactNode }) {
  const { roles } = useAuth();
  return si(roles) ? <>{children}</> : <Navigate to="/" replace />;
}

function Gate() {
  const { status, signOut, profil } = useAuth();

  switch (status) {
    case 'loading':
    case 'checking':
      return <div className="auth-screen"><span className="spinner" role="status" aria-label="Chargement" /></div>;
    case 'signed_out':
      return <LoginPage />;
    case 'need_password_set':
      return <SetPasswordPage />;
    case 'need_mfa_enroll':
      return <MfaEnrollPage />;
    case 'need_mfa_challenge':
      return <MfaChallengePage />;
    case 'unauthorized':
      return (
        <div className="auth-screen">
          <div className="auth-card">
            <h1>Accès refusé</h1>
            <p>Ce compte n'a pas les droits d'administration.</p>
            <button type="button" onClick={() => signOut()}>Se déconnecter</button>
          </div>
        </div>
      );
    case 'authorized':
      return (
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<DashboardPage />} />
              <Route path="moderation" element={<Protege si={(r) => peutModerer(r) || peutVoirLitiges(r)}><ModerationPage /></Protege>} />
              <Route path="transactions" element={<Protege si={peutModerer}><TransactionsPage /></Protege>} />
              <Route path="avis" element={<Protege si={peutModerer}><AvisPage /></Protege>} />
              <Route path="kyc" element={<Protege si={peutVoirKyc}><KycPage /></Protege>} />
              <Route path="admins" element={<Protege si={(r) => peutGererAdmins(r) || !!profil?.peut_inviter}><AdminsPage /></Protege>} />
              <Route path="journal" element={<Protege si={peutGererAdmins}><JournalPage /></Protege>} />
              <Route path="emails" element={<Protege si={peutEnvoyerEmails}><EmailsPage /></Protege>} />
              <Route path="tarification" element={<Protege si={peutGererCorridors}><TarificationPage /></Protege>} />
              <Route path="commissions" element={<Navigate to="/tarification" replace />} />
              <Route path="corridors" element={<Navigate to="/tarification" replace />} />
              <Route path="a-faire" element={<Navigate to="/" replace state={{ tab: 'afaire' }} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      );
  }
}

export function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

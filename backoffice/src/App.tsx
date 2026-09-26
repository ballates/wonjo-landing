import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginPage } from './auth/LoginPage';
import { MfaEnrollPage } from './auth/MfaEnrollPage';
import { MfaChallengePage } from './auth/MfaChallengePage';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { ModerationPage } from './pages/ModerationPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { KycPage } from './pages/KycPage';
import { AdminsPage } from './pages/AdminsPage';
import { JournalPage } from './pages/JournalPage';
import { EmailsPage } from './pages/EmailsPage';
import { CommissionsPage } from './pages/CommissionsPage';

function Gate() {
  const { status } = useAuth();

  switch (status) {
    case 'loading':
    case 'checking':
      return <div className="auth-screen"><span className="spinner" role="status" aria-label="Chargement" /></div>;
    case 'signed_out':
      return <LoginPage />;
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
          </div>
        </div>
      );
    case 'authorized':
      return (
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<DashboardPage />} />
              <Route path="moderation" element={<ModerationPage />} />
              <Route path="transactions" element={<TransactionsPage />} />
              <Route path="kyc" element={<KycPage />} />
              <Route path="admins" element={<AdminsPage />} />
              <Route path="journal" element={<JournalPage />} />
              <Route path="emails" element={<EmailsPage />} />
              <Route path="commissions" element={<CommissionsPage />} />
              <Route path="a-faire" element={<Navigate to="/" replace state={{ tab: 'afaire' }} />} />
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

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';

// Etats du parcours de connexion admin :
//  - signed_out         : pas de session
//  - need_mfa_enroll     : mot de passe correct, mais aucun facteur TOTP verifie -
//                          premiere connexion de cet admin, on l'enrole
//  - need_mfa_challenge  : facteur TOTP deja enrole, code a saisir
//  - checking            : verification admin_est_authentifie() en cours
//  - authorized          : session aal2 + present dans admin_users
//  - unauthorized        : aal2 atteint mais pas admin (ou admin desactive)
export type AuthStatus =
  | 'loading' | 'signed_out' | 'need_mfa_enroll' | 'need_mfa_challenge'
  | 'checking' | 'authorized' | 'unauthorized';

export type AdminRole = 'super_admin' | 'moderation' | 'finance' | 'lecture_seule';

export interface AdminProfil {
  user_id: string;
  role: AdminRole;
  email: string;
  nom_affiche: string | null;
  nom: string;
  avatar_url: string | null;
}

interface AuthState {
  status: AuthStatus;
  error: string | null;
  role: AdminRole | null;
  email: string | null;
  profil: AdminProfil | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMfaState: () => Promise<void>;
  refreshProfil: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [profil, setProfil] = useState<AdminProfil | null>(null);

  async function evaluate() {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setStatus('signed_out');
      setRole(null);
      return;
    }

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === 'aal2') {
      setStatus('checking');
      // admin_mon_profil() renvoie une ligne seulement si le compte est dans
      // admin_users et actif - meme fonction pour confirmer l'acces ET
      // recuperer le role, plutot que deux appels separes.
      const { data, error: rpcError } = await supabase.rpc('admin_mon_profil').maybeSingle();
      const p = data as AdminProfil | null;
      if (rpcError || !p) {
        setStatus('unauthorized');
        setRole(null);
        setProfil(null);
        return;
      }
      setRole(p.role);
      setEmail(p.email);
      setProfil(p);
      setStatus('authorized');
      return;
    }

    // aal1 seulement : faut-il enroler ou juste challenger un facteur existant ?
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = factors?.totp?.find((f) => f.status === 'verified');
    setStatus(verified ? 'need_mfa_challenge' : 'need_mfa_enroll');
  }

  useEffect(() => {
    evaluate();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { evaluate(); });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn(email: string, password: string) {
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      return;
    }
    await evaluate();
  }

  async function refreshProfil() {
    const { data } = await supabase.rpc('admin_mon_profil').maybeSingle();
    if (data) setProfil(data as AdminProfil);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setStatus('signed_out');
    setRole(null);
  }

  return (
    <AuthCtx.Provider value={{ status, error, role, email, profil, signIn, signOut, refreshMfaState: evaluate, refreshProfil }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth doit etre utilise sous AuthProvider');
  return ctx;
}

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';

// Etats du parcours de connexion admin :
//  - signed_out         : pas de session
//  - need_password_set  : session issue du lien d'invitation (admin-inviter),
//                          invitation_confirmee = false - doit choisir son
//                          mot de passe avant toute autre etape (242)
//  - need_mfa_enroll     : mot de passe correct, mais aucun facteur TOTP verifie -
//                          premiere connexion de cet admin, on l'enrole
//  - need_mfa_challenge  : facteur TOTP deja enrole, code a saisir
//  - checking            : verification admin_est_authentifie() en cours
//  - authorized          : session aal2 + present dans admin_users
//  - unauthorized        : aal2 atteint mais pas admin (ou admin desactive)
//  - verification_impossible : le serveur n'a pas repondu (reseau, erreur) - on ne sait pas si
//                          le compte est admin, donc ni « refuse » ni deconnexion
export type AuthStatus =
  | 'loading' | 'signed_out' | 'need_password_set' | 'need_mfa_enroll' | 'need_mfa_challenge'
  | 'checking' | 'authorized' | 'unauthorized' | 'verification_impossible';

export type AdminRole = 'super_admin' | 'moderation' | 'finance' | 'commercial' | 'data' | 'stagiaire' | 'lecture_seule' | 'point_relais';

export interface AdminProfil {
  user_id: string;
  roles: AdminRole[];
  peut_inviter: boolean;
  email: string;
  nom_affiche: string | null;
  nom: string;
  avatar_url: string | null;
}

interface AuthState {
  status: AuthStatus;
  error: string | null;
  roles: AdminRole[];
  email: string | null;
  profil: AdminProfil | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: (message?: string) => Promise<void>;
  refreshMfaState: () => Promise<void>;
  refreshProfil: () => Promise<void>;
}

const INACTIVITE_MAX_MS = 60 * 60 * 1000;
const CLE_ACTIVITE = 'wonjo_bo_derniere_activite';

const AuthCtx = createContext<AuthState | null>(null);

// Jeton expire ou refuse : la session n'est plus valable, ce n'est pas un refus de droits.
function sessionExpiree(err: { status?: number; code?: string; message?: string }): boolean {
  return err.status === 401 || err.code === 'PGRST301' || /jwt|token.*expir|expired|not authenticated/i.test(err.message ?? '');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [profil, setProfil] = useState<AdminProfil | null>(null);
  // Lu dans evaluate() (appele par des callbacks anciens) : etat courant, pas celui de la closure.
  const statusRef = useRef(status);
  statusRef.current = status;

  // Erreur d'un appel de verification : session expiree -> retour a la connexion avec un message
  // clair ; autre erreur (reseau...) -> on ne conclut rien sur les droits de la personne.
  async function refuserSansDroits(err: { status?: number; code?: string; message?: string }) {
    if (sessionExpiree(err)) {
      await supabase.auth.signOut({ scope: 'local' });
      setError('Votre session a expiré. Reconnectez-vous.');
      setStatus('signed_out');
    } else {
      setStatus('verification_impossible');
    }
    setRoles([]);
    setProfil(null);
  }

  async function evaluate() {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setStatus('signed_out');
      setRoles([]);
      return;
    }

    // Session d'invitation (admin-inviter) : la personne n'a pas encore
    // choisi de mot de passe. A verifier avant l'aal, qu'elle n'atteindra
    // jamais tant qu'elle n'a pas de facteur MFA de toute facon, pour lui
    // presenter le bon ecran plutot que l'enrolement MFA en premier (242).
    const { data: enAttente } = await supabase.rpc('admin_invitation_en_attente');
    if (enAttente) {
      setStatus('need_password_set');
      return;
    }

    // Compte de l'app sans acces admin : refuse ici, avant tout ecran MFA -
    // sinon n'importe quel membre pouvait activer une 2FA sur son compte
    // depuis le back-office avant d'etre refuse (284).
    const { data: eligible, error: eligibleError } = await supabase.rpc('admin_compte_eligible');
    if (eligibleError) {
      await refuserSansDroits(eligibleError);
      return;
    }
    if (!eligible) {
      setStatus('unauthorized');
      setRoles([]);
      setProfil(null);
      return;
    }

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === 'aal2') {
      // Deja autorise : re-verification silencieuse. Passer par 'checking'
      // demonterait tout le back-office (Gate affiche un spinner) et
      // fermerait la fiche ouverte a chaque retour sur l'onglet, car
      // Supabase emet un evenement d'auth au retour de focus.
      if (statusRef.current !== 'authorized') setStatus('checking');
      // admin_mon_profil() renvoie une ligne seulement si le compte est dans
      // admin_users et actif - meme fonction pour confirmer l'acces ET
      // recuperer le role, plutot que deux appels separes.
      const { data, error: rpcError } = await supabase.rpc('admin_mon_profil').maybeSingle();
      const p = data as AdminProfil | null;
      if (rpcError) {
        await refuserSansDroits(rpcError);
        return;
      }
      if (!p) {
        setStatus('unauthorized');
        setRoles([]);
        setProfil(null);
        return;
      }
      setRoles(p.roles);
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

  // Deconnexion apres 1h sans activite. La derniere activite est partagee via
  // localStorage : plusieurs onglets comptent comme une seule session, et un
  // onglet rouvert apres plus d'1h est deconnecte des le retour.
  useEffect(() => {
    if (status === 'loading' || status === 'signed_out') return;

    const lire = () => {
      try { return Number(localStorage.getItem(CLE_ACTIVITE)) || Date.now(); } catch { return Date.now(); }
    };
    const ecrire = () => {
      try { localStorage.setItem(CLE_ACTIVITE, String(Date.now())); } catch { /* stockage indisponible */ }
    };
    const verifier = () => {
      if (Date.now() - lire() >= INACTIVITE_MAX_MS) {
        try { localStorage.removeItem(CLE_ACTIVITE); } catch { /* idem */ }
        signOut('Vous avez été déconnecté après une heure d\'inactivité.');
      }
    };

    // Premiere verification avant d'ecrire : sinon le chargement de la page
    // effacerait l'inactivite accumulee pendant que l'onglet etait ferme.
    verifier();
    try { if (!localStorage.getItem(CLE_ACTIVITE)) ecrire(); } catch { /* idem */ }

    let dernierEcrit = 0;
    const surActivite = () => {
      const now = Date.now();
      if (now - dernierEcrit < 5000) return;
      dernierEcrit = now;
      ecrire();
    };
    const surVisibilite = () => { if (document.visibilityState === 'visible') verifier(); };

    const evenements = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'] as const;
    evenements.forEach((e) => window.addEventListener(e, surActivite, { passive: true }));
    document.addEventListener('visibilitychange', surVisibilite);
    const timer = window.setInterval(verifier, 30_000);
    return () => {
      evenements.forEach((e) => window.removeEventListener(e, surActivite));
      document.removeEventListener('visibilitychange', surVisibilite);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status === 'loading' || status === 'signed_out']);

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

  async function signOut(message?: string) {
    try { localStorage.removeItem(CLE_ACTIVITE); } catch { /* stockage indisponible */ }
    // 'local' : sans cela signOut() est GLOBAL et revoque toutes les sessions du compte,
    // y compris celle de l'application sur le telephone.
    await supabase.auth.signOut({ scope: 'local' });
    setError(message ?? null);
    setStatus('signed_out');
    setRoles([]);
  }

  return (
    <AuthCtx.Provider value={{ status, error, roles, email, profil, signIn, signOut, refreshMfaState: evaluate, refreshProfil }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth doit etre utilise sous AuthProvider');
  return ctx;
}

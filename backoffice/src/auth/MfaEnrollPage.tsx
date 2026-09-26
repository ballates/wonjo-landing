import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { AuthShell } from '../components/AuthShell';

// Premiere connexion d'un admin : aucun facteur TOTP verifie sur son compte.
// La MFA est obligatoire (admin_est_authentifie() exige aal2) - il n'y a pas
// de chemin qui saute cet ecran.
export function MfaEnrollPage() {
  const { refreshMfaState, signOut } = useAuth();
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    async function start() {
      // Un rechargement de cet ecran avant validation laisse un facteur
      // "unverified" en base ; supabase.auth.mfa.enroll() refuse d'en
      // recreer un avec le meme nom (vide) tant que l'ancien traine.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      const pending = existing?.totp.filter((f) => (f.status as string) === 'unverified') ?? [];
      await Promise.all(pending.map((f) => supabase.auth.mfa.unenroll({ factorId: f.id })));

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (enrollError) {
        setError(enrollError.message);
        return;
      }
      setFactorId(data.id);
      setQrSvg(data.totp.qr_code);
    }
    start();
  }, []);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setVerifying(true);
    setError(null);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) throw verifyError;
      await refreshMfaState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Code invalide');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <AuthShell>
      <form
        className="auth-card"
        onSubmit={handleVerify}
      >
        <h1>Activer la double authentification</h1>
        <p>Obligatoire pour tout accès au back-office. Scanne ce code avec Google Authenticator, 1Password ou équivalent.</p>
        {qrSvg && <div className="mfa-qr"><img src={qrSvg} alt="QR code à scanner avec ton authenticator" /></div>}
        <label>
          Code à 6 chiffres
          <input
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            required
            autoFocus
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={verifying || code.length !== 6}>
          {verifying ? 'Vérification…' : 'Confirmer'}
        </button>
        <button type="button" className="auth-secondary" onClick={() => signOut()}>Annuler</button>
      </form>
    </AuthShell>
  );
}

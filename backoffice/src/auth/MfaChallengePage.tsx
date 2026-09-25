import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

export function MfaChallengePage() {
  const { refreshMfaState, signOut } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      const factor = factors.totp.find((f) => f.status === 'verified');
      if (!factor) throw new Error('Aucun facteur MFA vérifié trouvé');

      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) throw verifyError;

      await refreshMfaState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Code invalide');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Code de vérification</h1>
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
        <button type="submit" disabled={loading || code.length !== 6}>
          {loading ? 'Vérification…' : 'Valider'}
        </button>
        <button type="button" className="auth-secondary" onClick={() => signOut()}>Annuler</button>
      </form>
    </div>
  );
}

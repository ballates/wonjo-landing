import { useState } from 'react';
import { useAuth } from './AuthContext';
import { AuthShell } from '../components/AuthShell';
import { ChampMotDePasse } from '../components/ChampMotDePasse';

export function LoginPage() {
  const { signIn, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email, password);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
        <form className="auth-card" onSubmit={handleSubmit}>
          <h1>Connexion</h1>
          <p>Connectez-vous au back-office Wonjo.</p>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <label>
            Mot de passe
            <ChampMotDePasse value={password} onChange={setPassword} required />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" disabled={loading}>{loading ? 'Connexion…' : 'Se connecter'}</button>
        </form>
    </AuthShell>
  );
}

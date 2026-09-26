import { useState } from 'react';
import { useAuth } from './AuthContext';
import { AuthShell } from '../components/AuthShell';

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
          <h1>Connexion à votre compte Wonjo</h1>
          <p>Identifiez-vous pour vous connecter à votre compte Wonjo.</p>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <label>
            Mot de passe
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" disabled={loading}>{loading ? 'Connexion…' : 'Se connecter'}</button>
        </form>
    </AuthShell>
  );
}

import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { AuthShell } from '../components/AuthShell';

// Premier ecran d'un admin invite (admin-inviter) : la session vient du lien
// recu par email, mais ni mot de passe ni nom ne sont encore renseignes, et
// invitation_confirmee reste a false tant que ce formulaire n'a pas ete
// valide (242, prenom/nom ajoutes en 249). C'est cette validation, et elle
// seule, qui fait passer l'admin de "En attente" a "Actif" dans AdminsPage.
export function SetPasswordPage() {
  const { refreshMfaState, signOut } = useAuth();
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!prenom.trim() || !nom.trim()) {
      setError('Prénom et nom sont obligatoires.');
      return;
    }
    if (password.length < 8) {
      setError('8 caractères minimum.');
      return;
    }
    if (password !== confirmation) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      const { error: rpcError } = await supabase.rpc('admin_confirmer_invitation', {
        p_prenom: prenom.trim(),
        p_nom: nom.trim(),
      });
      if (rpcError) throw rpcError;
      await refreshMfaState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de la création du mot de passe');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Créer votre compte</h1>
        <p>Dernière étape avant l'activation de la double authentification.</p>
        <label>
          Prénom
          <input type="text" value={prenom} onChange={(e) => setPrenom(e.target.value)} required autoFocus />
        </label>
        <label>
          Nom
          <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} required />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>
        <label>
          Confirmer le mot de passe
          <input
            type="password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            minLength={8}
            required
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? 'Enregistrement…' : 'Continuer'}</button>
        <button type="button" className="auth-secondary" onClick={() => signOut()}>Annuler</button>
      </form>
    </AuthShell>
  );
}

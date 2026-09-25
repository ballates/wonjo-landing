# Back-office Wonjo

SPA (Vite + React + TypeScript) servie sur `wonjo.app/backoffice/`, qui
parle directement à Supabase (Auth + RPC) — aucun serveur applicatif,
aucun hébergeur en plus de GitHub Pages. Voir `migrations/212_socle_admin_backoffice.sql`
dans le dépôt `wonjo` pour tout le socle serveur (tables, RPC, sécurité).

## Sécurité

Deux verrous, tous les deux obligatoires :
1. **Liste blanche** — le compte doit exister dans `admin_users` (table
   `wonjo`, alimentée à la main par SQL Editor, aucune auto-inscription).
2. **MFA (TOTP) obligatoire** — la RPC `admin_est_authentifie()` exige une
   session `aal2`. Impossible d'accéder à quoi que ce soit sans avoir
   enrôlé un authenticator (l'appli guide dedans à la première connexion).

Aucune donnée sensible n'est lue directement (pas de `.from('profiles')...`)
: tout passe par des RPC `admin_*` qui vérifient elles-mêmes l'accès. Les
policies RLS de l'appli mobile ne sont jamais modifiées pour ce chantier.

## Rôles

| Rôle | Voit | Peut agir |
|------|------|-----------|
| `super_admin` | tout | tout, y compris gérer les admins/rôles |
| `moderation` | dashboard opérationnel (hors €), signalements, litiges, KYC | traiter signalements, bloquer/débloquer un compte |
| `finance` | dashboard chiffres (€) uniquement | aucune |
| `lecture_seule` | dashboard opérationnel (hors €) uniquement | aucune |

Appliqué côté serveur (migration 213, `admin_a_le_role()`) — les masquages
dans l'UI (`lib/permissions.ts`) ne sont que du confort d'affichage.

## Créer le tout premier compte admin (super_admin)

Le tout premier compte ne peut pas s'inviter lui-même (il faut déjà être
`super_admin` pour inviter). Une seule fois, à la main :

1. Créer un utilisateur Supabase normal (dashboard Auth, ou inscription
   classique côté app mobile avec un email dédié).
2. `INSERT INTO admin_users (user_id, role) VALUES ('<uuid>', 'super_admin');`
   via le SQL Editor.
3. Se connecter sur `/backoffice/` avec cet email + mot de passe : l'appli
   demande automatiquement l'enrôlement MFA à la première connexion.

## Inviter d'autres admins

Une fois connecté en `super_admin`, page **Administrateurs** → formulaire
d'invitation (email + rôle). Ça appelle l'Edge Function `admin-inviter`
(dépôt `wonjo`, service_role — crée le compte Auth et envoie l'email
d'invitation via `send-auth-email`/Resend). La personne invitée reçoit un
email, choisit son mot de passe, puis l'appli lui demande l'enrôlement MFA
comme pour n'importe quel admin. Aucune inscription libre : uniquement par
invitation d'un `super_admin` existant.

## Développement local

```bash
cd backoffice
npm install
cp .env.example .env.local   # renseigner VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
```

## Déploiement

Automatique via `.github/workflows/pages.yml` à chaque push sur `main`.
Secrets de dépôt requis (Settings → Secrets and variables → Actions) :
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (la clé anon est publique par
design, elle finit de toute façon dans le bundle JS livré au navigateur).

**Étape manuelle unique** : Settings → Pages → Source → passer de
"Deploy from a branch" à "GitHub Actions", sinon ce workflow tourne mais
rien ne se publie.

## Hors périmètre (noté pour plus tard)

Portail SSO pour entreprises de transport (>23/50 kg), facturation SaaS —
géré par un second modèle de rôles (`partner_users` ou équivalent) le jour
venu, jamais mélangé à `admin_users`.

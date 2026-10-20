# Back-office Wonjo

SPA (Vite + React + TypeScript) servie sur `wonjo.app/backoffice/`, qui
parle directement à Supabase (Auth + RPC) - aucun serveur applicatif,
aucun hébergeur en plus de GitHub Pages. Voir `migrations/212_socle_admin_backoffice.sql`
dans le dépôt `wonjo` pour tout le socle serveur (tables, RPC, sécurité).

## Sécurité

Deux verrous, tous les deux obligatoires :
1. **Liste blanche** - le compte doit exister dans `admin_users` (table
   `wonjo`, alimentée à la main par SQL Editor, aucune auto-inscription).
2. **MFA (TOTP) obligatoire** - la RPC `admin_est_authentifie()` exige une
   session `aal2`. Impossible d'accéder à quoi que ce soit sans avoir
   enrôlé un authenticator (l'appli guide dedans à la première connexion).

Aucune donnée sensible n'est lue directement (pas de `.from('profiles')...`)
: tout passe par des RPC `admin_*` qui vérifient elles-mêmes l'accès. Les
policies RLS de l'appli mobile ne sont jamais modifiées pour ce chantier.

### Garde-fous ajoutés après l'audit du 19 octobre 2026

1. **Session par onglet.** La session vit dans `sessionStorage`, pas `localStorage` : le back-office est sur la même origine (wonjo.app) que le
   site vitrine et l'éditeur des textes juridiques, qui chargent des scripts tiers ; `localStorage` leur serait lisible. Un nouvel onglet demande
   donc de se reconnecter (mot de passe + code TOTP). Les anciens jetons restés dans `localStorage` sont effacés au chargement.
2. **Alertes e-mail** aux super administrateurs (`alerte-commission`, migration 435) pour : comptes administrateurs, commissions, paiement d'un
   voyageur par la finance, litiges (ouverture, demande, refus, versement, remboursement), contestation bancaire, contrepassation de caisse,
   validation manuelle de KYC, suppression de compte ou de point relais, e-mails de masse, interrupteurs des points relais. Les consultations de
   données personnelles (coordonnées, conversations, photos) alertent à partir de la 10e en une heure pour un même administrateur.
3. **Verser un litige au voyageur = deux administrateurs** (migration 436). Un administrateur finance ou super admin fait la demande, un
   **autre** la valide (« Versements à valider », onglet Litiges). Il faut donc au moins deux comptes finance ou super admin actifs.
4. **Liens des e-mails de masse** limités à wonjo.app, l'App Store et Google Play, dans le bouton comme dans le texte
   (`_shared/liens-autorises.ts`, testé avec `deno test`).
5. **Photos des transactions** : motif obligatoire et ligne au journal (migration 437), comme la lecture d'une conversation.

## Rôles

Hiérarchie (migration 438, `docs/ROLES_BACKOFFICE.md` du dépôt wonjo) : un rôle parent a tous les droits de ses enfants.

```
                    Admin  (super_admin, 5 au plus)
          ┌───────────┼───────────┬──────────────┐
      Sécurité      Finance    Commercial     Réseau
          └───────────┼───────────┘              │
                   Lecture                 Agent relais
```

| Rôle | Code | Voit et fait en propre |
|------|------|-----------|
| Admin | `super_admin` | tout ; seul à gérer les administrateurs, la tarification, les interrupteurs, les suppressions |
| Sécurité | `moderation` | comptes, KYC, signalements, avis, conversations et photos avec motif, litiges (suivi) |
| Finance | `finance` | transactions, paiements, marges, litiges (trancher), caisses, voyageurs à payer |
| Commercial | `commercial` | e-mails et campagnes (adresses des membres masquées) |
| Lecture | `lecture` | tableaux de bord agrégés, sans donnée personnelle |
| Réseau | `reseau` | tous les points relais et leurs agents, sans argent ni suppression |
| Agent relais | `point_relais` | ses points relais, selon ses permissions par point |

Côté serveur, `admin_a_le_role()` regarde les rôles **effectifs** (attribués + hérités) ; `admin_mon_profil()` les renvoie au
front (`roles`), avec les rôles attribués (`roles_attribues`). Les masquages de l'UI (`lib/permissions.ts`) ne sont que de
l'affichage. Une invitation déléguée n'attribue que des rôles que l'invitant possède.

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
(dépôt `wonjo`, service_role - crée le compte Auth et envoie l'email
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

Portail SSO pour entreprises de transport (>23/50 kg), facturation SaaS -
géré par un second modèle de rôles (`partner_users` ou équivalent) le jour
venu, jamais mélangé à `admin_users`.

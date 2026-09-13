# Édition des textes juridiques (wonjo.app/admin)

Interface d'édition des CGU et de la Politique de confidentialité, destinée à
une personne qui ne touche ni au code ni à la base.

Elle est servie par ce site, mais **elle écrit dans le dépôt applicatif**
`Wonjo-app/wonjo`, dossier `legal/` — c'est là que vit la source de vérité.
Voir `legal/README.md` dans ce dépôt pour la chaîne complète.

## Ce que fait l'interface

Enregistrer **ne publie rien**. Chaque enregistrement ouvre une *pull request*
sur le dépôt applicatif, qui doit être relue puis fusionnée.

Rendre une version active en base est une troisième étape, manuelle : le
workflow **Juridique** du dépôt applicatif, lancé à la main. C'est volontaire —
activer une version rebloque tous les utilisateurs sur l'écran d'acceptation au
prochain lancement de l'application.

```
édition ──► pull request ──► fusion ──► publication manuelle ──► base + site
```

## Reste à mettre en place

L'authentification. GitHub Pages ne sert que des fichiers statiques : il n'y a
pas de serveur pour porter l'échange OAuth avec GitHub. Il faut donc un petit
proxy, et faire pointer `base_url` de `config.yml` dessus (actuellement
`https://auth.wonjo.app`, qui n'existe pas encore).

Deux options, sans frais :

- **Cloudflare Worker** — une cinquantaine de lignes, plusieurs implémentations
  publiques prêtes à l'emploi pour Decap. C'est le chemin le plus court si le
  domaine est déjà chez Cloudflare.
- **Héberger le proxy ailleurs** (Deno Deploy, Vercel) et pointer un
  sous-domaine dessus.

Il faut aussi créer une **OAuth App GitHub** (Settings → Developer settings →
OAuth Apps) avec l'URL de callback du proxy, et donner au service juridique un
accès en écriture au dépôt applicatif.

**Tant que ce proxy n'existe pas**, l'interface ne peut pas authentifier : les
textes s'éditent par pull request directement sur GitHub. Toute la chaîne en
aval (vérification, génération du site, publication) fonctionne déjà.

## Un point de vigilance

Les fichiers de `legal/` sont du markdown **brut**, sans en-tête de métadonnées.
C'est ce qui permet de comparer octet par octet ce qui est en base et ce qui est
dans le dépôt, et donc de prouver le texte exact accepté par un utilisateur.

Si Decap venait à écrire un bloc `---` en tête de fichier, la vérification
`node scripts/legal-sync.mjs --archive` échoue avec un message explicite, et la
CI bloque la pull request. Rien ne peut atteindre la base ni les utilisateurs
dans cet état — mais il faudra alors ajuster la configuration.

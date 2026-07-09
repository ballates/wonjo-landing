# Suivi des visites - Cloudflare Web Analytics

Le site Wonjo utilise **Cloudflare Web Analytics** pour suivre les visites
(visites, pages vues, pays, sources de trafic, etc.).

## Pourquoi Cloudflare Web Analytics
- Gratuit et illimité.
- Sans cookie → **pas de bandeau de consentement RGPD** nécessaire.
- Léger : script en `defer`, aucun impact notable sur la vitesse.
- Pas besoin d'héberger le domaine chez Cloudflare (méthode « beacon »).

## Où voir les statistiques
Tableau de bord : https://dash.cloudflare.com → **Analytics & Logs → Web Analytics**
- Site / hostname suivi : `wonjo.app`
- Les données apparaissent quelques minutes après les premières visites
  (jusqu'à ~30 min lors du tout premier déploiement).

## Intégration technique
Le beacon est inséré dans le `<head>` de `index.html`, juste après
`<link rel="stylesheet" href="/assets/css/base.css">` :

```html
<!-- Cloudflare Web Analytics -->
<script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "04905a034889453cbc7b1cf5f2e09d13"}'></script>
<!-- End Cloudflare Web Analytics -->
```

- **Token / site tag** : `04905a034889453cbc7b1cf5f2e09d13`
  (identifiant public lié au site dans Cloudflare ; à régénérer côté Cloudflare
  si le site est recréé).

## À savoir
- Le suivi ne fonctionne que sur le **site publié** (pas en local).
- Certains bloqueurs de pub (uBlock, etc.) peuvent bloquer le beacon : les
  chiffres peuvent donc être légèrement sous-estimés (normal pour tout outil
  d'analytics).

_Mis en place le 2026-06-29._

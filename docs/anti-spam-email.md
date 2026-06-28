# Protection anti-spam de l'adresse de contact

Pour réduire les spams (« demandes de collaboration », guest posts, services SEO…),
l'adresse `contact@wonjo.app` n'apparaît plus **en clair** dans le code de la page.
Les robots aspirateurs d'emails parcourent le HTML brut et revendent toute adresse
écrite en clair à des listes de spam : c'était la source principale.

## Ce qui a été fait dans `index.html`

1. **Boutons « Nous contacter »** (sections offres) — les `mailto:` en clair sont
   remplacés par des liens masqués :
   ```html
   <a href="#" class="price-cta ghost" data-mail data-user="contact" data-domain="wonjo.app">Nous contacter</a>
   ```

2. **Pied de page** — affichait l'email en clair (texte ET lien). Remplacé par un
   lien masqué qui révèle l'adresse seulement après chargement JS (`data-show`) :
   ```html
   <a href="#" data-mail data-show data-user="contact" data-domain="wonjo.app">Nous écrire</a>
   ```

3. **Données structurées SEO (JSON-LD)** — suppression du champ `"email"` de
   l'`Organization` qui exposait l'adresse à Google et aux aspirateurs.

4. **Script de reconstruction** (en haut du `<script>` principal en fin de page) :
   ```js
   // Email masqué (anti-spam) : reconstruit l'adresse au chargement
   document.querySelectorAll('a[data-mail]').forEach(function (a) {
     var addr = a.dataset.user + '@' + a.dataset.domain;
     a.setAttribute('href', 'mailto:' + addr);
     if (a.hasAttribute('data-show')) a.textContent = addr;
   });
   ```
   `user` et `domain` étant séparés, la chaîne complète `contact@wonjo.app`
   n'existe jamais dans le HTML — les bots ne peuvent pas l'aspirer.

## Pour ajouter un nouveau lien email plus tard

Ne JAMAIS écrire `mailto:contact@wonjo.app` en clair. Utiliser plutôt :
```html
<a href="#" data-mail data-user="contact" data-domain="wonjo.app">Texte du lien</a>
```
Ajouter `data-show` si l'on veut que l'adresse s'affiche comme texte du lien.

## Limites

- Protège contre les **bots** (la source principale), pas contre les spams
  envoyés à la main par des humains qui devinent `contact@…`.
- Le lien nécessite JavaScript ; sans JS, le bouton ne déclenche pas le mail
  (compromis acceptable, quasi tous les visiteurs ont JS activé).

## Complément côté Gmail (filtre)

Créer un filtre Gmail pour les spams résiduels :
1. Barre de recherche → **Afficher les options de recherche**.
2. **Contient les mots** : `collaboration OR "guest post" OR "partnership" OR "SEO" OR backlink`
3. **Créer un filtre** → **Supprimer** (ou **Ignorer la boîte de réception** + libellé « À trier »).
4. Ajuster les mots-clés au fil des spams reçus.

_Mis en place le 2026-06-29._

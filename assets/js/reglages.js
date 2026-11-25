// Boutons de la barre du haut : langue (francais / anglais) et theme (clair / sombre).
// La page est ecrite en francais ; l'anglais remplace chaque texte par sa traduction (EN ci-dessous,
// cle = texte francais, espaces ramenes a un seul). Un texte ajoute a la page sans traduction reste
// en francais : l'ajouter ici. Le choix est garde dans le navigateur (assets/js/boot.js l'applique
// avant l'affichage).
(function () {
  var EN = {
    "Itinéraires": "Routes",
    "Comment ça marche": "How it works",
    "Tarifs": "Pricing",
    "Rejoindre la bêta": "Join the beta",
    "Vos": "Your",
    "colis": "parcels",
    "voyagent avec des personnes de confiance": "travel with people you can trust",
    "Wonjo met en relation expéditeurs et voyageurs en Europe et entre l'Europe et l'Afrique. Jusqu'à 70% d'économies, paiement bloqué jusqu'à la livraison, identités vérifiées.":
      "Wonjo connects senders and travellers within Europe and between Europe and Africa. Up to 70% cheaper, payment held until delivery, verified identities.",
    "Voir les itinéraires": "See the routes",
    "Nos bêta-testeurs": "Our beta testers",
    "testent l'app en ce moment": "are testing the app right now",
    "· livré à votre destinataire": "· delivered to your recipient",
    "Des itinéraires qui rapprochent": "Routes that bring people closer",
    "Exemples d'annonces publiées sur Wonjo.": "Examples of listings published on Wonjo.",
    "Départ": "Departure",
    "jusqu'au 28 nov.": "by 28 Nov",
    "jusqu'au 5 déc.": "by 5 Dec",
    "jusqu'au 30 nov.": "by 30 Nov",
    "27 nov.": "27 Nov", "29 nov.": "29 Nov", "2 déc.": "2 Dec", "3 déc.": "3 Dec", "8 déc.": "8 Dec", "10 déc.": "10 Dec",
    "· 8 colis expédiés": "· 8 parcels sent",
    "· 12 colis expédiés": "· 12 parcels sent",
    "· 3 colis expédiés": "· 3 parcels sent",
    "· 4 trajets effectués": "· 4 trips completed",
    "· 21 trajets effectués": "· 21 trips completed",
    "· 9 trajets effectués": "· 9 trips completed",
    "Prix max.": "Max. price",
    "Transporter ce colis": "Carry this parcel",
    "Enveloppe": "Envelope",
    "Expédier un colis": "Send a parcel",
    "Acheminer cette enveloppe": "Carry this envelope",
    "Bruxelles": "Brussels",
    "Quelques exemples de trajets. Wonjo relie l'Europe et l'Afrique, dans les deux sens, ainsi qu'entre pays européens ou pays africains. D'autres régions seront ouvertes progressivement.":
      "A few example trips. Wonjo links Europe and Africa in both directions, as well as European countries with each other and African countries with each other. Other regions will open over time.",
    "Choisissez votre profil, on s'occupe du reste.": "Choose your profile, we take care of the rest.",
    "Je suis expéditeur": "I'm a sender",
    "Je suis voyageur": "I'm a traveller",
    "Publiez votre annonce de colis": "Post your parcel listing",
    "Poids, destination, valeur déclarée, ou parcourez directement les trajets des voyageurs.":
      "Weight, destination, declared value, or browse travellers' trips directly.",
    "Trouvez un voyageur": "Find a traveller",
    "Contactez un voyageur sur son trajet, ou laissez-les vous contacter sur votre annonce.":
      "Contact a traveller about their trip, or let them contact you about your listing.",
    "Payez en toute sécurité": "Pay securely",
    "Paiement bloqué jusqu'à confirmation de livraison.": "Payment held until delivery is confirmed.",
    "Publiez votre trajet": "Post your trip",
    "Destination, date, kilos disponibles, prix/kg, ou parcourez directement les annonces de colis.":
      "Destination, date, available kilos, price per kg, or browse parcel listings directly.",
    "Échangez avec les expéditeurs": "Talk with senders",
    "Recevez des demandes sur votre trajet, ou contactez les expéditeurs sur leurs annonces de colis.":
      "Receive requests for your trip, or contact senders about their parcel listings.",
    "Gagnez de l'argent": "Earn money",
    "Paiement automatique après livraison confirmée.": "Automatic payment once delivery is confirmed.",
    "La confiance avant tout": "Trust comes first",
    "Chaque étape est vérifiée, de la remise à la livraison.": "Every step is checked, from handover to delivery.",
    "versé avant la livraison": "paid out before delivery",
    "Paiement bloqué": "Payment held",
    "Le voyageur est payé à la livraison": "The traveller is paid on delivery",
    "pour le KYC": "for identity check",
    "Identité vérifiée": "Verified identity",
    "Tous les membres sont vérifiés": "Every member is verified",
    "pour une réponse": "for a reply",
    "Support réactif": "Responsive support",
    "Notre équipe répond sous 24 h": "Our team replies within 24 h",
    "2 j": "2 days",
    "ouvrés pour trancher": "business days to decide",
    "Désaccords réglés": "Disputes settled",
    "Wonjo tranche, preuves à l'appui": "Wonjo decides, based on evidence",
    "Une offre pour chaque besoin": "A plan for every need",
    "Particuliers, expéditeurs professionnels et entreprises de transport": "Individuals, business senders and transport companies",
    "Populaire": "Popular",
    "Disponible": "Available",
    "Particulier": "Individual",
    "Sans abonnement": "No subscription",
    "10 % du prix du transport, payés par l'expéditeur. Aucune commission pour le voyageur.":
      "10% of the transport price, paid by the sender. No commission for the traveller.",
    "Pour les particuliers, expéditeurs comme voyageurs :": "For individuals, senders and travellers alike:",
    "Voyageurs : vous gardez 100 % de vos gains": "Travellers: you keep 100% of your earnings",
    "Paiement bloqué jusqu'à la livraison": "Payment held until delivery",
    "Identités vérifiées": "Verified identities",
    "Remise et livraison confirmées par QR code, code et photos": "Handover and delivery confirmed by QR code, code and photos",
    "Litiges réglés par Wonjo": "Disputes settled by Wonjo",
    "Jusqu'à 23 kg par envoi": "Up to 23 kg per shipment",
    "Badge Pro et annonces mises en avant": "Pro badge and highlighted listings",
    "Factures téléchargeables": "Downloadable invoices",
    "Support prioritaire": "Priority support",
    "Profil entreprise vérifié": "Verified company profile",
    "Tableau de bord web des demandes": "Web dashboard for requests",
    "Plusieurs utilisateurs pour vos équipes": "Several users for your teams",
    "Bientôt disponible": "Coming soon",
    "Bientôt": "Soon",
    "/mois • 5% par envoi": "/month • 5% per shipment",
    "Pour les expéditeurs professionnels : PME, e-commerçants, commerçants": "For business senders: small businesses, online sellers, shopkeepers",
    "Tableau de bord web multi-envois": "Web dashboard for multiple shipments",
    "5 utilisateurs inclus": "5 users included",
    "Nous contacter": "Contact us",
    "Transporteurs Pro": "Transport Pro",
    "Commission seule": "Commission only",
    "Sans abonnement • commission sur chaque livraison réussie": "No subscription • commission on each successful delivery",
    "Pour les entreprises de transport et de fret qui livrent sur nos itinéraires": "For transport and freight companies delivering on our routes",
    "Colis de plus de 23 kg : cartons, gros volumes, fret": "Parcels over 23 kg: boxes, large volumes, freight",
    "Questions fréquentes": "Frequently asked questions",
    "Tout ce qu'il faut savoir avant d'envoyer ou de transporter un colis.": "Everything you need to know before sending or carrying a parcel.",
    "Comment fonctionne Wonjo ?": "How does Wonjo work?",
    "Wonjo met en relation des expéditeurs qui veulent envoyer un colis et des voyageurs qui ont de la place dans leurs bagages. Le voyageur transporte le colis et le paiement n'est libéré qu'après la livraison confirmée.":
      "Wonjo connects senders who want to send a parcel with travellers who have room in their luggage. The traveller carries the parcel, and the payment is only released once delivery is confirmed.",
    "Mon paiement est-il sécurisé ?": "Is my payment secure?",
    "Oui. Votre paiement est bloqué jusqu'à la livraison et n'est versé au voyageur qu'après sa confirmation, grâce à un code à 4 chiffres. Si le transport n'a pas lieu, vous êtes remboursé selon les conditions générales d'utilisation. Tous les utilisateurs passent une vérification d'identité (KYC).":
      "Yes. Your payment is held until delivery and is only paid to the traveller once delivery is confirmed with a 4-digit code. If the transport does not happen, you are refunded under the terms of use. Every user goes through an identity check (KYC).",
    "Combien coûte un envoi ?": "How much does a shipment cost?",
    "Sans abonnement pour les particuliers. L'expéditeur paie le prix du transport fixé par le voyageur, plus la commission de Wonjo : 10 % de ce prix. Si vous déclarez une valeur de plus de 50 €, des frais liés à cette valeur s'ajoutent. Le montant exact, tout compris, s'affiche avant de payer. Si le transport n'a pas lieu, vous êtes remboursé selon les conditions générales d'utilisation. Le voyageur, lui, garde 100% du prix du transport. Même avec la commission, vous pouvez économiser jusqu'à 70% par rapport aux solutions classiques.":
      "No subscription for individuals. The sender pays the transport price set by the traveller, plus Wonjo's commission: 10% of that price. If you declare a value above 50 €, fees based on that value are added. The exact amount, all included, is shown before you pay. If the transport does not happen, you are refunded under the terms of use. The traveller keeps 100% of the transport price. Even with the commission, you can save up to 70% compared with traditional options.",
    "Quels trajets sont disponibles ?": "Which routes are available?",
    "Des envois entre l'Europe et l'Afrique, dans les deux sens, entre pays européens, entre villes françaises et entre pays africains : la France, la Belgique, la Suisse, le Royaume-Uni, l'Allemagne, l'Italie, l'Espagne et le Luxembourg sont connectés à l'Afrique de l'Ouest, Centrale, de l'Est, australe et du Nord, avec de nouveaux itinéraires ajoutés régulièrement.":
      "Shipments between Europe and Africa in both directions, between European countries, between French cities and between African countries: France, Belgium, Switzerland, the United Kingdom, Germany, Italy, Spain and Luxembourg are connected to West, Central, East, Southern and North Africa, with new routes added regularly.",
    "Comment devenir voyageur et gagner de l'argent ?": "How do I become a traveller and earn money?",
    "Inscrivez-vous, vérifiez votre identité et enregistrez votre moyen de versement, puis publiez votre trajet avec l'espace disponible et votre prix au kilo. Vous êtes payé après chaque livraison confirmée.":
      "Sign up, verify your identity and add your payout method, then post your trip with the space available and your price per kilo. You are paid after each confirmed delivery.",
    "Que se passe-t-il en cas de litige ?": "What happens if there is a dispute?",
    "Un système de litige intégré vous permet de trouver un accord avec l'autre partie. Sans accord, Wonjo tranche sous 2 jours ouvrés. Les photos de remise et de livraison servent de preuve en cas de problème.":
      "A built-in dispute system lets you reach an agreement with the other party. Without agreement, Wonjo decides within 2 business days. Handover and delivery photos serve as evidence if something goes wrong.",
    "Quand l'application sera-t-elle disponible ?": "When will the app be available?",
    "Wonjo est en bêta. Rejoignez la liste d'attente pour faire partie des premiers utilisateurs : l'application arrive bientôt sur iOS et Android.":
      "Wonjo is in beta. Join the waiting list to be among the first users: the app is coming soon to iOS and Android.",
    "Rejoignez la bêta en avant-première": "Get early access to the beta",
    "Soyez parmi les premiers à utiliser Wonjo": "Be among the first to use Wonjo",
    "Prénom": "First name",
    "Je m'inscris": "Sign me up",
    "Disponible sur iOS et Android prochainement": "Coming soon to iOS and Android",
    "Merci !": "Thank you!",
    "Vous recevrez un email avec les instructions pour rejoindre la bêta.": "You will receive an email with instructions to join the beta.",
    "Vos colis voyagent avec des personnes de confiance.": "Your parcels travel with people you can trust.",
    "Produit": "Product",
    "Bêta": "Beta",
    "Légal": "Legal",
    "Mentions légales": "Legal notice",
    "CGU": "Terms of use",
    "CGV": "Terms of sale",
    "Confidentialité": "Privacy",
    "Nous écrire": "Write to us",
    "Ouvrir le menu": "Open the menu",
    "Fermer le menu": "Close the menu",
    "Carte des trajets en Europe et entre l'Europe et l'Afrique : Paris-Dakar, Marseille-Casablanca, Paris-Marseille, Lyon-Abidjan, Kinshasa-Bruxelles, Casablanca-Marseille, Paris-N'Djamena, Bruxelles-Paris, un avion suit chaque trajet a tour de role":
      "Map of trips within Europe and between Europe and Africa: Paris-Dakar, Marseille-Casablanca, Paris-Marseille, Lyon-Abidjan, Kinshasa-Brussels, Casablanca-Marseille, Paris-N'Djamena, Brussels-Paris, a plane follows each trip in turn",
    "Cartes précédentes": "Previous cards",
    "Cartes suivantes": "Next cards",
    "Pagination des itinéraires": "Route pages",
    "Inscription confirmée": "Sign-up confirmed",
    "Revenir en haut de page": "Back to top",
    "Logo Wonjo": "Wonjo logo",
    "Wonjo - Envoi de colis entre particuliers · Europe & Afrique": "Wonjo - Peer-to-peer parcel delivery · Europe & Africa",
    "Merci": "Thank you",
    "Aller à la carte": "Go to card",
    "Passer en mode sombre": "Switch to dark mode",
    "Passer en mode clair": "Switch to light mode"
  };

  var racine = document.documentElement;
  var ATTRIBUTS = ['aria-label', 'alt', 'title', 'placeholder'];
  var origines = new WeakMap();
  var cle = function (t) { return t.replace(/\s+/g, ' ').trim(); };

  function noeudsTexte() {
    var liste = [];
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode && n.parentNode.nodeName;
        return p === 'SCRIPT' || p === 'STYLE' || !n.nodeValue.trim() ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    while (w.nextNode()) liste.push(w.currentNode);
    return liste;
  }

  // Traduit (ou remet en francais) tout ce qui est sous la racine : textes et attributs lus par les lecteurs d'ecran.
  function appliquer(langue) {
    noeudsTexte().forEach(function (n) {
      if (!origines.has(n)) origines.set(n, n.nodeValue);
      var fr = origines.get(n);
      if (langue === 'en') {
        var en = EN[cle(fr)];
        if (en) n.nodeValue = fr.match(/^\s*/)[0] + en + fr.match(/\s*$/)[0];
      } else {
        n.nodeValue = fr;
      }
    });
    document.querySelectorAll('[' + ATTRIBUTS.join('],[') + ']').forEach(function (el) {
      if (el.hasAttribute('data-bascule-langue') || el.hasAttribute('data-bascule-theme')) return;
      ATTRIBUTS.forEach(function (a) {
        if (!el.hasAttribute(a)) return;
        var memo = 'data-fr-' + a;
        if (!el.hasAttribute(memo)) el.setAttribute(memo, el.getAttribute(a));
        var fr = el.getAttribute(memo);
        el.setAttribute(a, langue === 'en' && EN[cle(fr)] ? EN[cle(fr)] : fr);
      });
    });
    if (!origines.has(document)) origines.set(document, document.title);
    document.title = langue === 'en' ? (EN[cle(origines.get(document))] || origines.get(document)) : origines.get(document);
    racine.lang = langue;
  }

  window.wonjoTexte = function (fr) { return racine.lang === 'en' && EN[cle(fr)] ? EN[cle(fr)] : fr; };

  function langueCourante() { return racine.lang === 'en' ? 'en' : 'fr'; }
  function themeCourant() { return racine.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }

  function majBoutons() {
    var en = langueCourante() === 'en';
    var sombre = themeCourant() === 'dark';
    document.querySelectorAll('[data-bascule-langue]').forEach(function (b) {
      b.setAttribute('data-actif', en ? '2' : '1');
      b.setAttribute('aria-pressed', String(en));
      b.setAttribute('aria-label', en ? 'Switch to French' : 'Passer en anglais');
      b.title = b.getAttribute('aria-label');
    });
    document.querySelectorAll('[data-bascule-theme]').forEach(function (b) {
      b.setAttribute('data-actif', sombre ? '2' : '1');
      b.setAttribute('aria-pressed', String(sombre));
      var t = sombre ? 'Passer en mode clair' : 'Passer en mode sombre';
      b.setAttribute('aria-label', window.wonjoTexte(t));
      b.title = b.getAttribute('aria-label');
    });
  }

  function choisirLangue(langue) {
    appliquer(langue);
    try { localStorage.setItem('wonjo-langue', langue); } catch (e) { /* choix non garde */ }
    majBoutons();
    document.dispatchEvent(new CustomEvent('wonjo:langue', { detail: langue }));
  }

  function choisirTheme(theme) {
    if (theme === 'dark') racine.setAttribute('data-theme', 'dark'); else racine.removeAttribute('data-theme');
    racine.style.colorScheme = theme;
    try { localStorage.setItem('wonjo-theme', theme); } catch (e) { /* choix non garde */ }
    majBoutons();
  }

  function demarrer() {
    if (langueCourante() === 'en') appliquer('en');
    racine.removeAttribute('data-langue-attente');
    document.querySelectorAll('[data-bascule-langue]').forEach(function (b) {
      b.addEventListener('click', function () { choisirLangue(langueCourante() === 'en' ? 'fr' : 'en'); });
    });
    document.querySelectorAll('[data-bascule-theme]').forEach(function (b) {
      b.addEventListener('click', function () { choisirTheme(themeCourant() === 'dark' ? 'light' : 'dark'); });
    });
    majBoutons();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();

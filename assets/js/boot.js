// Charge de facon synchrone dans <head>, avant le premier affichage : applique le theme et la langue
// choisis par le visiteur (boutons de la barre du haut, assets/js/reglages.js) sans eclair blanc ni
// passage visible du francais a l'anglais. Par defaut : clair et francais, quel que soit le navigateur.
(function () {
  var racine = document.documentElement;
  try {
    if (localStorage.getItem('wonjo-theme') === 'dark') {
      racine.setAttribute('data-theme', 'dark');
      racine.style.colorScheme = 'dark';
    }
    if (localStorage.getItem('wonjo-langue') === 'en') {
      racine.lang = 'en';
      racine.setAttribute('data-langue-attente', '');
      // Filet : si la traduction ne se charge pas, la page s'affiche quand meme (en francais).
      setTimeout(function () { racine.removeAttribute('data-langue-attente'); }, 1500);
    }
  } catch (e) { /* stockage bloque : on reste en clair et en francais */ }
})();

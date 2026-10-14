// Execute avant React (script bloquant dans <head>). Fichier et non script en ligne : la CSP de
// index.html n'autorise que les scripts du site (script-src 'self').

// Anti-clickjacking : GitHub Pages ne permet ni X-Frame-Options ni CSP frame-ancestors (ignoree en
// <meta>). La page reste masquee tant qu'on n'a pas verifie qu'elle n'est pas dans une iframe.
if (window.self === window.top) {
  document.getElementById('anti-clickjack').remove();
} else {
  window.top.location = window.self.location;
}

try {
  var t = localStorage.getItem('wonjo-backoffice-theme');
  if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
} catch (e) {}

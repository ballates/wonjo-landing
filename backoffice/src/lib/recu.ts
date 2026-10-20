// Reçus d'encaissement en espèces des points relais (migration 420). Le serveur édite et fige le reçu ; ici on le montre,
// on le télécharge en PDF et on prépare son impression. Le PDF est fabriqué dans le navigateur, sans bibliothèque : une page,
// police Helvetica standard (accents français et €), à partir du contenu figé par le serveur.

export interface ContenuRecu {
  point?: { nom?: string; adresse?: string; ville?: string; pays_code?: string; telephone?: string };
  payeur?: { nom?: string; telephone?: string };
  dossier?: { reference?: string; trajet?: string };
  montant_local?: number;
  devise?: string;
  montant_eur?: number;
  taux?: number;
  moyen?: string;
  agent?: string;
}
export interface Recu {
  id: string;
  numero: string;
  statut: 'emis' | 'utilise' | 'annule';
  emis_at: string;
  envois: number;
  contenu: ContenuRecu;
}

const espaces = (s: string) => s.replace(/[  ]/g, ' ');
const devise = (d?: string) => (d === 'XOF' || d === 'XAF' ? 'FCFA' : (d ?? ''));
export const montantRecu = (c: ContenuRecu) => espaces(`${Number(c.montant_local ?? 0).toLocaleString('fr-FR')} ${devise(c.devise)}`);
export const montantEurRecu = (c: ContenuRecu) =>
  c.montant_eur != null ? espaces(`${Number(c.montant_eur).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`) : '';
export const dateRecu = (iso: string) => espaces(new Date(iso).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' }));
export const LIBELLE_STATUT_RECU: Record<string, string> = { emis: 'Édité', utilise: 'Utilisé', annule: 'Annulé', caduc: 'Caduc' };

// ── PDF ──────────────────────────────────────────────────────────────────────────────────────────
// Texte -> octets WinAnsi (cp1252) : le Latin-1 passe tel quel, quelques signes ont leur place dans 0x80-0x9F, le reste devient « ? ».
const WIN_ANSI: Record<string, number> = { '€': 0x80, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '–': 0x96, '—': 0x97, 'œ': 0x9c, 'Œ': 0x8c };
function octets(texte: string): string {
  let out = '';
  for (const ch of espaces(texte).replace(/→/g, '–')) {
    const code = ch.charCodeAt(0);
    const o = WIN_ANSI[ch] ?? (code >= 0x20 && code <= 0xff ? code : 0x3f);
    out += (o === 0x28 || o === 0x29 || o === 0x5c) ? '\\' + String.fromCharCode(o) : String.fromCharCode(o);
  }
  return out;
}
// Découpe en lignes d'au plus `max` caractères (Helvetica : ~0,5 em par caractère).
function lignes(texte: string, max: number): string[] {
  const mots = texte.split(/\s+/).filter(Boolean);
  const res: string[] = [];
  let cur = '';
  for (const m of mots) {
    if ((cur + ' ' + m).trim().length > max && cur) { res.push(cur); cur = m; } else cur = (cur + ' ' + m).trim();
  }
  if (cur) res.push(cur);
  return res.length ? res : [''];
}

export function genererPdfRecu(recu: Recu): Blob {
  const c = recu.contenu;
  const H = 842;
  const ops: string[] = [];
  const texte = (x: number, yHaut: number, s: string, taille = 11, gras = false, gris = false) =>
    ops.push(`BT /${gras ? 'F2' : 'F1'} ${taille} Tf ${gris ? '0.42 0.45 0.5' : '0.07 0.09 0.15'} rg ${x} ${H - yHaut} Td (${octets(s)}) Tj ET`);
  const rect = (x: number, yHaut: number, w: number, h: number, rempli?: string) =>
    ops.push(rempli ? `${rempli} rg ${x} ${H - yHaut - h} ${w} ${h} re f` : `0.8 0.82 0.85 RG 0.8 w ${x} ${H - yHaut - h} ${w} ${h} re S`);

  // Bandeau
  rect(0, 0, 595, 96, '0.29 0.53 0.59');
  ops.push(`BT /F2 28 Tf 1 1 1 rg 40 ${H - 60} Td (Wonjo) Tj ET`);
  ops.push(`BT /F2 12 Tf 1 1 1 rg 340 ${H - 58} Td (${octets("REÇU D'ENCAISSEMENT")}) Tj ET`);
  ops.push(`BT /F1 10 Tf 0.93 0.96 0.97 rg 340 ${H - 74} Td (${octets('Paiement en espèces')}) Tj ET`);

  // Numéro et date
  texte(40, 140, `Reçu n° ${recu.numero}`, 22, true);
  texte(40, 162, `Édité le ${dateRecu(recu.emis_at)}${c.agent ? ` par ${c.agent}` : ''}`, 10, false, true);
  if (recu.statut === 'annule') texte(40, 182, 'REÇU ANNULÉ : ne vaut plus justificatif', 12, true);

  // Montant
  rect(40, 200, 515, 78);
  texte(60, 224, 'MONTANT REÇU', 9.5, true, true);
  texte(60, 256, montantRecu(c), 28, true);
  if (c.montant_eur != null) texte(330, 256, `soit ${montantEurRecu(c)}`, 12, false, true);

  // Détail
  let y = 316;
  const ligne = (libelle: string, valeur: string) => {
    texte(60, y, libelle, 9.5, false, true);
    for (const l of lignes(valeur || '-', 52)) { texte(200, y, l, 11.5, true); y += 17; }
    y += 7;
  };
  ligne('Payé par', [c.payeur?.nom, c.payeur?.telephone].filter(Boolean).join(' · '));
  ligne('Reçu par', [c.point?.nom, c.point?.adresse, c.point?.ville].filter(Boolean).join(', '));
  if (c.point?.telephone) ligne('Téléphone du point', c.point.telephone);
  ligne('Envoi Wonjo', [c.dossier?.reference ? `#${c.dossier.reference}` : '', c.dossier?.trajet].filter(Boolean).join(' · '));
  ligne('Moyen de paiement', 'Espèces');
  if (c.taux && c.devise && (c.devise === 'XOF' || c.devise === 'XAF')) ligne('Taux de change', `1 € = ${c.taux.toLocaleString('fr-FR', { minimumFractionDigits: 3 })} FCFA (taux fixe)`);

  // Signatures
  const ySig = Math.max(y + 30, 560);
  rect(40, ySig, 245, 110);
  rect(310, ySig, 245, 110);
  texte(52, ySig + 18, 'Signature du client', 9.5, false, true);
  texte(322, ySig + 18, 'Signature et cachet du point relais', 9.5, false, true);

  texte(40, 790, 'Reçu édité par Wonjo. Conservez-le : il prouve votre paiement. Son numéro est vérifié par Wonjo à l\'encaissement.', 8.5, false, true);

  const flux = ops.join('\n');
  const objets = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 ${H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const positions: number[] = [];
  objets.forEach((o, i) => { positions.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${positions.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: 'application/pdf' });
}

export function telechargerPdfRecu(recu: Recu) {
  const url = URL.createObjectURL(genererPdfRecu(recu));
  const a = document.createElement('a');
  a.href = url;
  a.download = `recu-${recu.numero}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

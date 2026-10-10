import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Modal } from '../components/Modal';
import { IconEye, IconSearch } from '../components/Icons';

type Categorie = 'compte' | 'transaction' | 'alerte' | 'interne';

interface ChampEmail {
  cle: string;
  label: string;
  variables: string[];
  objet: boolean;
  fr: string;
  en: string;
  fr_modifie: string | null;
  en_modifie: string | null;
}

interface EmailApp {
  id: string;
  champs: ChampEmail[];
  nom: string;
  categorie: Categorie;
  declencheur: string;
  destinataire: string;
  fonction: string;
  apercu: boolean;
}

const CATEGORIES: { value: Categorie; label: string; hint: string; badge: string }[] = [
  { value: 'compte', label: 'Compte', hint: 'Inscription, identité, mot de passe', badge: 'badge-teal' },
  { value: 'transaction', label: 'Transactions', hint: 'Paiement, livraison, litige', badge: 'badge-green' },
  { value: 'alerte', label: 'Alertes et rappels', hint: 'Envoyés pour prévenir un membre', badge: 'badge-amber' },
  { value: 'interne', label: 'Équipe Wonjo', hint: 'Reçus par l’équipe, jamais par les membres', badge: 'badge-muted' },
];

interface Apercu { subject: string; html: string }

// Tous les e-mails que Wonjo envoie lui-meme (hors campagnes), avec quand ils partent et un
// apercu fidele : le contenu est produit par le vrai code d'envoi, sur des valeurs d'exemple.
export function EmailsAppSection({ onCompte }: { onCompte?: (n: number) => void }) {
  const [emails, setEmails] = useState<EmailApp[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');
  const [ouvert, setOuvert] = useState<EmailApp | null>(null);
  const [langue, setLangue] = useState<'fr' | 'en'>('fr');
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreurApercu, setErreurApercu] = useState<string | null>(null);
  const [peutModifier, setPeutModifier] = useState(false);
  // Brouillon : textes en cours de saisie, par champ, pour la langue affichee.
  const [brouillon, setBrouillon] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState<'enregistrer' | 'test' | null>(null);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);

  function chargerListe() {
    return supabase.functions.invoke('admin-apercu-email', { body: { action: 'liste' } }).then(({ data, error }) => {
      if (error || !data?.emails) { setErreur(error?.message ?? 'Impossible de charger la liste.'); return null; }
      setEmails(data.emails as EmailApp[]);
      onCompte?.((data.emails as EmailApp[]).length);
      setPeutModifier(!!data.peutModifier);
      return data.emails as EmailApp[];
    });
  }
  useEffect(() => { chargerListe(); }, []);

  const valeurActuelle = (c: ChampEmail) => (langue === 'fr' ? c.fr_modifie : c.en_modifie) ?? c[langue];
  const valeurAffichee = (c: ChampEmail) => brouillon[c.cle] ?? valeurActuelle(c);
  const changes = (ouvert?.champs ?? []).filter((c) => brouillon[c.cle] !== undefined && brouillon[c.cle] !== valeurActuelle(c));
  const modifie = (c: ChampEmail) => (langue === 'fr' ? c.fr_modifie : c.en_modifie) !== null;

  // Les brouillons ne suivent pas le changement de langue ni d'e-mail.
  useEffect(() => { setBrouillon({}); setRetour(null); }, [ouvert?.id, langue]);

  const cleBrouillon = useMemo(() => JSON.stringify(
    Object.fromEntries((ouvert?.champs ?? []).filter((c) => brouillon[c.cle] !== undefined).map((c) => [`${ouvert!.id}|${c.cle}|${langue}`, brouillon[c.cle]])),
  ), [brouillon, ouvert, langue]);

  useEffect(() => {
    if (!ouvert?.apercu) { setApercu(null); return; }
    let actif = true;
    // Petite attente : on ne relance pas l'apercu a chaque lettre tapee.
    const minuteur = setTimeout(() => {
    setChargement(true);
    setErreurApercu(null);
    supabase.functions.invoke('admin-apercu-email', { body: { action: 'apercu', id: ouvert.id, langue, brouillon: JSON.parse(cleBrouillon) } }).then(({ data, error }) => {
      if (!actif) return;
      setChargement(false);
      if (error || !data?.html) { setApercu(null); setErreurApercu(error?.message ?? data?.error ?? 'Aperçu indisponible.'); }
      else setApercu({ subject: data.subject, html: data.html });
    });
    }, 500);
    return () => { actif = false; clearTimeout(minuteur); };
  }, [ouvert?.id, langue, cleBrouillon]); // eslint-disable-line react-hooks/exhaustive-deps

  async function enregistrer() {
    if (!ouvert) return;
    setEnCours('enregistrer'); setRetour(null);
    for (const c of changes) {
      // Revenir au texte d'origine = supprimer la modification.
      const valeur = brouillon[c.cle].trim() === c[langue].trim() ? null : brouillon[c.cle];
      const { data, error } = await supabase.functions.invoke('admin-apercu-email', { body: { action: 'enregistrer', id: ouvert.id, champ: c.cle, langue, valeur } });
      if (error || data?.error) {
        setEnCours(null);
        setRetour({ ok: false, texte: `${c.label} : ${data?.error ?? error?.message ?? 'enregistrement impossible'}` });
        return;
      }
    }
    const liste = await chargerListe();
    const frais = liste?.find((e) => e.id === ouvert.id);
    setBrouillon({});
    if (frais) setOuvert(frais);
    setEnCours(null);
    setRetour({ ok: true, texte: 'Enregistré. Le prochain envoi utilisera ces textes.' });
  }

  async function restaurer(c: ChampEmail) {
    if (!ouvert) return;
    setEnCours('enregistrer'); setRetour(null);
    const { data, error } = await supabase.functions.invoke('admin-apercu-email', { body: { action: 'enregistrer', id: ouvert.id, champ: c.cle, langue, valeur: null } });
    if (error || data?.error) { setEnCours(null); setRetour({ ok: false, texte: data?.error ?? error?.message ?? 'Impossible de revenir au texte d’origine.' }); return; }
    const liste = await chargerListe();
    const frais = liste?.find((e) => e.id === ouvert.id);
    setBrouillon((b) => { const n = { ...b }; delete n[c.cle]; return n; });
    if (frais) setOuvert(frais);
    setEnCours(null);
    setRetour({ ok: true, texte: 'Texte d’origine rétabli.' });
  }

  async function envoyerTest() {
    if (!ouvert) return;
    setEnCours('test'); setRetour(null);
    const { data, error } = await supabase.functions.invoke('admin-apercu-email', { body: { action: 'test', id: ouvert.id, langue, brouillon: JSON.parse(cleBrouillon) } });
    setEnCours(null);
    if (error || data?.error) setRetour({ ok: false, texte: data?.error ?? error?.message ?? 'Envoi impossible.' });
    else setRetour({ ok: true, texte: `Test envoyé à ${data.a}.` });
  }

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!emails) return [];
    return q ? emails.filter((e) => `${e.nom} ${e.declencheur} ${e.destinataire}`.toLowerCase().includes(q)) : emails;
  }, [emails, recherche]);

  if (erreur) return <p className="page-error">{erreur}</p>;
  if (!emails) return <p className="hint">Chargement…</p>;

  return (
    <div>
      <div className="dt-toolbar">
        <div className="dt-search">
          <IconSearch />
          <input type="search" placeholder="Rechercher un e-mail…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        </div>
      </div>

      {CATEGORIES.map((cat) => {
        const liste = filtres.filter((e) => e.categorie === cat.value);
        if (liste.length === 0) return null;
        return (
          <section key={cat.value} className="emails-app-groupe">
            <div className="emails-app-titre">
              <h2>{cat.label}<span className="emails-app-compte">{liste.length}</span></h2>
              <span>{cat.hint}</span>
            </div>
            <div className="emails-app-grille">
              {liste.map((e) => (
                <article key={e.id} className="emails-app-carte">
                  <div className="emails-app-entete">
                    <h3>{e.nom}</h3>
                    <span className={`badge ${cat.badge}`}>{cat.label}</span>
                  </div>
                  <dl>
                    <dt>Quand il part</dt>
                    <dd>{e.declencheur}</dd>
                    <dt>Qui le reçoit</dt>
                    <dd>{e.destinataire}</dd>
                  </dl>
                  <div className="emails-app-pied">
                    <code title="Fonction qui l'envoie">{e.fonction}</code>
                    {e.apercu
                      ? <button className="btn btn-soft btn-sm" onClick={() => { setLangue('fr'); setOuvert(e); }}><IconEye /> Aperçu</button>
                      : <span className="hint" style={{ margin: 0 }}>Aperçu indisponible</span>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
      {filtres.length === 0 && <p className="hint">Aucun e-mail ne correspond à cette recherche.</p>}

      {ouvert && (
        <Modal wide onClose={() => setOuvert(null)} closeOnSurface>
          <div className="emails-app-modal">
            <h2>{ouvert.nom}</h2>
            <p className="chart-sub" style={{ margin: '0 0 12px' }}>{ouvert.declencheur}</p>
            <div className="emails-app-barre">
              <div className="tabs" style={{ margin: 0 }}>
                <button className={langue === 'fr' ? 'active' : ''} onClick={() => setLangue('fr')}>Français</button>
                <button className={langue === 'en' ? 'active' : ''} onClick={() => setLangue('en')}>English</button>
              </div>
              {apercu && <span className="emails-app-sujet"><strong>Objet :</strong> {apercu.subject}</span>}
            </div>
            <div className={ouvert.champs.length > 0 && peutModifier ? 'emails-app-deux' : ''}>
              <div className="emails-app-colonne">
                {chargement && <p className="hint">Chargement de l'aperçu…</p>}
                {erreurApercu && <p className="page-error">{erreurApercu}</p>}
                {apercu && (
                  <iframe className="emails-app-cadre" style={{ opacity: chargement ? 0.5 : 1 }} title={`Aperçu : ${ouvert.nom}`} sandbox="" srcDoc={apercu.html} />
                )}
              </div>
              {ouvert.champs.length > 0 && peutModifier && (
                <div className="emails-app-edition">
                  <h3>Textes modifiables</h3>
                  <p className="hint" style={{ margin: '0 0 10px' }}>Les montants, tableaux et mentions légales ne se modifient pas ici. Les modifications s'appliquent au prochain envoi, en {langue === 'fr' ? 'français' : 'anglais'}.</p>
                  {ouvert.champs.map((c) => (
                    <div key={c.cle} className="emails-app-champ">
                      <label htmlFor={`champ-${c.cle}`}>
                        {c.label}{modifie(c) && <span className="badge badge-amber" style={{ marginLeft: 8 }}>modifié</span>}
                      </label>
                      <textarea
                        id={`champ-${c.cle}`}
                        rows={c.objet ? 1 : 4}
                        value={valeurAffichee(c)}
                        maxLength={c.objet ? 150 : 800}
                        onChange={(e) => setBrouillon((b) => ({ ...b, [c.cle]: e.target.value }))}
                      />
                      <div className="emails-app-champ-pied">
                        {c.variables.length > 0 && (
                          <span className="hint" style={{ margin: 0 }}>
                            Variables :{' '}
                            {c.variables.map((v) => (
                              <button key={v} type="button" className="chip-filter" onClick={() => setBrouillon((b) => ({ ...b, [c.cle]: `${valeurAffichee(c)}{${v}}` }))}>{`{${v}}`}</button>
                            ))}
                          </span>
                        )}
                        {!c.objet && <span className="hint" style={{ margin: 0 }}>**gras** possible</span>}
                        {(modifie(c) || brouillon[c.cle] !== undefined) && (
                          <button type="button" className="btn btn-sm" disabled={enCours !== null} onClick={() => modifie(c) ? restaurer(c) : setBrouillon((b) => { const n = { ...b }; delete n[c.cle]; return n; })}>
                            {modifie(c) ? 'Revenir au texte d’origine' : 'Annuler'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {retour && <p className={retour.ok ? 'hint' : 'page-error'} style={{ margin: '8px 0' }}>{retour.texte}</p>}
                  <div className="action-row" style={{ marginTop: 12 }}>
                    <button className="btn btn-primary btn-sm" disabled={changes.length === 0 || enCours !== null} onClick={enregistrer}>
                      {enCours === 'enregistrer' ? 'Enregistrement…' : `Enregistrer${changes.length ? ` (${changes.length})` : ''}`}
                    </button>
                    <button className="btn btn-sm" disabled={enCours !== null} onClick={envoyerTest}>{enCours === 'test' ? 'Envoi…' : 'M’envoyer un test'}</button>
                  </div>
                </div>
              )}
            </div>
            <p className="hint" style={{ marginTop: 8 }}>Aperçu avec des valeurs d'exemple. Rien n'est envoyé.</p>
          </div>
        </Modal>
      )}
    </div>
  );
}

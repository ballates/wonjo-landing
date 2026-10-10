import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Modal } from '../components/Modal';
import { IconEye, IconSearch } from '../components/Icons';

type Categorie = 'compte' | 'transaction' | 'alerte' | 'interne';

interface EmailApp {
  id: string;
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
export function EmailsAppSection() {
  const [emails, setEmails] = useState<EmailApp[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');
  const [ouvert, setOuvert] = useState<EmailApp | null>(null);
  const [langue, setLangue] = useState<'fr' | 'en'>('fr');
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreurApercu, setErreurApercu] = useState<string | null>(null);

  useEffect(() => {
    supabase.functions.invoke('admin-apercu-email', { body: { action: 'liste' } }).then(({ data, error }) => {
      if (error || !data?.emails) setErreur(error?.message ?? 'Impossible de charger la liste.');
      else setEmails(data.emails as EmailApp[]);
    });
  }, []);

  useEffect(() => {
    if (!ouvert?.apercu) { setApercu(null); return; }
    let actif = true;
    setChargement(true);
    setErreurApercu(null);
    supabase.functions.invoke('admin-apercu-email', { body: { action: 'apercu', id: ouvert.id, langue } }).then(({ data, error }) => {
      if (!actif) return;
      setChargement(false);
      if (error || !data?.html) { setApercu(null); setErreurApercu(error?.message ?? data?.error ?? 'Aperçu indisponible.'); }
      else setApercu({ subject: data.subject, html: data.html });
    });
    return () => { actif = false; };
  }, [ouvert, langue]);

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
        <span className="hint" style={{ margin: 0 }}>{emails.length} e-mails envoyés par Wonjo, hors campagnes</span>
      </div>

      {CATEGORIES.map((cat) => {
        const liste = filtres.filter((e) => e.categorie === cat.value);
        if (liste.length === 0) return null;
        return (
          <section key={cat.value} className="emails-app-groupe">
            <div className="emails-app-titre">
              <h2>{cat.label}</h2>
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
            {chargement && <p className="hint">Chargement de l'aperçu…</p>}
            {erreurApercu && <p className="page-error">{erreurApercu}</p>}
            {apercu && !chargement && (
              <iframe className="emails-app-cadre" title={`Aperçu : ${ouvert.nom}`} sandbox="" srcDoc={apercu.html} />
            )}
            <p className="hint" style={{ marginTop: 8 }}>Aperçu avec des valeurs d'exemple. Rien n'est envoyé.</p>
          </div>
        </Modal>
      )}
    </div>
  );
}

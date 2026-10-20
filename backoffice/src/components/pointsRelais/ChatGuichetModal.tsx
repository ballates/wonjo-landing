import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../Modal';
import { Avatar } from '../Avatar';

// Conversation d'un dossier du guichet (migration 402) : l'agent ecrit au nom du point, le voyageur repond depuis
// l'app. Rafraichie toutes les 5 s tant que la fenetre est ouverte ; images signees (bucket chat-images, 10 min).

interface Message {
  id: string;
  de_point: boolean;
  contenu: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  is_system: boolean;
  system_key: string | null;
  agent_nom: string | null;
}

const PREFIXE_IMAGE = '__IMG__:';

const heureCourte = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** « Aujourd'hui », « Hier » ou « lundi 19 octobre » : séparateur de jour du fil. */
function libelleJour(iso: string): string {
  const d = new Date(iso);
  const auj = new Date();
  const hier = new Date(); hier.setDate(auj.getDate() - 1);
  const meme = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (meme(d, auj)) return "Aujourd'hui";
  if (meme(d, hier)) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== auj.getFullYear() ? { year: 'numeric' } : {}) });
}

// Réponses toutes prêtes : elles remplissent la zone de saisie, l'agent relit puis envoie.
const REPONSES_RAPIDES = [
  'Merci, bon voyage !',
  'Pouvez-vous confirmer votre heure d\'arrivée ?',
  'Le colis est prêt, vous pouvez passer le récupérer.',
];

export function ChatGuichetModal({ demandeId, reference, porteurNom, ouvert, destinataire, onClose }: {
  demandeId: string; reference: string; porteurNom: string | null; ouvert: boolean;
  /** Coordonnees du destinataire a transmettre au voyageur en un clic (403). */
  destinataire?: { nom: string; telephone: string; ville: string | null };
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [images, setImages] = useState<Record<string, string>>({});
  const [texte, setTexte] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fil = useRef<HTMLDivElement>(null);
  const nbAvant = useRef(0);

  async function charger() {
    const { data, error: e } = await supabase.rpc('admin_pr_messages', { p_demande_id: demandeId });
    if (e) { setError(e.message); setMessages([]); return; }
    const liste = (data ?? []) as Message[];
    setMessages(liste);
    const chemins = liste.map((m) => m.contenu).filter((c): c is string => !!c && c.startsWith(PREFIXE_IMAGE))
      .map((c) => c.slice(PREFIXE_IMAGE.length)).filter((c) => !images[c]);
    if (chemins.length) {
      const { data: signes } = await supabase.storage.from('chat-images').createSignedUrls(chemins, 600);
      setImages((i) => ({ ...i, ...Object.fromEntries((signes ?? []).filter((s) => s.signedUrl && s.path).map((s) => [s.path as string, s.signedUrl as string])) }));
    }
  }

  useEffect(() => {
    charger();
    const t = window.setInterval(charger, 5000);
    return () => window.clearInterval(t);
  }, [demandeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Descend en bas à chaque nouveau message si on y était déjà (ou au premier chargement, ou si le dernier est le nôtre).
  useEffect(() => {
    if (messages && messages.length !== nbAvant.current) {
      const premier = nbAvant.current === 0;
      const dernier = messages[messages.length - 1];
      const enBas = auBas();
      nbAvant.current = messages.length;
      if (premier || enBas || dernier?.de_point) fil.current?.scrollTo({ top: fil.current.scrollHeight, behavior: premier ? 'auto' : 'smooth' });
      else setNouveaux(true);
    }
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  async function envoyer() {
    const t = texte.trim();
    if (!t) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc('admin_pr_envoyer_message', { p_demande_id: demandeId, p_contenu: t });
    setBusy(false);
    if (e) { setError(e.message.includes('Trop de messages') ? 'Trop de messages envoyés à la suite : patientez un instant.' : e.message); return; }
    setTexte('');
    charger();
  }

  // Défilement : en bas à chaque nouveau message si l'on y était déjà (ou si c'est le sien) ; sinon un bouton « Nouveaux messages ».
  const [nouveaux, setNouveaux] = useState(false);
  function auBas() {
    const e = fil.current;
    return !e || e.scrollHeight - e.scrollTop - e.clientHeight < 80;
  }
  const zoneSaisie = useRef<HTMLTextAreaElement>(null);
  // La zone de saisie grandit avec le texte (jusqu'à 5 lignes).
  useEffect(() => {
    const t = zoneSaisie.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
  }, [texte]);

  // Messages groupés : même auteur à la suite = un seul nom, une seule queue de bulle ; un séparateur à chaque nouveau jour.
  type LigneFil = { type: 'jour'; cle: string; jour: string } | { type: 'msg'; m: Message; premier: boolean; dernier: boolean };
  const out: LigneFil[] = [];
  (messages ?? []).forEach((m, idx, tous) => {
    const prec = tous[idx - 1];
    const suiv = tous[idx + 1];
    if (!prec || new Date(prec.created_at).toDateString() !== new Date(m.created_at).toDateString()) out.push({ type: 'jour', cle: `j-${m.id}`, jour: libelleJour(m.created_at) });
    const meme = (a?: Message) => !!a && !a.is_system && !m.is_system && a.de_point === m.de_point && new Date(a.created_at).toDateString() === new Date(m.created_at).toDateString();
    out.push({ type: 'msg', m, premier: !meme(prec), dernier: !meme(suiv) });
  });

  return (
    <Modal onClose={onClose}>
      <div className="cg-entete">
        <Avatar src={null} nom={porteurNom ?? 'Voyageur'} size={42} />
        <div className="cg-entete-texte">
          <strong>{porteurNom ?? 'Voyageur'}</strong>
          <span>Dossier #{reference}</span>
        </div>
        <span className={`cg-etat ${ouvert ? 'cg-etat--ouvert' : ''}`}>{ouvert ? 'Conversation ouverte' : 'En attente d\'acceptation'}</span>
      </div>
      <div className="cg-corps">
        <div className="cg-fil-cadre">
          <div className="cg-fil" ref={fil} onScroll={() => { if (auBas()) setNouveaux(false); }}>
            {!messages ? (
              <div className="cg-squelette" aria-label="Chargement"><span /><span /><span /></div>
            ) : messages.length === 0 ? (
              <div className="cg-vide">
                <span aria-hidden="true">💬</span>
                <strong>Aucun message pour le moment</strong>
                <p>{ouvert ? 'Écrivez au voyageur pour organiser la remise du colis.' : 'La conversation s\'ouvre quand le voyageur a accepté la demande.'}</p>
              </div>
            ) : out.map((l) => {
              if (l.type === 'jour') return <div key={l.cle} className="cg-jour"><span>{l.jour}</span></div>;
              const { m, premier, dernier } = l;
              if (m.is_system) return <div key={m.id} className="chat-systeme">{m.contenu ?? m.system_key}</div>;
              const estImage = !!m.contenu?.startsWith(PREFIXE_IMAGE);
              const image = estImage ? images[(m.contenu as string).slice(PREFIXE_IMAGE.length)] : null;
              return (
                <div key={m.id} className={`cg-ligne ${m.de_point ? 'cg-ligne--moi' : ''} ${premier ? 'cg-ligne--premier' : ''}`}>
                  {premier && <span className="cg-auteur">{m.de_point ? (m.agent_nom ?? 'Point relais') : (porteurNom ?? 'Voyageur')}</span>}
                  <div className={`cg-bulle ${m.de_point ? 'cg-bulle--moi' : ''} ${dernier ? 'cg-bulle--dernier' : ''}`}>
                    {m.deleted_at ? <em className="cg-supprime">Message supprimé</em>
                      : estImage
                        ? (image ? <a href={image} target="_blank" rel="noopener noreferrer"><img src={image} alt="Image envoyée" /></a> : <em className="cg-supprime">Image…</em>)
                        : <span className="cg-texte">{m.contenu}</span>}
                    <span className="cg-heure">{heureCourte(m.created_at)}{m.edited_at ? ' · modifié' : ''}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {nouveaux && (
            <button type="button" className="cg-nouveaux" onClick={() => { fil.current?.scrollTo({ top: fil.current.scrollHeight, behavior: 'smooth' }); setNouveaux(false); }}>
              Nouveaux messages ↓
            </button>
          )}
        </div>

        {error && <p className="page-error" style={{ marginTop: 10 }}>{error}</p>}

        {ouvert ? (
          <div className="cg-composeur">
            <div className="cg-rapides" aria-label="Réponses rapides">
              {destinataire && (
                <button type="button" className="cg-puce cg-puce--forte"
                        onClick={() => { setTexte(`Bonjour, voici le destinataire du colis : ${destinataire.nom}, ${destinataire.telephone}${destinataire.ville ? `, ${destinataire.ville}` : ''}. Merci de l'appeler à votre arrivée et de lui donner le code de livraison au moment de la remise.`); zoneSaisie.current?.focus(); }}>
                  Coordonnées du destinataire
                </button>
              )}
              {REPONSES_RAPIDES.map((r) => (
                <button key={r} type="button" className="cg-puce" onClick={() => { setTexte(r); zoneSaisie.current?.focus(); }}>{r}</button>
              ))}
            </div>
            <div className="cg-saisie">
              <textarea
                ref={zoneSaisie}
                value={texte}
                rows={1}
                maxLength={2000}
                placeholder="Écrivez votre message…"
                aria-label="Votre message"
                onChange={(e) => setTexte(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(); } }}
              />
              <button type="button" className="cg-envoyer" onClick={envoyer} disabled={busy || !texte.trim()} aria-label="Envoyer le message" title="Envoyer (Entrée)">
                {busy ? <span className="cg-attente" /> : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7Z" /></svg>
                )}
              </button>
            </div>
            <p className="cg-aide">Envoyé au nom de votre point relais Wonjo · Entrée pour envoyer · Maj + Entrée pour aller à la ligne{texte.length > 1700 ? ` · ${2000 - texte.length} caractères restants` : ''}</p>
          </div>
        ) : (
          <p className="cg-ferme">La conversation s'ouvre quand le voyageur a accepté la demande.</p>
        )}
      </div>
    </Modal>
  );
}

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../Modal';

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

function heure(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

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

  // Descend en bas a chaque nouveau message.
  useEffect(() => {
    if (messages && messages.length !== nbAvant.current) {
      nbAvant.current = messages.length;
      fil.current?.scrollTo({ top: fil.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

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

  return (
    <Modal onClose={onClose}>
      <h2 className="modal-title">Messages · #{reference}</h2>
      <div className="modal-body">
        <p className="hint">Vous écrivez à {porteurNom ?? 'le voyageur'} au nom de « Point relais Wonjo » ; il répond depuis son application.</p>
        <div className="chat-fil" ref={fil}>
          {!messages ? <p className="loading-state">Chargement…</p> : messages.length === 0 ? (
            <p className="empty-state">Aucun message.</p>
          ) : messages.map((m) => {
            if (m.is_system) return <div key={m.id} className="chat-systeme">{m.contenu ?? m.system_key}</div>;
            const image = m.contenu?.startsWith(PREFIXE_IMAGE) ? images[m.contenu.slice(PREFIXE_IMAGE.length)] : null;
            return (
              <div key={m.id} className={`chat-bulle ${m.de_point ? 'chat-bulle--moi' : ''}`}>
                {m.deleted_at ? <em className="hint">Message supprimé</em>
                  : m.contenu?.startsWith(PREFIXE_IMAGE)
                    ? (image ? <a href={image} target="_blank" rel="noopener noreferrer"><img src={image} alt="Image envoyée" /></a> : <em className="hint">Image…</em>)
                    : <span>{m.contenu}</span>}
                <small>{m.de_point ? (m.agent_nom ?? 'Point relais') : (porteurNom ?? 'Voyageur')} · {heure(m.created_at)}{m.edited_at ? ' · modifié' : ''}</small>
              </div>
            );
          })}
        </div>
        {error && <p className="page-error" style={{ marginTop: 8 }}>{error}</p>}
        {ouvert ? (
          <>
          {destinataire && (
            <button type="button" className="btn btn-soft btn-sm" style={{ marginTop: 10 }}
                    onClick={() => setTexte(`Bonjour, voici le destinataire du colis : ${destinataire.nom}, ${destinataire.telephone}${destinataire.ville ? `, ${destinataire.ville}` : ''}. Merci de l'appeler à votre arrivée et de lui donner le code de livraison au moment de la remise.`)}>
              Envoyer les coordonnées du destinataire
            </button>
          )}
          <div className="chat-saisie">
            <textarea
              value={texte}
              rows={2}
              maxLength={2000}
              placeholder="Votre message… (Entrée pour envoyer, Maj+Entrée pour aller à la ligne)"
              onChange={(e) => setTexte(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(); } }}
            />
            <button className="btn btn-primary" onClick={envoyer} disabled={busy || !texte.trim()}>{busy ? '…' : 'Envoyer'}</button>
          </div>
          </>
        ) : (
          <p className="hint" style={{ marginTop: 10 }}>La conversation s'ouvre quand le voyageur a accepté la demande.</p>
        )}
      </div>
    </Modal>
  );
}

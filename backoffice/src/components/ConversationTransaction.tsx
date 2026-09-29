import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { dateHeure } from '../lib/labels';

// [300] Lecture de la conversation d'une transaction. Motif obligatoire,
// chaque lecture est inscrite au journal par la base (admin_lire_conversation).
// Cadre des CGU 1.5.0 : litige, signalement, fraude, requisition.
interface MessageConversation {
  id: string;
  sender_nom: string;
  role: 'expediteur' | 'porteur' | 'systeme';
  contenu: string;
  is_system: boolean;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  image_url: string | null;
}

const MOTIFS_RAPIDES = ['Litige en cours', 'Instruction d\'un signalement', 'Suspicion de fraude'];

export function ConversationTransaction({ demandeId }: { demandeId: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageConversation[] | null>(null);

  async function lire() {
    const m = motif.trim();
    if (!m) { setErreur('Le motif est obligatoire.'); return; }
    setBusy(true);
    setErreur(null);
    const { data, error } = await supabase.functions.invoke('admin-conversation-transaction', { body: { demandeId, motif: m } });
    setBusy(false);
    if (error || data?.error) {
      // Reponse non-2xx : le message utile (ex. motif, role) est dans le corps.
      let detail: string | undefined = data?.error;
      const ctx = (error as { context?: Response } | null)?.context;
      if (!detail && ctx) detail = await ctx.json().then((b: { error?: string }) => b.error).catch(() => undefined);
      setErreur(detail ?? error?.message ?? 'Lecture impossible.');
      return;
    }
    setMessages((data?.messages ?? []) as MessageConversation[]);
  }

  if (messages) {
    return (
      <div className="info-card">
        <p className="section-title">Conversation <span className="hint">: consultation enregistrée dans le journal</span></p>
        {messages.length === 0 && <p className="hint">Aucun message échangé.</p>}
        <ul className="conversation-admin">
          {messages.map((msg) => (
            <li key={msg.id} className={`conversation-admin-msg is-${msg.role}`}>
              <span className="timeline-meta">
                <b>{msg.sender_nom}</b> · {dateHeure(msg.created_at)}
                {msg.edited_at && ' · modifié'}
                {msg.deleted_at && ` · supprimé par l'auteur le ${dateHeure(msg.deleted_at)}`}
              </span>
              {msg.image_url
                ? <a href={msg.image_url} target="_blank" rel="noopener noreferrer"><img src={msg.image_url} alt="Image envoyée" /></a>
                : msg.contenu.startsWith('__IMG__:') ? <span className="hint">(image indisponible)</span>
                : <span className="conversation-admin-texte">{msg.contenu}</span>}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className={`info-card ${ouvert ? '' : 'info-card--compact'}`}>
      <div className={`info-card-head ${ouvert ? 'info-card-head--ouvert' : ''}`}>
        <p className="section-title">Conversation</p>
        {!ouvert && <button className="btn btn-soft btn-sm" onClick={() => setOuvert(true)}>Lire la conversation</button>}
      </div>
      {ouvert && (
        <div className="action-group motif-form">
          <label htmlFor="motif-conversation">Motif de la consultation (enregistré dans le journal)</label>
          <div className="action-row">
            {MOTIFS_RAPIDES.map((r) => (
              <button key={r} type="button" className="btn btn-sm" onClick={() => setMotif(r)}>{r}</button>
            ))}
          </div>
          <textarea id="motif-conversation" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. litige ouvert par l'expéditeur le 28/09." />
          {erreur && <p className="page-error">{erreur}</p>}
          <div className="action-row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" disabled={busy} onClick={() => { setOuvert(false); setErreur(null); }}>Annuler</button>
            <button className="btn btn-primary" disabled={busy} onClick={lire}>{busy ? '…' : 'Lire'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

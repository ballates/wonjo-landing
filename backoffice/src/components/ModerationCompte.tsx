import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Avatar } from './Avatar';
import { dateHeure, versDate } from '../lib/labels';

// [300] Notes internes et publications d'un membre, dans sa fiche.

interface NoteCompte { id: string; contenu: string; created_at: string; admin_nom: string | null; admin_avatar: string | null }

export function NotesCompte({ userId }: { userId: string }) {
  const [notes, setNotes] = useState<NoteCompte[] | null>(null);
  const [saisie, setSaisie] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  function charger() {
    supabase.rpc('admin_lister_notes_compte', { p_user_id: userId }).then(({ data, error }) => {
      if (error) { setErreur(error.message); setNotes([]); return; }
      setNotes((data ?? []) as NoteCompte[]);
    });
  }
  useEffect(charger, [userId]);

  async function ajouter() {
    if (!saisie.trim()) return;
    setBusy(true);
    setErreur(null);
    const { error } = await supabase.rpc('admin_ajouter_note_compte', { p_user_id: userId, p_contenu: saisie });
    setBusy(false);
    if (error) { setErreur(error.message); return; }
    setSaisie('');
    charger();
  }

  return (
    <div>
      <p className="section-title">Notes internes <span className="hint">: visibles des seuls admins</span></p>
      <div className="action-group motif-form">
        <textarea value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="Ex. appelé le 29/09, dit avoir livré en main propre, attend la confirmation de l'expéditeur." />
        <div className="action-row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-primary btn-sm" disabled={busy || !saisie.trim()} onClick={ajouter}>{busy ? '…' : 'Ajouter la note'}</button>
        </div>
      </div>
      {erreur && <p className="page-error">{erreur}</p>}
      {notes === null && <p className="hint">Chargement…</p>}
      {notes && notes.length > 0 && (
        <ul className="timeline">
          {notes.map((n) => (
            <li key={n.id}>
              <Avatar src={n.admin_avatar} nom={n.admin_nom ?? ''} size={30} />
              <div className="timeline-body">
                <span className="note-admin-texte">{n.contenu}</span>
                <span className="timeline-meta">{n.admin_nom ?? 'Admin'} · {dateHeure(n.created_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Publication {
  id: string;
  type: 'annonce' | 'offre';
  trajet: string;
  date_ref: string | null;
  statut: string;
  created_at: string;
  masque_at: string | null;
  masque_motif: string | null;
}

// Les deux plus recentes suffisent ici : l'historique complet est dans Transactions.
const NB_PUBLICATIONS = 2;

export function PublicationsCompte({ userId }: { userId: string }) {
  const [items, setItems] = useState<Publication[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function charger() {
    supabase.rpc('admin_publications_compte', { p_user_id: userId }).then(({ data, error }) => {
      if (error) { setErreur(error.message); setItems([]); return; }
      setItems((data ?? []) as Publication[]);
    });
  }
  useEffect(charger, [userId]);

  async function basculer(p: Publication) {
    const masquer = !p.masque_at;
    let motif: string | null = null;
    if (masquer) {
      motif = window.prompt(`Motif du masquage de ${p.type === 'annonce' ? 'ce trajet' : 'cette demande de colis'} (obligatoire) :`);
      if (!motif?.trim()) return;
    } else if (!window.confirm('Rendre cette publication à nouveau visible ?')) return;
    setBusy(p.id);
    setErreur(null);
    const { error } = await supabase.rpc('admin_masquer_contenu', { p_type: p.type, p_id: p.id, p_masquer: masquer, p_motif: motif });
    setBusy(null);
    if (error) { setErreur(error.message); return; }
    charger();
  }

  return (
    <div>
      <p className="section-title">
        Dernières publications
        {items && items.length > NB_PUBLICATIONS && <span className="hint">{NB_PUBLICATIONS} sur {items.length}</span>}
      </p>
      {erreur && <p className="page-error">{erreur}</p>}
      {items === null && <p className="hint">Chargement…</p>}
      {items && items.length === 0 && <p className="hint">Aucune publication.</p>}
      {items && items.length > 0 && (
        <ul className="publications-admin">
          {items.slice(0, NB_PUBLICATIONS).map((p) => (
            <li key={p.id} className={p.masque_at ? 'is-masquee' : ''}>
              <div>
                <strong>{p.type === 'annonce' ? 'Trajet' : 'Colis'} · {p.trajet || '-'}</strong>
                <span className="timeline-meta">
                  {p.date_ref ? versDate(p.date_ref).toLocaleDateString('fr-FR') : ''} · {p.statut}
                  {p.masque_at && ` · masquée le ${dateHeure(p.masque_at)}${p.masque_motif ? ` (« ${p.masque_motif} »)` : ''}`}
                </span>
              </div>
              <button className={`btn btn-sm ${p.masque_at ? 'btn-soft' : 'btn-danger-outline'}`} disabled={busy === p.id} onClick={() => basculer(p)}>
                {p.masque_at ? 'Réafficher' : 'Masquer'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// [308] Blocage automatique : meme identite verifiee qu'un compte suspendu.
interface BlocageReinscription { compte_origine: string; origine_nom: string; created_at: string; examine_at: string | null }

export function BlocageAutomatique({ userId, onOuvrir }: { userId: string; onOuvrir: (id: string) => void }) {
  const [items, setItems] = useState<BlocageReinscription[]>([]);

  useEffect(() => {
    supabase.rpc('admin_blocage_reinscription', { p_user_id: userId }).then(({ data }) => {
      setItems((data ?? []) as BlocageReinscription[]);
    });
  }, [userId]);

  if (items.length === 0) return null;
  const b = items[0];
  return (
    <div className="bandeau-alerte">
      <strong>Bloqué automatiquement le {dateHeure(b.created_at)}</strong>
      <span>
        Même identité vérifiée (nom, prénom, date de naissance) que{' '}
        <button type="button" className="lien" onClick={() => onOuvrir(b.compte_origine)}>{b.origine_nom || 'un compte suspendu'}</button>,
        compte suspendu : même personne, ou homonyme né le même jour.
      </span>
      {!b.examine_at && <span className="hint">À examiner : ajoutez une note pour confirmer, ou débloquez en cas d'homonymie.</span>}
    </div>
  );
}

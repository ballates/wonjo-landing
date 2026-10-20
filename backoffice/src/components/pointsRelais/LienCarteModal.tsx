import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { supabase } from '../../lib/supabase';
import { Modal } from '../Modal';
import { dateCourte, montantEuros, montantLocal, type PointRelais } from '../../lib/pointsRelais';

// Paiement par carte d'un client du guichet (migration 404, Edge Function pr-lien-carte) : un lien vers une page
// Stripe, affiche en QR (le client le scanne) ou envoye par WhatsApp. Le montant est RESERVE sur la carte et debite
// quand le voyageur accepte, comme dans l'app. La fenetre suit le dossier toutes les 5 s et le dit quand c'est fait.

export interface DossierCarte {
  demande_id: string;
  reference: string;
  client_nom: string;
  client_telephone: string;
  montant_eur: number;
  montant_local: number;
  devise: string;
}

// Message d'erreur d'une Edge Function : le corps JSON de la reponse, a defaut le message generique.
async function messageFonction(e: unknown): Promise<string> {
  const ctx = (e as { context?: Response }).context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const corps = await ctx.json() as { error?: string };
      if (corps?.error) return corps.error;
    } catch { /* corps illisible */ }
  }
  return e instanceof Error ? e.message : 'Erreur inconnue';
}

export function LienCarteModal({ point, dossier, onClose, onPaye, onAutrement }: {
  point: PointRelais;
  dossier: DossierCarte;
  onClose: () => void;
  onPaye: (message: string) => void;
  /** Le client paie finalement en especes ou mobile money : le lien est annule, le dossier change de moyen. */
  onAutrement: () => void;
}) {
  const [lien, setLien] = useState<string | null>(null);
  const [expireAt, setExpireAt] = useState<string | null>(null);
  const [montantEur, setMontantEur] = useState(dossier.montant_eur);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copie, setCopie] = useState(false);
  const [paye, setPaye] = useState(false);

  // Une seule création à la fois : l'ouverture de la fenêtre (ou un double clic) ne doit pas lancer deux demandes simultanées à Stripe.
  const creationEnCours = useRef(false);
  async function creer() {
    if (creationEnCours.current) return;
    creationEnCours.current = true;
    try { await creerLien(); } finally { creationEnCours.current = false; }
  }
  async function creerLien() {
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.functions.invoke('pr-lien-carte', { body: { action: 'creer', demandeId: dossier.demande_id } });
    setBusy(false);
    if (e) { setError(await messageFonction(e)); return; }
    const r = data as { lien: string; expireAt: string; montantEur: number };
    setLien(r.lien);
    setExpireAt(r.expireAt);
    if (r.montantEur) setMontantEur(r.montantEur);
    setSvg(await QRCode.toString(r.lien, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, width: 260 }));
  }

  useEffect(() => { creer(); }, [dossier.demande_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Le paiement arrive par le webhook Stripe : on suit l'etat du dossier.
  useEffect(() => {
    if (paye) return;
    const t = window.setInterval(async () => {
      const { data } = await supabase.rpc('admin_pr_dossiers_guichet', { p_point_id: point.id });
      const d = ((data ?? []) as { demande_id: string; statut_paiement: string }[]).find((x) => x.demande_id === dossier.demande_id);
      if (d && d.statut_paiement !== 'en_attente') setPaye(true);
    }, 5000);
    return () => window.clearInterval(t);
  }, [paye, point.id, dossier.demande_id]);

  async function copier() {
    if (!lien) return;
    try {
      await navigator.clipboard.writeText(lien);
      setCopie(true);
      window.setTimeout(() => setCopie(false), 2000);
    } catch { setError('Copie impossible : sélectionnez le lien à la main.'); }
  }

  async function payerAutrement() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.functions.invoke('pr-lien-carte', { body: { action: 'annuler', demandeId: dossier.demande_id } });
    if (e) { setBusy(false); setError(await messageFonction(e)); return; }
    const { error: e2 } = await supabase.rpc('admin_pr_changer_moyen_guichet', {
      p_demande_id: dossier.demande_id,
      p_moyen: point.accepte_especes ? 'especes' : 'mobile_money',
    });
    setBusy(false);
    if (e2) { setError(e2.message); return; }
    onAutrement();
  }

  const texteWhatsApp = lien
    ? `Bonjour ${dossier.client_nom}, voici le lien pour payer votre envoi Wonjo #${dossier.reference} (${montantEuros(montantEur)}) par carte : ${lien}\n`
      + `Le montant est réservé sur votre carte et débité seulement quand le voyageur accepte votre colis. Point relais Wonjo de ${point.ville}.`
    : '';

  if (paye) {
    return (
      <Modal onClose={() => onPaye(`Carte du client autorisée pour #${dossier.reference} : le voyageur a été prévenu et peut accepter.`)}>
        <h2 className="modal-title">Paiement reçu #{dossier.reference}</h2>
        <div className="modal-body">
          <div className="pr-a-recevoir pr-a-recevoir--ok">
            <span>Carte de {dossier.client_nom}</span>
            <strong>{montantEuros(montantEur)}</strong>
            <small>Réservé sur la carte, débité quand le voyageur accepte</small>
          </div>
          <p className="hint" style={{ marginTop: 12 }}>Le voyageur a été prévenu. Gardez le colis : enregistrez le dépôt dans « Dépôts et remises ».</p>
          <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn-primary" onClick={() => onPaye(`Carte du client autorisée pour #${dossier.reference} : le voyageur a été prévenu et peut accepter.`)}>Terminé</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="modal-title">Paiement par carte #{dossier.reference}</h2>
      <div className="modal-body">
        <div className="pr-a-recevoir">
          <span>À payer par {dossier.client_nom}</span>
          <strong>{montantEuros(montantEur)}</strong>
          <small>≈ {montantLocal(dossier.montant_local, dossier.devise)} · débité en euros par la banque du client</small>
        </div>

        {error && <p className="page-error" style={{ marginTop: 12 }}>{error}</p>}

        <div className="pr-qr">
          {svg ? <div className="pr-qr-image" dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="loading-state">{busy ? 'Création du lien…' : ''}</p>}
          {lien && (
            <div className="pr-qr-code">
              <span>Le client scanne ce code avec l'appareil photo de son téléphone</span>
              {expireAt && <small className="hint">Lien valable jusqu'au {dateCourte(expireAt)}</small>}
            </div>
          )}
        </div>

        {lien && (
          <div className="pr-lien-carte">
            <input type="text" readOnly value={lien} aria-label="Lien de paiement" onFocus={(e) => e.target.select()} />
            <button className="btn btn-soft btn-sm" onClick={copier}>{copie ? 'Copié' : 'Copier'}</button>
            <a className="btn btn-soft btn-sm" href={`https://wa.me/${dossier.client_telephone.replace(/\D/g, '')}?text=${encodeURIComponent(texteWhatsApp)}`}
               target="_blank" rel="noopener noreferrer">WhatsApp</a>
          </div>
        )}

        <p className="hint" style={{ marginTop: 12 }}>
          Le montant est réservé sur la carte et débité seulement quand le voyageur accepte. S'il refuse ou ne répond pas, rien n'est débité.
          Cette fenêtre se met à jour dès que le client a payé.
        </p>

        <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn btn-soft" style={{ marginRight: 'auto' }} onClick={payerAutrement} disabled={busy}>
            {point.accepte_especes ? 'Payer en espèces à la place' : 'Payer par mobile money à la place'}
          </button>
          {error && !lien && <button className="btn" onClick={creer} disabled={busy}>Réessayer</button>}
          <button className="btn btn-primary" onClick={onClose} disabled={busy}>Fermer</button>
        </div>
      </div>
    </Modal>
  );
}

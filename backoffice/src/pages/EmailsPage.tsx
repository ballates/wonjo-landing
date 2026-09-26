import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Select, type Option } from '../components/Select';
import { Person } from '../components/Avatar';
import { DataTable, type Column } from '../components/DataTable';
import { dateHeure } from '../lib/labels';
import logo from '../assets/wonjo-logo.png';

type TypeEmail = 'service' | 'promotion';

const SEGMENTS: Option<string>[] = [
  { value: 'tous', label: 'Tous les membres', hint: 'Comptes actifs non supprimés' },
  { value: 'non_verifies', label: 'Identité non vérifiée', hint: 'Pour les inciter à finir leur vérification' },
  { value: 'telephone_non_verifie', label: 'Téléphone non vérifié' },
  { value: 'kyc_en_attente', label: 'KYC en attente' },
  { value: 'kyc_rejete', label: 'KYC rejeté', hint: 'Pour les aider à recommencer' },
  { value: 'inactifs_30j', label: 'Inactifs depuis 30 jours', hint: 'Pour les inviter à revenir' },
  { value: 'sans_transaction', label: 'Jamais fait de transaction' },
  { value: 'sans_stripe', label: 'Paiements non configurés', hint: 'Voyageurs qui ne peuvent pas encore être payés' },
  { value: 'ambassadeurs', label: 'Ambassadeurs et légendes' },
];

const LABELS_SEGMENT: Record<string, string> = Object.fromEntries([...SEGMENTS.map((s) => [s.value, s.label]), ['selection', 'Sélection manuelle']]);

interface Campagne {
  id: string;
  created_at: string;
  type: TypeEmail;
  sujet: string;
  segment: string;
  nb_destinataires: number;
  nb_envoyes: number;
  nb_echecs: number;
  admin_nom: string | null;
  admin_avatar: string | null;
}

export function EmailsPage() {
  const location = useLocation();
  // Pre-remplissage depuis Moderation (comptes coches) ou Commissions
  // ("Prevenir par email" d'une regle).
  const etat = (location.state ?? null) as {
    ids?: string[]; noms?: string[]; segment?: string; type?: TypeEmail; sujet?: string; message?: string;
  } | null;
  const selectionInitiale = etat?.ids && etat.ids.length ? { ids: etat.ids, noms: etat.noms ?? [] } : null;

  const [type, setType] = useState<TypeEmail>(etat?.type ?? 'service');
  const [segment, setSegment] = useState(selectionInitiale ? 'selection' : etat?.segment ?? 'non_verifies');
  const [ids] = useState<string[]>(selectionInitiale?.ids ?? []);
  const [sujet, setSujet] = useState(etat?.sujet ?? '');
  const [message, setMessage] = useState(etat?.message ?? '');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [compte, setCompte] = useState<{ destinataires: number; desinscrits_exclus: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [campagnes, setCampagnes] = useState<Campagne[] | null>(null);

  const segmentOptions = useMemo(
    () => (selectionInitiale ? [{ value: 'selection', label: `Sélection manuelle (${ids.length})`, hint: 'Comptes cochés dans Modération' }, ...SEGMENTS] : SEGMENTS),
    [selectionInitiale, ids.length],
  );

  function chargerCampagnes() {
    supabase.rpc('admin_lister_campagnes').then(({ data }) => setCampagnes((data ?? []) as Campagne[]));
  }
  useEffect(chargerCampagnes, []);

  useEffect(() => {
    setCompte(null);
    const t = setTimeout(() => {
      supabase.rpc('admin_compter_destinataires', { p_segment: segment, p_ids: ids, p_type: type }).then(({ data }) => {
        if (data) setCompte(data as { destinataires: number; desinscrits_exclus: number });
      });
    }, 200);
    return () => clearTimeout(t);
  }, [segment, type, ids]);

  const pret = sujet.trim().length > 0 && message.trim().length > 0 && (!ctaUrl || ctaUrl.startsWith('https://'));

  async function envoyer(test: boolean) {
    if (!pret) return;
    if (!test && !window.confirm(`Envoyer cet email à ${compte?.destinataires ?? '?'} destinataire(s) ? Cette action est définitive.`)) return;
    setBusy(true);
    setRetour(null);
    const { data, error } = await supabase.functions.invoke('admin-envoyer-email', {
      body: {
        type, segment, ids, sujet, message, test,
        cta_label: ctaLabel.trim() || undefined,
        cta_url: ctaUrl.trim() || undefined,
      },
    });
    setBusy(false);
    if (error) {
      let texte = error.message;
      try { texte = (await (error as { context?: Response }).context?.json())?.error ?? texte; } catch { /* reponse non JSON */ }
      setRetour({ ok: false, texte });
      return;
    }
    const r = data as { envoyes: number; destinataires: number; echecs: number };
    setRetour({
      ok: r.echecs === 0,
      texte: test ? 'Email de test envoyé sur votre adresse.' : `${r.envoyes} email(s) envoyé(s) sur ${r.destinataires}${r.echecs ? `, ${r.echecs} échec(s)` : ''}.`,
    });
    if (!test) chargerCampagnes();
  }

  const apercu = message.split('{prenom}').join('Aïcha');

  const colonnes: Column<Campagne>[] = [
    { key: 'date', label: 'Date', value: (c) => c.created_at, render: (c) => dateHeure(c.created_at), width: 170 },
    { key: 'par', filter: 'options', label: 'Par', value: (c) => c.admin_nom, render: (c) => <Person src={c.admin_avatar} nom={c.admin_nom ?? '-'} size={28} /> },
    { key: 'type', filter: 'options', label: 'Type', value: (c) => (c.type === 'promotion' ? 'Promotion' : 'Information'), render: (c) => <span className={`badge ${c.type === 'promotion' ? 'badge-amber' : 'badge-teal'}`}>{c.type === 'promotion' ? 'Promotion' : 'Information'}</span> },
    { key: 'sujet', label: 'Objet', value: (c) => c.sujet },
    { key: 'cible', filter: 'options', label: 'Cible', value: (c) => LABELS_SEGMENT[c.segment] ?? c.segment },
    { key: 'envoyes', label: 'Envoyés', value: (c) => c.nb_envoyes, render: (c) => `${c.nb_envoyes} / ${c.nb_destinataires}${c.nb_echecs ? ` (${c.nb_echecs} échecs)` : ''}` },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Emails</h1>
          <p className="page-sub">Écrire à un membre, à une sélection ou à un groupe. Chaque envoi est tracé dans le journal.</p>
        </div>
      </div>

      <div className="email-layout">
        <div className="panel email-form">
          <div className="segmented" role="radiogroup" aria-label="Type d'email">
            <button role="radio" aria-checked={type === 'service'} className={type === 'service' ? 'on' : ''} onClick={() => setType('service')}>
              <b>Information</b><span>Lié au compte : vérification, reconnexion, nouveauté</span>
            </button>
            <button role="radio" aria-checked={type === 'promotion'} className={type === 'promotion' ? 'on' : ''} onClick={() => setType('promotion')}>
              <b>Promotion</b><span>Offre commerciale, avec lien de désinscription</span>
            </button>
          </div>

          <label className="field">
            <span>Destinataires</span>
            <Select ariaLabel="Destinataires" value={segment} onChange={setSegment} options={segmentOptions} />
          </label>
          {segment === 'selection' && selectionInitiale && (
            <div className="chips">
              {selectionInitiale.noms.slice(0, 12).map((n, i) => <span key={i} className="chip">{n}</span>)}
              {selectionInitiale.noms.length > 12 && <span className="chip">+{selectionInitiale.noms.length - 12}</span>}
            </div>
          )}
          <p className="hint">
            {compte ? <><b>{compte.destinataires}</b> destinataire(s)</> : 'Calcul…'}
            {compte && compte.desinscrits_exclus > 0 && ` · ${compte.desinscrits_exclus} désinscrit(s) exclu(s)`}
            {type === 'promotion' && ' · comptes bloqués exclus'}
          </p>

          <label className="field">
            <span>Objet</span>
            <input type="text" maxLength={150} value={sujet} onChange={(e) => setSujet(e.target.value)} placeholder="Ex. Finalisez votre vérification en 2 minutes" />
          </label>
          <label className="field">
            <span>Message</span>
            <textarea rows={8} maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={'Écrivez votre message.\n\nAstuce : {prenom} est remplacé par le prénom de chaque destinataire.'} />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Bouton (facultatif)</span>
              <input type="text" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Ex. Ouvrir Wonjo" />
            </label>
            <label className="field">
              <span>Lien du bouton</span>
              <input type="text" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://wonjo.app" />
            </label>
          </div>

          {retour && <p className={retour.ok ? 'success-text' : 'page-error'}>{retour.texte}</p>}
          <div className="action-row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" disabled={!pret || busy} onClick={() => envoyer(true)}>M'envoyer un test</button>
            <button className="btn btn-primary" disabled={!pret || busy || !compte?.destinataires} onClick={() => envoyer(false)}>
              {busy ? 'Envoi…' : `Envoyer à ${compte?.destinataires ?? '…'} destinataire(s)`}
            </button>
          </div>
        </div>

        <div className="email-preview-wrap">
          <p className="section-title">Aperçu</p>
          <div className="email-preview">
            <div className="email-preview-head">
              <img className="email-preview-logo" src={logo} alt="" width={81} height={44} />
              <span className="email-preview-title">WONJO</span>
              <span className="email-preview-slogan">Le colis qui nous lie</span>
            </div>
            <div className="email-preview-body">
              <h4>Bonjour Aïcha</h4>
              {(apercu || 'Votre message apparaîtra ici.').split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p.split('\n').map((l, j) => <span key={j}>{l}{j < p.split('\n').length - 1 && <br />}</span>)}</p>
              ))}
              {ctaLabel && <span className="email-preview-cta">{ctaLabel}</span>}
              {type === 'promotion' && <small>Vous recevez cet email car vous avez un compte Wonjo. Ne plus recevoir nos offres</small>}
            </div>
            {/* Meme pied que emailFooter() (_shared/email-layout.ts) des emails de l'app. */}
            <div className="email-preview-foot">
              © 2026 <b>Wonjo</b> · <u>Nous contacter</u><br />
              Email automatique, merci de ne pas y répondre.
            </div>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <h3>Historique des envois</h3>
        <p className="chart-sub">Les emails de test ne sont pas enregistrés ici.</p>
        {!campagnes ? <p className="hint">Chargement…</p> : (
          <DataTable rows={campagnes} columns={colonnes} rowKey={(c) => c.id} initialSort={{ key: 'date', dir: 'desc' }} emptyText="Aucun envoi pour l'instant." />
        )}
      </div>
    </div>
  );
}

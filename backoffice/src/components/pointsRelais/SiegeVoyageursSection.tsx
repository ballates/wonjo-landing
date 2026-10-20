import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../Modal';
import { InfoBulle } from '../InfoBulle';
import { Badge } from '../Badge';
import { DataTable, type Column } from '../DataTable';
import { Copiable } from './Copiable';
import { InterrupteurPointsRelais } from './InterrupteurPointsRelais';
import { COULEUR_OPERATEUR, LABEL_OPERATEUR, dateCourte, dateJour, libelleDevise, montantEuros, montantLocal, type Operateur } from '../../lib/pointsRelais';

// Voyageurs à payer par la FINANCE CENTRALE (migrations 425 et 427, docs/POINTS_RELAIS.md § 7) : un voyageur sans compte Stripe a configuré
// son mobile money (nom du titulaire = pièce d'identité, code par e-mail) ; 24 h après la livraison la finance lui envoie l'argent, puis
// enregistre ici la référence de l'opérateur. Un numéro modifié il y a moins de 48 h est RETENU (fraude après vol de compte) : la finance
// le voit et le serveur refuse le paiement. Les transports hors point relais (app) y figurent aussi. Le serveur contrôle les droits (finance et super administrateur), le montant exact, la référence, le gel pendant une contestation et
// qu'un voyageur ne soit payé qu'une fois. Les paiements forment un grand livre propre, inaltérable.

interface AAPayer {
  demande_id: string; reference: string; trajet: string; livre_at: string | null; pret_at: string | null;
  porteur_nom: string | null; porteur_telephone: string | null; compte_stripe: boolean;
  mm_operateur: Operateur | 'autre_mobile' | null; mm_operateur_autre: string | null; mm_numero: string | null; montant_local: number; devise: string; montant_eur: number;
  contestation: boolean; point_arrivee: string | null; origine: 'point' | 'app'; titulaire: string | null; retenu_jusqu_a: string | null;
}
interface Paye {
  demande_id: string; reference: string; porteur_nom: string | null; moyen: string; numero: string | null; montant_local: number; devise: string;
  reference_paiement: string; paye_at: string; paye_par_nom: string | null;
}

const MOYENS_SIEGE: { cle: string; label: string; couleur: string }[] = [
  ...(['orange_money', 'wave', 'mtn_momo', 'moov_money'] as Operateur[]).map((o) => ({ cle: o, label: LABEL_OPERATEUR[o], couleur: COULEUR_OPERATEUR[o] })),
  { cle: 'autre_mobile', label: 'Autre mobile money', couleur: '#8A879E' },
  { cle: 'virement_bancaire', label: 'Virement bancaire', couleur: '#635BFF' },
];

// « Autre » : le voyageur a saisi le nom de son opérateur.
function operateurDe(code: string | null, autre: string | null): string {
  if (code === 'autre_mobile') return autre || 'Autre mobile money';
  return LABEL_OPERATEUR[(code ?? 'autre') as Operateur] ?? code ?? '';
}

function messageErreur(brut: string): string {
  if (brut.includes('different du montant')) return 'Le montant doit être exactement celui indiqué.';
  if (brut.includes('Contestation')) return 'Une contestation est en cours : ce paiement est gelé.';
  if (brut.includes('deja paye')) return 'Ce voyageur est déjà payé.';
  if (brut.includes('Reference')) return 'Saisissez la référence de la transaction (4 caractères au moins).';
  if (brut.includes('ne se paie pas')) return 'Ce dossier ne se paie pas ici (déjà traité par Stripe ou par un point relais).';
  if (brut.includes('retenu')) return 'Numéro modifié il y a moins de 48 h : paiement retenu. Réessayez plus tard.';
  return brut;
}

export function SiegeVoyageursSection() {
  const [aPayer, setAPayer] = useState<AAPayer[] | null>(null);
  const [payes, setPayes] = useState<Paye[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [payer, setPayer] = useState<AAPayer | null>(null);
  const [viaStripe, setViaStripe] = useState<AAPayer | null>(null);

  function charger() {
    supabase.rpc('admin_siege_voyageurs_a_payer').then(({ data, error: e }) => {
      if (e) { setError(e.message); setAPayer([]); return; }
      setAPayer((data ?? []) as AAPayer[]);
    });
    supabase.rpc('admin_siege_voyageurs_payes').then(({ data }) => setPayes((data ?? []) as Paye[]));
  }
  useEffect(charger, []); // eslint-disable-line react-hooks/exhaustive-deps

  const colonnes: Column<AAPayer>[] = [
    { key: 'ref', label: 'Dossier', value: (v) => v.reference, width: 100, render: (v) => <span className="pr-nowrap"><span className="pr-ref">#{v.reference}</span>{v.origine === 'app' && <span className="hint" title="Dossier venu de l'app"> · app</span>}</span> },
    { key: 'voyageur', label: 'Voyageur', value: (v) => v.porteur_nom ?? '', render: (v) => <strong className="pr-nowrap">{v.porteur_nom ?? '-'}</strong> },
    { key: 'tel', label: 'Téléphone', value: (v) => v.porteur_telephone ?? '', render: (v) => v.porteur_telephone ? <span className="pr-nowrap">{v.porteur_telephone}</span> : <span className="hint">-</span> },
    { key: 'trajet', label: 'Trajet', value: (v) => v.trajet, render: (v) => <span className="pr-nowrap">{v.trajet}</span> },
    { key: 'moyen', label: 'Où envoyer', value: (v) => v.mm_numero ?? '',
      render: (v) => v.mm_numero ? <span className="pr-nowrap"><span className="hint">{operateurDe(v.mm_operateur, v.mm_operateur_autre)} · </span><Copiable valeur={v.mm_numero} />{v.titulaire && <span className="hint" title="Titulaire du compte"> · {v.titulaire}</span>}</span>
        : <span title={v.compte_stripe ? 'Le voyageur a un compte Stripe : le virement se fait via Stripe' : 'Le voyageur n\'a enregistré aucun moyen de versement'}><Badge tone="amber">{v.compte_stripe ? 'Stripe' : 'Aucun moyen'}</Badge></span> },
    { key: 'montant', label: 'À envoyer', value: (v) => Number(v.montant_local), render: (v) => <strong className="pr-nowrap">{montantLocal(v.montant_local, v.devise)}</strong> },
    { key: 'euros', label: 'En euros', value: (v) => Number(v.montant_eur), render: (v) => <span className="pr-nowrap">{montantEuros(v.montant_eur)}</span> },
    { key: 'livre', label: 'Prêt depuis', value: (v) => v.pret_at ?? '', filter: 'date', width: 110, render: (v) => (v.pret_at ? dateJour(v.pret_at) : '-') },
    { key: 'actions', label: '', width: 190,
      render: (v) => v.contestation
        ? <Badge tone="danger">Gelé : contestation</Badge>
        : v.retenu_jusqu_a && !v.compte_stripe
        ? <span title="Numéro de versement modifié il y a moins de 48 h"><Badge tone="amber">Retenu jusqu'au {dateCourte(v.retenu_jusqu_a)}</Badge></span>
        : (
          <div className="pr-paie">
            {v.compte_stripe && v.origine === 'point' && (
              <button className="pr-paie-btn pr-paie-btn--stripe" title="Transfert depuis le solde Stripe de Wonjo, pour ce voyageur seulement"
                      onClick={() => { setMessage(null); setViaStripe(v); }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></svg>
                Via Stripe
              </button>
            )}
            <button className={`pr-paie-btn ${v.compte_stripe && v.origine === 'point' ? 'pr-paie-btn--autre' : 'pr-paie-btn--stripe'}`}
                    title={v.compte_stripe && v.origine === 'point' ? 'Payer par un autre moyen (mobile money…) et noter la référence' : undefined}
                    onClick={() => { setMessage(null); setPayer(v); }}>
              {v.compte_stripe && v.origine === 'point' ? 'Autre moyen' : 'Payer'}
            </button>
          </div>
        ) },
  ];

  const colonnesPayes: Column<Paye>[] = [
    { key: 'date', label: 'Payé le', value: (p) => p.paye_at, filter: 'date', width: 150, render: (p) => dateCourte(p.paye_at) },
    { key: 'ref', label: 'Dossier', value: (p) => p.reference, width: 110, render: (p) => <span className="pr-ref">#{p.reference}</span> },
    { key: 'voyageur', label: 'Voyageur', value: (p) => p.porteur_nom ?? '' },
    { key: 'moyen', label: 'Moyen', value: (p) => p.moyen, render: (p) => <span>{MOYENS_SIEGE.find((m) => m.cle === p.moyen)?.label ?? p.moyen}{p.numero ? <span className="hint"> · {p.numero}</span> : null}</span> },
    { key: 'montant', label: 'Montant', value: (p) => Number(p.montant_local), render: (p) => <strong>{montantLocal(p.montant_local, p.devise)}</strong> },
    { key: 'refpaie', label: 'Référence', value: (p) => p.reference_paiement, render: (p) => <span className="hint">{p.reference_paiement}</span> },
    { key: 'par', label: 'Par', value: (p) => p.paye_par_nom ?? '' },
  ];

  return (
    <div style={{ marginBottom: 24 }}>
      <InterrupteurPointsRelais
        cle="points_relais_virement_avance"
        titre="Paiement automatique des voyageurs par Stripe"
        compact
        sousTitre="Allumé : les voyageurs qui ont un compte Stripe sont payés automatiquement. Éteint : la finance les paie à la main."
        avertissementAllumer="Le virement part de votre solde Stripe disponible : un solde insuffisant fait échouer le transfert (le dossier reste alors à traiter). Allumez seulement après un essai en mode test."
      />
      <div className="pr-entete">
        <div>
          <h3>À payer par la finance<InfoBulle>Payés 24 h après la livraison. Mobile money : envoyez, puis notez la référence. Compte Stripe : « Via Stripe ».</InfoBulle></h3>
        </div>
      </div>
      {error && <p className="page-error">{error}</p>}
      {message && <p className="success-text" style={{ marginBottom: 12 }}>{message}</p>}
      {!aPayer ? <p className="loading-state">Chargement…</p> : (
        <div className="pr-dense">
        <DataTable rows={aPayer} columns={colonnes} rowKey={(v) => v.demande_id} integre title="Voyageurs à payer" emptyText="Aucun voyageur à payer pour le moment : les paiements apparaissent 24 h après la livraison." pageSize={10} />
        </div>
      )}
      {payes.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13.5 }}>Déjà payés ({payes.length})</summary>
          <div style={{ marginTop: 10 }}>
            <DataTable rows={payes} columns={colonnesPayes} rowKey={(p) => p.demande_id} integre title="Historique" initialSort={{ key: 'date', dir: 'desc' }} pageSize={10} />
          </div>
        </details>
      )}
      {viaStripe && <StripeModal item={viaStripe} onClose={() => setViaStripe(null)} onPaye={(texte) => { setViaStripe(null); setMessage(texte); charger(); }} />}
      {payer && <PaiementModal item={payer} onClose={() => setPayer(null)} onPaye={(texte) => { setPayer(null); setMessage(texte); charger(); }} />}
    </div>
  );
}

function PaiementModal({ item, onClose, onPaye }: { item: AAPayer; onClose: () => void; onPaye: (message: string) => void }) {
  const [moyen, setMoyen] = useState(() => (item.mm_operateur && MOYENS_SIEGE.some((m) => m.cle === item.mm_operateur) ? item.mm_operateur : item.compte_stripe ? 'virement_bancaire' : 'wave'));
  const [reference, setReference] = useState('');
  const [verifie, setVerifie] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const referenceOk = reference.trim().length >= 4;
  const unite = libelleDevise(item.devise);
  const retenu = !!item.retenu_jusqu_a && moyen !== 'virement_bancaire';

  async function valider() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc('admin_siege_payer_voyageur', {
      p_demande_id: item.demande_id, p_moyen: moyen, p_montant: item.montant_local, p_reference: reference.trim(),
    });
    setBusy(false);
    if (e) { setError(messageErreur(e.message)); return; }
    onPaye(`${item.porteur_nom ?? 'Le voyageur'} payé : ${montantLocal(item.montant_local, item.devise)}. Il a reçu une confirmation dans l'app.`);
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="modal-title">Payer le voyageur #{item.reference}</h2>
      <div className="modal-body">
        <div className="pr-a-recevoir">
          <span>À envoyer à {item.porteur_nom ?? 'le voyageur'}</span>
          <strong>{montantLocal(item.montant_local, item.devise)}</strong>
          <small>{montantEuros(item.montant_eur)} · {item.trajet}</small>
        </div>

        <div className="form-grid" style={{ marginTop: 16 }}>
          {item.mm_numero ? (
            <div className="insight-banner">
              <div>
                <strong>Envoyez sur {operateurDe(item.mm_operateur, item.mm_operateur_autre)} <Copiable valeur={item.mm_numero} /></strong>
                <span>{item.titulaire ? `Compte au nom de ${item.titulaire} (pièce d'identité vérifiée). ` : ''}Numéro confirmé par code dans l'app du voyageur. Envoyez exactement ce montant, puis saisissez la référence du transfert.</span>
              </div>
            </div>
          ) : (
            <p className="hint" style={{ color: 'var(--badge-amber-fg)' }}>
              Ce voyageur n'a pas de mobile money enregistré{item.compte_stripe ? ' (il a un compte Stripe : le virement bancaire est possible)' : ' : contactez-le avant de payer'}.
            </p>
          )}

          {retenu && item.retenu_jusqu_a && (
            <p className="page-error">Numéro modifié il y a moins de 48 h : paiement retenu jusqu'au {dateCourte(item.retenu_jusqu_a)}. Le serveur refusera le paiement avant.</p>
          )}

          <div>
            <strong style={{ fontSize: 13 }}>Comment le payez-vous ?</strong>
            <div className="moyens" role="radiogroup" aria-label="Moyen de paiement">
              {MOYENS_SIEGE.map((m) => (
                <button key={m.cle} type="button" role="radio" aria-checked={moyen === m.cle} className={`moyen-pill ${moyen === m.cle ? 'on' : ''}`}
                        onClick={() => { setMoyen(m.cle); setVerifie(false); }}>
                  <span className="moyen-pastille" style={{ background: m.couleur }} aria-hidden="true" />
                  <span className="moyen-texte"><strong>{m.label}</strong></span>
                </button>
              ))}
            </div>
          </div>

          <label>
            Référence du transfert (SMS ou reçu de l'opérateur)
            <input type="text" value={reference} maxLength={80} autoComplete="off" placeholder="Ex. CI241014.1532.A12345"
                   className={reference.trim() && !referenceOk ? 'champ-invalide' : ''}
                   onChange={(e) => { setReference(e.target.value); setVerifie(false); }} />
          </label>

          <label style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, fontWeight: 600 }}>
            <input type="checkbox" checked={verifie} disabled={!referenceOk} onChange={(e) => setVerifie(e.target.checked)} style={{ marginTop: 3 }} />
            <span>J'ai envoyé {montantLocal(item.montant_local, item.devise)} {item.mm_numero && moyen !== 'virement_bancaire' ? `au ${item.mm_numero}` : 'au voyageur'} par {MOYENS_SIEGE.find((m) => m.cle === moyen)?.label ?? ''} et le transfert est confirmé.</span>
          </label>
        </div>

        {error && <p className="page-error" style={{ marginTop: 12 }}>{error}</p>}
        <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn" onClick={onClose} disabled={busy}>Annuler</button>
          <button className="btn btn-primary" onClick={valider} disabled={busy || !verifie || !referenceOk || retenu}>
            {busy ? 'Enregistrement…' : `Enregistrer le paiement de ${montantLocal(item.montant_local, item.devise)}`}
          </button>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>Montant en {unite}. Le paiement est inscrit dans le grand livre de la finance, inaltérable.</p>
      </div>
    </Modal>
  );
}

// « Payer via Stripe » (migration 431) : la fonction payer-voyageur-stripe contrôle tout côté serveur, fait le transfert depuis le solde Stripe de
// Wonjo vers le compte du voyageur (une seule fois par dossier : clé d'idempotence), puis l'inscrit au grand livre et prévient le voyageur.
function StripeModal({ item, onClose, onPaye }: { item: AAPayer; onClose: () => void; onPaye: (message: string) => void }) {
  const [verifie, setVerifie] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function valider() {
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.functions.invoke('payer-voyageur-stripe', { body: { demandeId: item.demande_id } });
    if (e) {
      const ctx = (e as { context?: Response }).context;
      const corps = ctx ? await ctx.json().catch(() => null) as { error?: string } | null : null;
      setBusy(false);
      setError(corps?.error ?? e.message);
      return;
    }
    setBusy(false);
    onPaye(`${item.porteur_nom ?? 'Le voyageur'} payé par Stripe : ${montantEuros((data as { montant_eur?: number })?.montant_eur ?? item.montant_eur)} (transfert ${(data as { transferId?: string })?.transferId ?? ''}). Il a reçu une confirmation dans l'app.`);
  }

  const nom = item.porteur_nom ?? 'le voyageur';
  return (
    <Modal onClose={onClose} narrow>
      <div className="vs-tete">
        <span className="vs-pastille" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></svg>
        </span>
        <div>
          <h2>Payer via Stripe</h2>
          <p>Dossier #{item.reference} · {item.trajet}</p>
        </div>
      </div>
      <div className="modal-body" style={{ gap: 14, paddingTop: 16 }}>
        <div className="vs-flux" role="group" aria-label="Sens du transfert">
          <div className="vs-bord"><small>De</small><strong>Solde Stripe de Wonjo</strong></div>
          <span className="vs-fleche" aria-hidden="true" />
          <div className="vs-bord vs-bord--dest"><small>Vers</small><strong>{nom}</strong></div>
          <div className="vs-montant"><strong>{montantEuros(item.montant_eur)}</strong><span>{montantLocal(item.montant_local, item.devise)}</span></div>
        </div>
        <p className="vs-note"><b>Le virement est immédiat et ne s'annule pas.</b> Si le solde Stripe est insuffisant, il est refusé et rien ne part : réapprovisionnez puis recommencez. La caisse du point reste intacte.</p>
        <label className={`vs-confirme ${verifie ? 'on' : ''}`}>
          <input type="checkbox" checked={verifie} onChange={(e) => setVerifie(e.target.checked)} />
          <span>J'ai vérifié le solde Stripe et je confirme le transfert de <strong>{montantEuros(item.montant_eur)}</strong> à {nom}.</span>
        </label>
        {error && <p className="page-error" style={{ marginTop: 12 }}>{error}</p>}
        <div className="vs-pied">
          <button className="btn" onClick={onClose} disabled={busy}>Annuler</button>
          <button className="btn btn-primary" onClick={valider} disabled={busy || !verifie}>
            {busy ? 'Transfert en cours…' : `Virer ${montantEuros(item.montant_eur)}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

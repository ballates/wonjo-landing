import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../Modal';
import { Badge } from '../Badge';
import {
  COULEUR_OPERATEUR, LABEL_OPERATEUR, dateCourte, libelleDevise, montantEuros, montantLocal, moyenDepuisOperateur,
  type MoyenRecu, type Operateur, type PointRelais,
} from '../../lib/pointsRelais';

// Voyageurs a payer (migration 405, docs/POINTS_RELAIS.md § 7) : colis livres depuis 24 h, sans litige, dont le
// voyageur n'a pas de compte de paiement Stripe. Le point d'arrivee (ou celui du depot) le paie en mobile money ou
// en especes. Le voyageur donne son code de retrait (visible dans son app) : sans lui, le serveur refuse. S'il a saisi
// son numero mobile money dans l'app (412), le point lui envoie l'argent sans code, mais seulement vers cet operateur.

interface AVerser {
  demande_id: string;
  reference: string;
  trajet: string | null;
  livre_at: string | null;
  pret_at: string;
  porteur_nom: string | null;
  porteur_telephone: string | null;
  montant_local: number;
  devise: string;
  montant_eur: number;
  point_de_versement: boolean;
  essais_restants: number;
  contestation: boolean;
  /** Numero mobile money saisi par le voyageur dans l'app (412) : paiement sans code, vers cet operateur. */
  mm_operateur: string | null;
  mm_numero: string | null;
}

export function VoyageursSection({ point }: { point: PointRelais }) {
  const [items, setItems] = useState<AVerser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [aPayer, setAPayer] = useState<AVerser | null>(null);

  function charger() {
    supabase.rpc('admin_pr_voyageurs_a_payer', { p_point_id: point.id }).then(({ data, error: e }) => {
      if (e) { setError(e.message); setItems([]); return; }
      setError(null);
      setItems((data ?? []) as AVerser[]);
    });
  }
  useEffect(() => { setItems(null); charger(); }, [point.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = useMemo(() => (items ?? []).reduce((s, i) => s + Number(i.montant_local), 0), [items]);

  return (
    <div>
      <div className="pr-entete">
        <div>
          <h3>Voyageurs à payer</h3>
          <p className="hint">
            Colis livrés depuis 24 h, sans litige. Payez le voyageur seulement avec son <strong>code de retrait</strong> : il le trouve dans l'app, sur la fiche du colis.
          </p>
        </div>
        {items && items.length > 0 && (
          <div className="pr-total">
            <span>{items.length} à payer</span>
            <strong>{montantLocal(total, point.devise)}</strong>
          </div>
        )}
      </div>

      {message && <p className="success-text" style={{ marginBottom: 12 }}>{message}</p>}
      {error && <p className="page-error">{error}</p>}

      {!items ? <p className="loading-state">Chargement…</p> : items.length === 0 ? (
        <div className="empty-state">Aucun voyageur à payer pour le moment.</div>
      ) : (
        <div className="pr-grid">
          {items.map((i) => (
            <article key={i.demande_id} className="pr-card">
              <div className="pr-card-haut">
                <span className="pr-ref">#{i.reference}</span>
                {i.contestation
                  ? <Badge tone="danger">Contestation : gelé</Badge>
                  : <Badge tone={i.point_de_versement ? 'teal' : 'muted'}>{i.point_de_versement ? 'Point d\'arrivée' : 'Point du dépôt'}</Badge>}
              </div>
              <div className="pr-montant">
                <strong>{montantLocal(i.montant_local, i.devise)}</strong>
                <span>{montantEuros(i.montant_eur)} · prix du voyageur</span>
              </div>
              <div className="pr-ligne">
                <span className="pr-libelle">Voyageur</span>
                <span>
                  {i.porteur_nom ?? 'Voyageur'}
                  {i.porteur_telephone && <> · <a className="pr-tel" href={`tel:${i.porteur_telephone.replace(/[^\d+]/g, '')}`}>{i.porteur_telephone}</a></>}
                </span>
              </div>
              <div className="pr-ligne"><span className="pr-libelle">Trajet</span><span>{i.trajet}</span></div>
              {i.mm_numero && (
                <div className="pr-ligne"><span className="pr-libelle">À envoyer sur</span><strong>{LABEL_MOYEN_VERSEMENT[i.mm_operateur ?? ''] ?? 'Mobile money'} {i.mm_numero}</strong></div>
              )}
              {i.livre_at && <div className="pr-ligne"><span className="pr-libelle">Livré</span><span>{dateCourte(i.livre_at)}</span></div>}
              {i.essais_restants < 5 && (
                <div className="pr-ligne"><span className="pr-libelle">Code</span><span style={{ color: 'var(--badge-amber-fg)' }}>{i.essais_restants} essai{i.essais_restants > 1 ? 's' : ''} restant{i.essais_restants > 1 ? 's' : ''}</span></div>
              )}
              <button className="btn btn-primary pr-action" disabled={i.contestation || i.essais_restants === 0}
                      onClick={() => { setMessage(null); setAPayer(i); }}
                      title={i.essais_restants === 0 ? 'Code bloqué après 5 essais : contactez le support Wonjo' : undefined}>
                {i.essais_restants === 0 ? 'Code bloqué' : 'Payer le voyageur'}
              </button>
            </article>
          ))}
        </div>
      )}

      {aPayer && (
        <PayerModal point={point} item={aPayer} onClose={() => { setAPayer(null); charger(); }}
          onPaye={(texte) => { setAPayer(null); setMessage(texte); charger(); }} />
      )}
    </div>
  );
}

const LABEL_MOYEN_VERSEMENT: Record<string, string> = { ...LABEL_OPERATEUR, autre_mobile: 'Mobile money' };

function messageErreur(brut: string): string {
  if (brut.includes('caisse_reference_paiement_unique')) return 'Cette référence a déjà servi pour un autre paiement : vérifiez le SMS de l\'opérateur.';
  if (brut.includes('Solde mobile money insuffisant')) return 'Le compte mobile money du point n\'a pas assez d\'argent pour ce paiement : la finance doit d\'abord l\'approvisionner (onglet Caisse).';
  if (brut.includes('Especes insuffisantes')) return 'La caisse du point n\'a pas assez d\'espèces : payez par mobile money ou attendez un approvisionnement.';
  if (brut.includes('Plafond journalier')) return 'Votre plafond du jour est atteint : demandez à la finance ou à un administrateur de faire ce paiement.';
  if (brut.includes('Trop d\'essais')) return 'Code bloqué après 5 essais : le voyageur doit contacter le support Wonjo.';
  if (brut.includes('deja paye')) return 'Ce voyageur a déjà été payé.';
  if (brut.includes('Contestation')) return 'Une contestation est en cours sur ce transport : le paiement est gelé.';
  return brut;
}

function PayerModal({ point, item, onClose, onPaye }: {
  point: PointRelais; item: AVerser; onClose: () => void; onPaye: (message: string) => void;
}) {
  const moyens = useMemo(() => {
    const liste: { cle: string; moyen: MoyenRecu; label: string; couleur: string; detail: string }[] = point.comptes_mobile_money.map((c, idx) => ({
      cle: `mm-${idx}`,
      moyen: moyenDepuisOperateur(c.operateur as Operateur),
      label: LABEL_OPERATEUR[c.operateur as Operateur] ?? c.operateur,
      couleur: COULEUR_OPERATEUR[c.operateur as Operateur] ?? '#8A879E',
      detail: `Depuis ${c.numero}`,
    }));
    if (point.accepte_especes) liste.push({ cle: 'especes', moyen: 'especes', label: 'Espèces', couleur: '#1D9E75', detail: 'Remises au guichet' });
    return liste;
  }, [point]);
  const [code, setCode] = useState('');
  // Numero saisi par le voyageur : par defaut, le compte du point chez le meme operateur.
  const [choix, setChoix] = useState(() => (moyens.find((m) => item.mm_operateur && m.moyen === item.mm_operateur) ?? moyens[0])?.cle ?? '');
  const [reference, setReference] = useState('');
  const [verifie, setVerifie] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moyen = moyens.find((m) => m.cle === choix);
  const especes = moyen?.moyen === 'especes';
  const versNumero = !!item.mm_numero && moyen?.moyen === item.mm_operateur;
  const codeOk = versNumero || /^\d{6}$/.test(code);
  const referenceOk = reference.trim().length >= (especes ? 1 : 4);

  async function payer() {
    if (!moyen) return;
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc('admin_pr_payer_voyageur', {
      p_demande_id: item.demande_id, p_point_id: point.id, p_code: versNumero ? null : code, p_moyen: moyen.moyen,
      p_montant: item.montant_local, p_reference: reference.trim(),
    });
    setBusy(false);
    if (e) { setError(messageErreur(e.message)); return; }
    const r = data as { ok?: boolean; restant?: number } | null;
    if (!r?.ok) {
      setCode('');
      setVerifie(false);
      setError(r?.restant ? `Code de retrait incorrect : ${r.restant} essai${r.restant > 1 ? 's' : ''} restant${r.restant > 1 ? 's' : ''}. Demandez-le de nouveau au voyageur.`
        : 'Code bloqué après 5 essais : le voyageur doit contacter le support Wonjo.');
      return;
    }
    onPaye(`${item.porteur_nom ?? 'Le voyageur'} payé : ${montantLocal(item.montant_local, item.devise)}. Il a reçu une confirmation dans l'app.`);
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="modal-title">Payer le voyageur #{item.reference}</h2>
      <div className="modal-body">
        <div className="pr-a-recevoir">
          <span>À verser à {item.porteur_nom ?? 'le voyageur'}</span>
          <strong>{montantLocal(item.montant_local, item.devise)}</strong>
          <small>{montantEuros(item.montant_eur)} · {item.trajet}</small>
        </div>

        <div className="form-grid" style={{ marginTop: 16 }}>
          {versNumero ? (
            <div className="insight-banner">
              <div>
                <strong>Envoyez sur {item.mm_numero}</strong>
                <span>Numéro saisi par le voyageur dans son app : pas de code à demander. Envoyez exactement ce montant à ce numéro, puis saisissez la référence du transfert.</span>
              </div>
            </div>
          ) : (
            <label>
              Code de retrait du voyageur (6 chiffres, dans son app)
              <input type="text" inputMode="numeric" autoComplete="off" maxLength={6} value={code} autoFocus
                     className="pr-code-retrait" placeholder="••••••"
                     onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setVerifie(false); }} />
              {item.mm_numero && <span className="hint">Le voyageur a demandé {LABEL_MOYEN_VERSEMENT[item.mm_operateur ?? ''] ?? 'du mobile money'} sur {item.mm_numero} : choisissez ce moyen pour payer sans code.</span>}
            </label>
          )}

          <div>
            <strong style={{ fontSize: 13 }}>Comment le payez-vous ?</strong>
            <div className="moyens" role="radiogroup" aria-label="Moyen de paiement">
              {moyens.map((m) => (
                <button key={m.cle} type="button" role="radio" aria-checked={choix === m.cle}
                        className={`moyen-pill ${choix === m.cle ? 'on' : ''}`} onClick={() => { setChoix(m.cle); setVerifie(false); }}>
                  <span className="moyen-pastille" style={{ background: m.couleur }} aria-hidden="true" />
                  <span className="moyen-texte"><strong>{m.label}</strong><small>{m.detail}</small></span>
                </button>
              ))}
            </div>
            {moyens.length === 0 && <p className="hint">Ce point n'a ni compte mobile money ni espèces : réglez-le dans l'onglet Réseau.</p>}
          </div>

          <label>
            {especes ? 'Numéro du reçu signé par le voyageur' : `Référence du transfert vers le voyageur (SMS de l'opérateur)`}
            <input type="text" value={reference} maxLength={80} autoComplete="off"
                   placeholder={especes ? 'Ex. RV-0042' : 'Ex. CI241014.1532.A12345'}
                   onChange={(e) => { setReference(e.target.value); setVerifie(false); }} />
          </label>

          <label style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, fontWeight: 600 }}>
            <input type="checkbox" checked={verifie} disabled={!codeOk || !referenceOk} onChange={(e) => setVerifie(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              {especes
                ? `J'ai remis ${montantLocal(item.montant_local, item.devise)} en espèces au voyageur, qui a signé le reçu ${reference.trim() || '…'}.`
                : `J'ai envoyé ${montantLocal(item.montant_local, item.devise)} ${versNumero ? `au ${item.mm_numero}` : 'au voyageur'} par ${moyen?.label ?? 'mobile money'} et le transfert est confirmé.`}
            </span>
          </label>
        </div>

        {error && <p className="page-error" style={{ marginTop: 12 }}>{error}</p>}
        <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn" onClick={onClose} disabled={busy}>Annuler</button>
          <button className="btn btn-primary" onClick={payer} disabled={busy || !verifie || !codeOk || !referenceOk || !moyen}>
            {busy ? 'Paiement…' : `Payer ${montantLocal(item.montant_local, item.devise)}`}
          </button>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>Montant en {libelleDevise(item.devise)}, inscrit dans l'historique de la caisse du point.</p>
      </div>
    </Modal>
  );
}

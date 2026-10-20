import { ChampMontant } from '../ChampMontant';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../Modal';
import { Select } from '../Select';
import { RecuActions } from './RecuActions';
import type { Recu } from '../../lib/recu';
import {
  COULEUR_OPERATEUR, LABEL_OPERATEUR, OPERATEURS, dateCourte, echeanceRelative, libelleDevise, montantEuros, montantLocal,
  moyenDepuisOperateur, type MoyenRecu, type Operateur, type PointRelais,
} from '../../lib/pointsRelais';

// File « A encaisser » d'un point relais (parcours A) : les demandes de l'app que l'expediteur a choisi de
// payer au point, les plus urgentes d'abord. Le point focal valide un paiement une fois l'argent recu
// (admin_pr_valider_paiement : le serveur verifie montant exact, reference unique, droits et plafonds).

export interface AEncaisser {
  demande_id: string;
  reference: string;
  moyen_choisi: 'mobile_money' | 'especes';
  montant_local: number;
  devise: string;
  montant_eur: number;
  echeance: string;
  expire: boolean;
  flux: 'trajet' | 'colis';
  trajet: string;
  depart: string | null;
  expediteur_id: string;
  expediteur_nom: string | null;
  expediteur_telephone: string | null;
  porteur_nom: string | null;
  created_at: string;
}

export function AEncaisserSection({ point }: { point: PointRelais }) {
  const [items, setItems] = useState<AEncaisser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aValider, setAValider] = useState<AEncaisser | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [maintenant, setMaintenant] = useState(Date.now());

  function charger() {
    supabase.rpc('admin_pr_a_encaisser', { p_point_id: point.id }).then(({ data, error: e }) => {
      if (e) { setError(e.message); setItems([]); return; }
      setError(null);
      setItems((data ?? []) as AEncaisser[]);
    });
  }
  useEffect(() => {
    setItems(null);
    charger();
    // La file bouge (nouveaux choix, echeances) : rafraichie chaque minute, comme les comptes a rebours.
    const t = window.setInterval(() => { setMaintenant(Date.now()); charger(); }, 60_000);
    return () => window.clearInterval(t);
  }, [point.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = useMemo(() => (items ?? []).filter((i) => !i.expire).reduce((s, i) => s + Number(i.montant_local), 0), [items]);

  return (
    <div>
      <div className="pr-entete">
        <div>
          <h3>À encaisser</h3>
          <p className="hint">
            Demandes de l'app à payer au point <strong>{point.nom}</strong>. Validez un paiement seulement quand l'argent est bien reçu.
          </p>
        </div>
        {items && items.length > 0 && (
          <div className="pr-total">
            <span>{items.filter((i) => !i.expire).length} en attente</span>
            <strong>{montantLocal(total, point.devise)}</strong>
          </div>
        )}
      </div>

      {message && <p className="success-text" style={{ marginBottom: 12 }}>{message}</p>}
      {error && <p className="page-error">{error}</p>}

      {!items ? <p className="loading-state">Chargement…</p> : items.length === 0 ? (
        <div className="empty-state">Rien à encaisser pour le moment. Les demandes payées « via un point relais » apparaîtront ici.</div>
      ) : (
        <div className="pr-grid">
          {items.map((i) => {
            const e = echeanceRelative(i.echeance, maintenant);
            return (
              <article key={i.demande_id} className={`pr-card pr-card--${e.urgence}`}>
                <div className="pr-card-haut">
                  <span className="pr-ref" title="Référence que l'expéditeur indique dans son transfert">#{i.reference}</span>
                  <span className={`pr-urgence pr-urgence--${e.urgence}`}>
                    {e.urgence === 'depasse' ? e.texte.charAt(0).toUpperCase() + e.texte.slice(1) : `Payer ${e.texte}`}
                  </span>
                </div>

                <div className="pr-montant">
                  <strong>{montantLocal(i.montant_local, i.devise)}</strong>
                  <span>{montantEuros(i.montant_eur)}</span>
                </div>

                <div className="pr-ligne">
                  <span className="pr-libelle">Moyen choisi</span>
                  <span>{i.moyen_choisi === 'especes' ? 'Espèces au guichet' : 'Mobile money'}</span>
                </div>
                <div className="pr-ligne">
                  <span className="pr-libelle">Expéditeur</span>
                  <span>
                    {i.expediteur_nom ?? 'Membre'}
                    {i.expediteur_telephone && (
                      <> · <a className="pr-tel" href={`tel:${i.expediteur_telephone.replace(/[^\d+]/g, '')}`}>{i.expediteur_telephone}</a></>
                    )}
                  </span>
                </div>
                <div className="pr-ligne">
                  <span className="pr-libelle">{i.flux === 'trajet' ? 'Trajet réservé' : 'Colis proposé'}</span>
                  <span>{i.trajet}{i.depart ? ` · départ ${dateCourte(i.depart)}` : ''}</span>
                </div>
                {i.porteur_nom && (
                  <div className="pr-ligne">
                    <span className="pr-libelle">Voyageur</span>
                    <span>{i.porteur_nom}</span>
                  </div>
                )}
                <div className="pr-ligne">
                  <span className="pr-libelle">Échéance</span>
                  <span>{dateCourte(i.echeance)}</span>
                </div>

                <button
                  className="btn btn-primary pr-action"
                  disabled={i.expire}
                  onClick={() => { setMessage(null); setAValider(i); }}
                  title={i.expire ? 'Échéance dépassée : la demande va être annulée automatiquement' : undefined}
                >
                  {i.expire ? 'Échéance dépassée' : 'Valider le paiement'}
                </button>
              </article>
            );
          })}
        </div>
      )}

      {aValider && (
        <ValidationModal
          point={point}
          item={aValider}
          onClose={() => setAValider(null)}
          onValide={(texte) => { setAValider(null); setMessage(texte); charger(); }}
        />
      )}
    </div>
  );
}

// Messages du serveur traduits en consignes pour le point focal.
function messageErreur(brut: string): string {
  if (brut.includes('caisse_reference_unique')) return 'Cette référence a déjà été utilisée pour un autre paiement : vérifiez le SMS de l\'opérateur.';
  if (brut.includes('Plafond journalier')) return 'Votre plafond du jour est atteint : demandez à la finance ou à un administrateur de valider ce paiement.';
  if (brut.includes('Plafond d\'especes')) return 'Le plafond d\'espèces du point est atteint : faites d\'abord un versement au siège.';
  if (brut.includes('different du montant')) return 'Le montant reçu doit être exactement le montant dû. Réglez l\'écart avec l\'expéditeur avant de valider.';
  if (brut.includes('Echeance depassee')) return 'L\'échéance est dépassée : la demande va être annulée, le paiement ne peut plus être validé.';
  if (brut.includes('Recu inconnu')) return 'Ce numéro ne correspond à aucun reçu édité pour cette demande (ou il a déjà servi). Éditez le reçu ci-dessus, puis saisissez son numéro.';
  if (brut.includes('ne correspond pas')) return 'Le montant de ce reçu n\'est pas le montant dû : annulez ce reçu (onglet Reçus) et éditez-en un nouveau.';
  if (brut.includes('deja valide')) return 'Ce paiement a déjà été validé.';
  return brut;
}

export function ValidationModal({ point, item, onClose, onValide, onCarte }: {
  point: PointRelais;
  item: AEncaisser;
  onClose: () => void;
  onValide: (message: string) => void;
  /** Guichet seulement (404) : le client prefere payer par carte, via un lien Stripe. */
  onCarte?: () => void;
}) {
  // Moyens possibles : les comptes mobile money du point, puis les especes s'il les accepte.
  const moyens = useMemo(() => {
    const liste: { cle: string; moyen: MoyenRecu; label: string; couleur: string; detail: string }[] = point.comptes_mobile_money.map((c, idx) => ({
      cle: `mm-${idx}`,
      moyen: moyenDepuisOperateur(c.operateur as Operateur),
      label: LABEL_OPERATEUR[c.operateur as Operateur] ?? c.operateur,
      couleur: COULEUR_OPERATEUR[c.operateur as Operateur] ?? '#8A879E',
      detail: `${c.numero} · ${c.titulaire}`,
    }));
    if (point.accepte_especes) liste.push({ cle: 'especes', moyen: 'especes', label: 'Espèces', couleur: '#1D9E75', detail: 'Reçues au guichet' });
    // Le client a pu payer par un opérateur dont le point n'a pas (encore) enregistré le compte : on le choisit ici.
    liste.push({ cle: 'autre', moyen: 'autre_mobile', label: 'Autre opérateur', couleur: '#8A879E', detail: 'Choisir dans la liste' });
    return liste;
  }, [point]);
  const [autreOp, setAutreOp] = useState<Operateur>('wave');

  const [choix, setChoix] = useState(() => (item.moyen_choisi === 'especes' && point.accepte_especes ? 'especes' : moyens[0]?.cle ?? ''));
  const [montant, setMontant] = useState(String(item.montant_local));
  const [reference, setReference] = useState('');
  const [verifie, setVerifie] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Reçu d'espèces (420) : édité par le serveur ; le numéro saisi ci-dessous doit être le sien.
  const [recu, setRecu] = useState<Recu | null>(null);
  const [recuCharge, setRecuCharge] = useState(false);
  const [recuBusy, setRecuBusy] = useState(false);
  const [recuError, setRecuError] = useState<string | null>(null);

  const moyen = choix === 'autre'
    ? { cle: 'autre', moyen: moyenDepuisOperateur(autreOp), label: LABEL_OPERATEUR[autreOp], couleur: COULEUR_OPERATEUR[autreOp], detail: 'compte du point' }
    : moyens.find((m) => m.cle === choix);
  const especes = moyen?.moyen === 'especes';
  const montantNum = Number(montant.replace(/\s/g, '').replace(',', '.'));
  const montantOk = Number.isFinite(montantNum) && montantNum === Number(item.montant_local);
  const referenceOk = especes ? /^R-\d{4}-\d{5,}$/.test(reference.trim()) : reference.trim().length >= 4;
  const unite = libelleDevise(item.devise);

  // Un reçu existe peut-être déjà pour cette demande (édité plus tôt, ou par un collègue) : on le retrouve et on préremplit son numéro.
  useEffect(() => {
    if (!especes || recuCharge) return;
    setRecuCharge(true);
    supabase.rpc('admin_pr_recu_du_dossier', { p_demande_id: item.demande_id }).then(({ data }) => {
      const r = data as Recu | null;
      if (r) { setRecu(r); setReference((ref) => ref || r.numero); }
    });
  }, [especes]); // eslint-disable-line react-hooks/exhaustive-deps

  async function editerRecu() {
    setRecuBusy(true);
    setRecuError(null);
    const { data, error: e } = await supabase.rpc('admin_pr_editer_recu', { p_demande_id: item.demande_id });
    setRecuBusy(false);
    if (e) { setRecuError(messageErreur(e.message)); return; }
    const r = data as Recu;
    setRecu(r);
    setReference(r.numero);
    setVerifie(false);
  }

  async function valider() {
    if (!moyen) return;
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc('admin_pr_valider_paiement', {
      p_demande_id: item.demande_id,
      p_moyen: moyen.moyen,
      p_montant_recu: montantNum,
      p_reference: reference.trim(),
    });
    setBusy(false);
    if (e) { setError(messageErreur(e.message)); return; }
    const r = data as { statut_colis?: string; remboursement_du?: boolean } | null;
    onValide(
      r?.remboursement_du
        ? `Paiement #${item.reference} enregistré, mais l'offre a déjà été prise : l'expéditeur devra être remboursé.`
        : r?.statut_colis === 'accepte'
          ? `Paiement #${item.reference} validé : la demande est acceptée.`
          : `Paiement #${item.reference} validé : le voyageur a été prévenu et peut maintenant accepter.`,
    );
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="modal-title">Valider le paiement #{item.reference}</h2>
      <div className="modal-body">
        <div className="pr-a-recevoir">
          <span>À recevoir de {item.expediteur_nom ?? 'l\'expéditeur'}</span>
          <strong>{montantLocal(item.montant_local, item.devise)}</strong>
          <small>{montantEuros(item.montant_eur)} · {item.trajet}</small>
        </div>

        {onCarte && (
          <div className="pr-carte-bloc" style={{ marginTop: 12 }}>
            <span className="pr-carte-icone" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2.5" /><line x1="2" y1="10" x2="22" y2="10" /></svg>
            </span>
            <div className="pr-carte-texte">
              <strong>Le client préfère payer par carte ?</strong>
              <span>Envoyez-lui un lien de paiement sécurisé, à ouvrir sur son téléphone.</span>
            </div>
            <button className="btn pr-carte-bouton" onClick={onCarte} disabled={busy}>Payer par carte</button>
          </div>
        )}

        <div className="form-grid" style={{ marginTop: 16 }}>
          <div>
            <strong style={{ fontSize: 13 }}>Comment l'argent a-t-il été reçu ?</strong>
            <div className="moyens" role="radiogroup" aria-label="Moyen de paiement reçu">
              {moyens.map((m) => (
                <button
                  key={m.cle}
                  type="button"
                  role="radio"
                  aria-checked={choix === m.cle}
                  className={`moyen-pill ${choix === m.cle ? 'on' : ''}`}
                  onClick={() => { setChoix(m.cle); setVerifie(false); }}
                >
                  <span className="moyen-pastille" style={{ background: m.couleur }} aria-hidden="true" />
                  <span className="moyen-texte"><strong>{m.label}</strong><small>{m.detail}</small></span>
                </button>
              ))}
            </div>
            {choix === 'autre' && (
              <div style={{ marginTop: 10 }}>
                <Select ariaLabel="Opérateur utilisé par le client" value={autreOp} options={OPERATEURS.map((o) => ({ value: o.value, label: o.label }))}
                        onChange={(v) => { setAutreOp(v as Operateur); setVerifie(false); }} />
                <p className="hint" style={{ marginTop: 6 }}>Si le client paie régulièrement par cet opérateur, ajoutez son compte dans « Compte du point » (onglet Réseau).</p>
              </div>
            )}
          </div>

          <label>
            Montant reçu ({unite})
            <ChampMontant valeur={montant} onChange={(v) => { setMontant(v); setVerifie(false); }} unite={unite} invalide={!montantOk} ariaLabel="Montant reçu" />
            {!montantOk && <span className="hint" style={{ color: 'var(--badge-danger-fg)' }}>Doit être exactement {montantLocal(item.montant_local, item.devise)}.</span>}
          </label>

          {especes && (
            <div className={`pr-recu-bloc ${recu ? 'pr-recu-bloc--pret' : ''}`}>
              {recu ? (
                <>
                  <div className="pr-recu-tete">
                    <span className="pr-recu-icone" aria-hidden="true">✓</span>
                    <div><strong>Reçu {recu.numero}</strong><span>Édité : téléchargez-le ou imprimez-le pour le remettre au client.</span></div>
                  </div>
                  <RecuActions recu={recu} compact />
                </>
              ) : (
                <div className="pr-recu-tete">
                  <span className="pr-recu-icone pr-recu-icone--attente" aria-hidden="true">€</span>
                  <div><strong>Reçu d'espèces</strong><span>Éditez le reçu avant d'encaisser : il porte un numéro unique, vérifié ensuite par le serveur.</span></div>
                  <button type="button" className="btn btn-primary btn-sm" onClick={editerRecu} disabled={recuBusy || !recuCharge}>{recuBusy ? 'Édition…' : 'Éditer le reçu'}</button>
                </div>
              )}
              {recuError && <p className="page-error" style={{ marginTop: 8 }}>{recuError}</p>}
            </div>
          )}

          <label>
            {especes ? 'Numéro du reçu édité' : 'Référence de la transaction (SMS de l\'opérateur)'}
            <input
              type="text"
              value={reference}
              maxLength={80}
              autoComplete="off"
              className={especes && reference.trim() && !referenceOk ? 'champ-invalide' : ''}
              placeholder={especes ? 'Ex. R-2026-00042' : 'Ex. CI241014.1532.A12345'}
              onChange={(e) => { setReference(e.target.value); setVerifie(false); }}
            />
            {especes && <span className="hint" style={{ fontWeight: 500 }}>Le serveur vérifie que ce reçu a bien été édité pour cette demande, pour ce montant, et qu'il n'a pas déjà servi.</span>}
          </label>

          <label style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, fontWeight: 600 }}>
            <input type="checkbox" checked={verifie} disabled={!montantOk || !referenceOk} onChange={(e) => setVerifie(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              {especes
                ? `J'ai reçu ${montantLocal(item.montant_local, item.devise)} en espèces et remis le reçu ${reference.trim() || '…'}.`
                : `J'ai vérifié que ${montantLocal(item.montant_local, item.devise)} sont bien arrivés sur le compte ${moyen?.label ?? ''} ${choix === 'autre' ? 'du point' : `(${moyen?.detail.split(' · ')[0] ?? ''})`}.`}
            </span>
          </label>
        </div>

        {/* Pied fixe : « Valider le paiement » reste visible meme quand la fenetre defile. */}
        <div className="pr-pied-fixe">
          {error && <p className="page-error">{error}</p>}
          <div className="action-row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onClose} disabled={busy}>Annuler</button>
            <button className="btn btn-primary" onClick={valider} disabled={busy || !verifie || !montantOk || !referenceOk || !moyen}>
              {busy ? 'Validation…' : 'Valider le paiement'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

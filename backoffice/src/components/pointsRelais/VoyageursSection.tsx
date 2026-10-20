import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../Modal';
import { InfoBulle } from '../InfoBulle';
import { DataTable, type Column } from '../DataTable';
import { PanneauLateral } from '../PanneauLateral';
import { useMultiPoints } from '../../lib/useMultiPoints';
import { BandePoints, TOUS_LES_POINTS, type CompteurPoint } from './BandePoints';
import { Badge } from '../Badge';
import {
  COULEUR_OPERATEUR, LABEL_OPERATEUR, dateCourte, dateJour, libelleDevise, montantEuros, montantLocal, moyenDepuisOperateur,
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

type LigneAVerser = AVerser & { point: PointRelais };

// Tous les points dans un tableau ; le detail et l'action (qui demande le code de retrait du voyageur) dans le panneau lateral.
export function VoyageursSection({ points }: { points: PointRelais[] }) {
  const { items, error, recharger: charger } = useMultiPoints<AVerser>(points, 'voyageurs_a_payer');
  const [message, setMessage] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [aPayer, setAPayer] = useState<LigneAVerser | null>(null);
  const [choix, setChoix] = useState(TOUS_LES_POINTS);
  const plusieurs = points.length > 1;

  const compteurs = useMemo(() => {
    const c: Record<string, CompteurPoint> = {};
    for (const i of items ?? []) (c[i.point.id] ??= { total: 0, urgents: 0 }).total += 1;
    return c;
  }, [items]);
  const visibles = useMemo(() => (items ?? []).filter((i) => choix === TOUS_LES_POINTS || i.point.id === choix), [items, choix]);
  const ligneOuverte = visibles.find((i) => i.demande_id === ouvert) ?? null;
  const bloque = (i: AVerser) => i.contestation || i.essais_restants === 0;
  const libelleBouton = (i: AVerser) => (i.contestation ? 'Gelé' : i.essais_restants === 0 ? 'Code bloqué' : 'Payer');
  const titreBouton = (i: AVerser) => (i.contestation ? 'Contestation en cours : paiement gelé' : i.essais_restants === 0 ? 'Code bloqué après 5 essais : contactez le support Wonjo' : undefined);

  const colonnes: Column<LigneAVerser>[] = [
    ...(plusieurs ? [{ key: 'point', label: 'Point', value: (i: LigneAVerser) => i.point.nom, filter: 'options' as const, render: (i: LigneAVerser) => <strong className="pr-nowrap">{i.point.nom}</strong> }] : []),
    { key: 'ref', label: 'Référence', value: (i) => i.reference, render: (i) => <span className="pr-ref">#{i.reference}</span> },
    { key: 'voyageur', label: 'Voyageur', value: (i) => i.porteur_nom ?? '', render: (i) => <strong className="pr-nowrap">{i.porteur_nom ?? 'Voyageur'}</strong> },
    { key: 'tel', label: 'Téléphone', value: (i) => i.porteur_telephone ?? '', render: (i) => (i.porteur_telephone ? <span className="pr-nowrap">{i.porteur_telephone}</span> : <span className="hint">-</span>) },
    { key: 'trajet', label: 'Trajet', value: (i) => i.trajet ?? '', render: (i) => <span className="pr-nowrap">{i.trajet}</span> },
    { key: 'montant', label: 'À verser', value: (i) => Number(i.montant_local), render: (i) => <strong className="pr-nowrap">{montantLocal(i.montant_local, i.devise)}</strong> },
    { key: 'euros', label: 'En euros', value: (i) => Number(i.montant_eur), render: (i) => <span className="pr-nowrap">{montantEuros(i.montant_eur)}</span> },
    { key: 'livre', label: 'Livré', value: (i) => i.livre_at ?? '', filter: 'date', render: (i) => (i.livre_at ? dateJour(i.livre_at) : '-') },
    { key: 'etat', label: 'Point de paiement', value: (i) => (i.contestation ? 'Contestation : gelé' : i.point_de_versement ? 'Point d\'arrivée' : 'Point du dépôt'), filter: 'options',
      render: (i) => (i.contestation ? <Badge tone="danger">Gelé</Badge> : <Badge tone={i.point_de_versement ? 'teal' : 'muted'}>{i.point_de_versement ? 'Arrivée' : 'Dépôt'}</Badge>) },
    { key: 'actions', label: '', width: 130, render: (i) => (
      <button className="pr-paie-btn pr-paie-btn--stripe" disabled={bloque(i)} title={titreBouton(i)}
              onClick={(e) => { e.stopPropagation(); setMessage(null); setAPayer(i); }}>{libelleBouton(i)}</button>
    ) },
  ];

  return (
    <div>
      <div className="pr-entete">
        <div>
          <h3>Voyageurs à payer<InfoBulle>Colis livrés depuis 24 h, sans litige. Payez le voyageur seulement avec son <strong>code de retrait</strong>, visible dans l'app sur la fiche du colis.</InfoBulle></h3>
        </div>
      </div>

      {message && <p className="success-text" style={{ marginBottom: 12 }}>{message}</p>}
      {error && <p className="page-error">{error}</p>}

      {!items ? <p className="loading-state">Chargement…</p> : (
        <>
          <BandePoints points={points} compteurs={compteurs} choix={choix} onChoix={setChoix} />
          <div className="pr-dense">
            <DataTable rows={visibles} columns={colonnes} rowKey={(i) => i.demande_id} integre title="Voyageurs à payer par le point" pageSize={10}
                       initialSort={{ key: 'livre', dir: 'asc' }} onRowClick={(i) => setOuvert(i.demande_id)}
                       emptyText="Aucun voyageur à payer pour le moment." />
          </div>
        </>
      )}

      {ligneOuverte && (
        <PanneauLateral
          titre={<>#{ligneOuverte.reference}</>}
          sousTitre={<>{ligneOuverte.point.nom} · {ligneOuverte.porteur_nom ?? 'Voyageur'}</>}
          onClose={() => setOuvert(null)}
          pied={(
            <>
              <button className="btn" onClick={() => setOuvert(null)}>Fermer</button>
              <button className="btn btn-primary" disabled={bloque(ligneOuverte)} title={titreBouton(ligneOuverte)}
                      onClick={() => { setMessage(null); setAPayer(ligneOuverte); }}>
                {bloque(ligneOuverte) ? libelleBouton(ligneOuverte) : 'Payer le voyageur'}
              </button>
            </>
          )}
        >
          {(() => {
            const i = ligneOuverte;
            return (
              <>
                <div className="panneau-montant">
                  <strong>{montantLocal(i.montant_local, i.devise)}</strong>
                  <span>{montantEuros(i.montant_eur)} · prix du voyageur</span>
                </div>
                <dl className="panneau-liste">
                  <dt>Voyageur</dt>
                  <dd>{i.porteur_nom ?? 'Voyageur'}{i.porteur_telephone && <> · <a className="pr-tel" href={`tel:${i.porteur_telephone.replace(/[^\d+]/g, '')}`}>{i.porteur_telephone}</a></>}</dd>
                  <dt>Trajet</dt><dd>{i.trajet}</dd>
                  {i.mm_numero && <><dt>À envoyer sur</dt><dd><strong>{LABEL_MOYEN_VERSEMENT[i.mm_operateur ?? ''] ?? 'Mobile money'} {i.mm_numero}</strong></dd></>}
                  {i.livre_at && <><dt>Livré</dt><dd>{dateCourte(i.livre_at)}</dd></>}
                  <dt>Paiement</dt><dd>{i.contestation ? 'Contestation : gelé' : i.point_de_versement ? 'Point d\'arrivée' : 'Point du dépôt'}</dd>
                  {i.essais_restants < 5 && (
                    <><dt>Code</dt><dd style={{ color: 'var(--badge-amber-fg)' }}>{i.essais_restants} essai{i.essais_restants > 1 ? 's' : ''} restant{i.essais_restants > 1 ? 's' : ''}</dd></>
                  )}
                  <dt>Point</dt><dd>{i.point.nom}</dd>
                </dl>
              </>
            );
          })()}
        </PanneauLateral>
      )}

      {aPayer && (
        <PayerModal point={aPayer.point} item={aPayer} onClose={() => { setAPayer(null); charger(); }}
          onPaye={(texte) => { setAPayer(null); setOuvert(null); setMessage(texte); charger(); }} />
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

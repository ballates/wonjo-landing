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
  COULEUR_OPERATEUR, LABEL_OPERATEUR, dateCourte, montantEuros, montantLocal, moyenDepuisOperateur,
  type MoyenRecu, type Operateur, type PointRelais,
} from '../../lib/pointsRelais';
import { LogoOperateur } from './LogoOperateur';

// A rembourser (migrations 406-408) : dossiers payes a CE point puis annules (refus du voyageur, annulation, depart
// sans acceptation, litige). Le point rend exactement ce qu'il a encaisse. Expediteur de l'app : son code de
// remboursement (dans l'app) est obligatoire. Client du guichet : pas d'app, le mobile money part vers son numero.

interface ARembourser {
  demande_id: string;
  reference: string;
  parcours: 'app' | 'guichet';
  trajet: string | null;
  pret_at: string;
  beneficiaire_nom: string | null;
  beneficiaire_telephone: string | null;
  montant_local: number;
  devise: string;
  montant_eur: number;
  moyen_encaissement: string;
  reference_encaissement: string | null;
  code_requis: boolean;
  essais_restants: number;
}

const LIBELLE_MOYEN: Record<string, string> = { ...LABEL_OPERATEUR, especes: 'Espèces', autre_mobile: 'Mobile money' };

type LigneRembourser = ARembourser & { point: PointRelais };

// Tous les points dans un tableau, les plus anciens annules en haut ; le detail et l'action dans le panneau lateral.
export function RemboursementsSection({ points }: { points: PointRelais[] }) {
  const { items, error, recharger: charger } = useMultiPoints<ARembourser>(points, 'a_rembourser');
  const [message, setMessage] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [aRembourser, setARembourser] = useState<LigneRembourser | null>(null);
  const [choix, setChoix] = useState(TOUS_LES_POINTS);
  const plusieurs = points.length > 1;

  const compteurs = useMemo(() => {
    const c: Record<string, CompteurPoint> = {};
    for (const i of items ?? []) (c[i.point.id] ??= { total: 0, urgents: 0 }).total += 1;
    return c;
  }, [items]);
  const visibles = useMemo(() => (items ?? []).filter((i) => choix === TOUS_LES_POINTS || i.point.id === choix), [items, choix]);
  const ligneOuverte = visibles.find((i) => i.demande_id === ouvert) ?? null;
  const bloque = (i: ARembourser) => i.code_requis && i.essais_restants === 0;
  const lieu = (i: ARembourser) => (i.parcours === 'guichet' ? 'Client du guichet' : 'Expéditeur de l\'app');

  const colonnes: Column<LigneRembourser>[] = [
    ...(plusieurs ? [{ key: 'point', label: 'Point', value: (i: LigneRembourser) => i.point.nom, filter: 'options' as const, render: (i: LigneRembourser) => <strong className="pr-nowrap">{i.point.nom}</strong> }] : []),
    { key: 'ref', label: 'Référence', value: (i) => i.reference, render: (i) => <span className="pr-ref">#{i.reference}</span> },
    { key: 'annule', label: 'Annulé le', value: (i) => i.pret_at, filter: 'date', render: (i) => dateCourte(i.pret_at) },
    { key: 'montant', label: 'À rendre', value: (i) => Number(i.montant_local), render: (i) => <span className="pr-nowrap"><strong>{montantLocal(i.montant_local, i.devise)}</strong><span className="hint"> · {montantEuros(i.montant_eur)}</span></span> },
    { key: 'benef', label: 'Bénéficiaire', value: (i) => `${i.beneficiaire_nom ?? ''} ${i.beneficiaire_telephone ?? ''}`,
      render: (i) => <span className="pr-nowrap">{i.beneficiaire_nom ?? 'Expéditeur'}{i.beneficiaire_telephone && <span className="hint"> · {i.beneficiaire_telephone}</span>}</span> },
    { key: 'type', label: 'Type', value: lieu, filter: 'options', render: (i) => <Badge tone={i.parcours === 'guichet' ? 'muted' : 'teal'}>{lieu(i)}</Badge> },
    { key: 'paye', label: 'Payé par', value: (i) => LIBELLE_MOYEN[i.moyen_encaissement] ?? i.moyen_encaissement, filter: 'options' },
    { key: 'actions', label: '', width: 130, render: (i) => (
      <button className="pr-paie-btn pr-paie-btn--stripe" disabled={bloque(i)} title={bloque(i) ? 'Code bloqué après 5 essais : contactez le support Wonjo' : undefined}
              onClick={(e) => { e.stopPropagation(); setMessage(null); setARembourser(i); }}>{bloque(i) ? 'Code bloqué' : 'Rembourser'}</button>
    ) },
  ];

  return (
    <div>
      <div className="pr-entete">
        <div>
          <h3>À rembourser<InfoBulle>Dossiers payés au point puis annulés. Rendez exactement la somme encaissée ; pour un expéditeur de l'app, demandez son <strong>code de remboursement</strong>.</InfoBulle></h3>
        </div>
      </div>

      {message && <p className="success-text" style={{ marginBottom: 12 }}>{message}</p>}
      {error && <p className="page-error">{error}</p>}

      {!items ? <p className="loading-state">Chargement…</p> : (
        <>
          <BandePoints points={points} compteurs={compteurs} choix={choix} onChoix={setChoix} />
          <div className="pr-dense">
            <DataTable rows={visibles} columns={colonnes} rowKey={(i) => i.demande_id} integre title="Remboursements en attente" pageSize={10}
                       initialSort={{ key: 'annule', dir: 'asc' }} onRowClick={(i) => setOuvert(i.demande_id)}
                       emptyText="Aucun remboursement en attente." />
          </div>
        </>
      )}

      {ligneOuverte && (
        <PanneauLateral
          titre={<>#{ligneOuverte.reference}</>}
          sousTitre={<>{ligneOuverte.point.nom} · {lieu(ligneOuverte)}</>}
          onClose={() => setOuvert(null)}
          pied={(
            <>
              <button className="btn" onClick={() => setOuvert(null)}>Fermer</button>
              <button className="btn btn-primary" disabled={bloque(ligneOuverte)} onClick={() => { setMessage(null); setARembourser(ligneOuverte); }}
                      title={bloque(ligneOuverte) ? 'Code bloqué après 5 essais : contactez le support Wonjo' : undefined}>
                {bloque(ligneOuverte) ? 'Code bloqué' : 'Rembourser'}
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
                  <span>{montantEuros(i.montant_eur)} · à rendre</span>
                </div>
                <dl className="panneau-liste">
                  <dt>À rembourser à</dt>
                  <dd>{i.beneficiaire_nom ?? 'Expéditeur'}{i.beneficiaire_telephone && <> · <a className="pr-tel" href={`tel:${i.beneficiaire_telephone.replace(/[^\d+]/g, '')}`}>{i.beneficiaire_telephone}</a></>}</dd>
                  <dt>Payé par</dt><dd>{LIBELLE_MOYEN[i.moyen_encaissement] ?? i.moyen_encaissement}{i.reference_encaissement ? ` · ${i.reference_encaissement}` : ''}</dd>
                  <dt>Trajet</dt><dd>{i.trajet}</dd>
                  <dt>Annulé</dt><dd>{dateCourte(i.pret_at)}</dd>
                  {i.code_requis && i.essais_restants < 5 && (
                    <><dt>Code</dt><dd style={{ color: 'var(--badge-amber-fg)' }}>{i.essais_restants} essai{i.essais_restants > 1 ? 's' : ''} restant{i.essais_restants > 1 ? 's' : ''}</dd></>
                  )}
                  <dt>Point</dt><dd>{i.point.nom}</dd>
                </dl>
              </>
            );
          })()}
        </PanneauLateral>
      )}

      {aRembourser && (
        <RembourserModal point={aRembourser.point} item={aRembourser} onClose={() => { setARembourser(null); charger(); }}
          onFait={(texte) => { setARembourser(null); setOuvert(null); setMessage(texte); charger(); }} />
      )}
    </div>
  );
}

function messageErreur(brut: string): string {
  if (brut.includes('caisse_reference_remboursement_unique')) return 'Cette référence a déjà servi pour un autre remboursement : vérifiez le SMS de l\'opérateur.';
  if (brut.includes('Solde mobile money insuffisant')) return 'Le compte mobile money du point n\'a pas assez d\'argent pour ce paiement : la finance doit d\'abord l\'approvisionner (onglet Caisse).';
  if (brut.includes('Especes insuffisantes')) return 'La caisse du point n\'a pas assez d\'espèces : remboursez par mobile money ou attendez un approvisionnement.';
  if (brut.includes('Plafond journalier')) return 'Votre plafond du jour est atteint : demandez à la finance ou à un administrateur de faire ce remboursement.';
  if (brut.includes('Trop d\'essais')) return 'Code bloqué après 5 essais : l\'expéditeur doit contacter le support Wonjo.';
  if (brut.includes('deja rembourse')) return 'Cet expéditeur a déjà été remboursé.';
  return brut;
}

function RembourserModal({ point, item, onClose, onFait }: {
  point: PointRelais; item: ARembourser; onClose: () => void; onFait: (message: string) => void;
}) {
  const moyens = useMemo(() => {
    const liste: { cle: string; moyen: MoyenRecu; label: string; couleur: string; detail: string; operateur?: string }[] = point.comptes_mobile_money.map((c, idx) => ({
      cle: `mm-${idx}`,
      moyen: moyenDepuisOperateur(c.operateur as Operateur),
      label: LABEL_OPERATEUR[c.operateur as Operateur] ?? c.operateur,
      couleur: COULEUR_OPERATEUR[c.operateur as Operateur] ?? '#8A879E',
      operateur: c.operateur,
      detail: `Depuis ${c.numero}`,
    }));
    if (point.accepte_especes) liste.push({ cle: 'especes', moyen: 'especes', label: 'Espèces', couleur: '#1D9E75', detail: 'Remises au guichet' });
    return liste;
  }, [point]);
  // Par defaut, le meme moyen que l'encaissement.
  const [choix, setChoix] = useState(() => (moyens.find((m) => m.moyen === item.moyen_encaissement) ?? moyens[0])?.cle ?? '');
  const [code, setCode] = useState('');
  const [reference, setReference] = useState('');
  const [verifie, setVerifie] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moyen = moyens.find((m) => m.cle === choix);
  const especes = moyen?.moyen === 'especes';
  const codeOk = !item.code_requis || /^\d{6}$/.test(code);
  const referenceOk = reference.trim().length >= (especes ? 1 : 4);

  async function rembourser() {
    if (!moyen) return;
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc('admin_pr_rembourser', {
      p_demande_id: item.demande_id, p_code: item.code_requis ? code : null, p_moyen: moyen.moyen,
      p_montant: item.montant_local, p_reference: reference.trim(),
    });
    setBusy(false);
    if (e) { setError(messageErreur(e.message)); return; }
    const r = data as { ok?: boolean; restant?: number } | null;
    if (!r?.ok) {
      setCode('');
      setVerifie(false);
      setError(r?.restant ? `Code de remboursement incorrect : ${r.restant} essai${r.restant > 1 ? 's' : ''} restant${r.restant > 1 ? 's' : ''}.`
        : 'Code bloqué après 5 essais : l\'expéditeur doit contacter le support Wonjo.');
      return;
    }
    onFait(`${item.beneficiaire_nom ?? 'L\'expéditeur'} remboursé : ${montantLocal(item.montant_local, item.devise)}.`);
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="modal-title">Rembourser #{item.reference}</h2>
      <div className="modal-body">
        <div className="pr-a-recevoir">
          <span>À rendre à {item.beneficiaire_nom ?? 'l\'expéditeur'}</span>
          <strong>{montantLocal(item.montant_local, item.devise)}</strong>
          <small>Encaissé par {LIBELLE_MOYEN[item.moyen_encaissement] ?? item.moyen_encaissement}{item.reference_encaissement ? ` · ${item.reference_encaissement}` : ''}</small>
        </div>

        <div className="form-grid" style={{ marginTop: 16 }}>
          {item.code_requis ? (
            <label>
              Code de remboursement de l'expéditeur (6 chiffres, dans son app)
              <input type="text" inputMode="numeric" autoComplete="off" maxLength={6} value={code} autoFocus
                     className="pr-code-retrait" placeholder="••••••"
                     onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setVerifie(false); }} />
            </label>
          ) : (
            <p className="hint">Client du guichet, sans l'app : remboursez-le en personne contre un reçu signé, ou par mobile money au numéro enregistré au guichet{item.beneficiaire_telephone ? ` (${item.beneficiaire_telephone})` : ''}.</p>
          )}

          <div>
            <strong style={{ fontSize: 13 }}>Comment le remboursez-vous ?</strong>
            <div className="moyens" role="radiogroup" aria-label="Moyen de remboursement">
              {moyens.map((m) => (
                <button key={m.cle} type="button" role="radio" aria-checked={choix === m.cle}
                        className={`moyen-pill ${choix === m.cle ? 'on' : ''}`} onClick={() => { setChoix(m.cle); setVerifie(false); }}>
                  <LogoOperateur operateur={m.operateur} couleur={m.couleur} />
                  <span className="moyen-texte"><strong>{m.label}</strong><small>{m.detail}</small></span>
                </button>
              ))}
            </div>
          </div>

          <label>
            {especes ? `Numéro du reçu signé par ${item.parcours === 'guichet' ? 'le client' : 'l\'expéditeur'}` : 'Référence du transfert (SMS de l\'opérateur)'}
            <input type="text" value={reference} maxLength={80} autoComplete="off"
                   placeholder={especes ? 'Ex. RB-0042' : 'Ex. CI241014.1532.A12345'}
                   onChange={(e) => { setReference(e.target.value); setVerifie(false); }} />
          </label>

          <label style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, fontWeight: 600 }}>
            <input type="checkbox" checked={verifie} disabled={!codeOk || !referenceOk} onChange={(e) => setVerifie(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              {especes
                ? `J'ai rendu ${montantLocal(item.montant_local, item.devise)} en espèces, contre le reçu signé ${reference.trim() || '…'}.`
                : `J'ai envoyé ${montantLocal(item.montant_local, item.devise)} par ${moyen?.label ?? 'mobile money'} et le transfert est confirmé.`}
            </span>
          </label>
        </div>

        {error && <p className="page-error" style={{ marginTop: 12 }}>{error}</p>}
        <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn" onClick={onClose} disabled={busy}>Annuler</button>
          <button className="btn btn-primary" onClick={rembourser} disabled={busy || !verifie || !codeOk || !referenceOk || !moyen}>
            {busy ? 'Remboursement…' : `Rembourser ${montantLocal(item.montant_local, item.devise)}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

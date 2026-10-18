import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../Modal';
import { Badge } from '../Badge';
import {
  COULEUR_OPERATEUR, LABEL_OPERATEUR, dateCourte, montantEuros, montantLocal, moyenDepuisOperateur,
  type MoyenRecu, type Operateur, type PointRelais,
} from '../../lib/pointsRelais';

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

export function RemboursementsSection({ point }: { point: PointRelais }) {
  const [items, setItems] = useState<ARembourser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [aRembourser, setARembourser] = useState<ARembourser | null>(null);

  function charger() {
    supabase.rpc('admin_pr_a_rembourser', { p_point_id: point.id }).then(({ data, error: e }) => {
      if (e) { setError(e.message); setItems([]); return; }
      setError(null);
      setItems((data ?? []) as ARembourser[]);
    });
  }
  useEffect(() => { setItems(null); charger(); }, [point.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = useMemo(() => (items ?? []).reduce((s, i) => s + Number(i.montant_local), 0), [items]);

  return (
    <div>
      <div className="pr-entete">
        <div>
          <h3>À rembourser</h3>
          <p className="hint">
            Dossiers payés à <strong>{point.nom}</strong> puis annulés. Rendez exactement la somme encaissée ; pour un expéditeur de l'app, demandez son <strong>code de remboursement</strong>.
          </p>
        </div>
        {items && items.length > 0 && (
          <div className="pr-total">
            <span>{items.length} à rembourser</span>
            <strong>{montantLocal(total, point.devise)}</strong>
          </div>
        )}
      </div>

      {message && <p className="success-text" style={{ marginBottom: 12 }}>{message}</p>}
      {error && <p className="page-error">{error}</p>}

      {!items ? <p className="loading-state">Chargement…</p> : items.length === 0 ? (
        <div className="empty-state">Aucun remboursement en attente.</div>
      ) : (
        <div className="pr-grid">
          {items.map((i) => (
            <article key={i.demande_id} className="pr-card">
              <div className="pr-card-haut">
                <span className="pr-ref">#{i.reference}</span>
                <Badge tone={i.parcours === 'guichet' ? 'muted' : 'teal'}>{i.parcours === 'guichet' ? 'Client du guichet' : 'Expéditeur de l\'app'}</Badge>
              </div>
              <div className="pr-montant">
                <strong>{montantLocal(i.montant_local, i.devise)}</strong>
                <span>{montantEuros(i.montant_eur)}</span>
              </div>
              <div className="pr-ligne">
                <span className="pr-libelle">À rembourser à</span>
                <span>
                  {i.beneficiaire_nom ?? 'Expéditeur'}
                  {i.beneficiaire_telephone && <> · <a className="pr-tel" href={`tel:${i.beneficiaire_telephone.replace(/[^\d+]/g, '')}`}>{i.beneficiaire_telephone}</a></>}
                </span>
              </div>
              <div className="pr-ligne"><span className="pr-libelle">Payé par</span><span>{LIBELLE_MOYEN[i.moyen_encaissement] ?? i.moyen_encaissement}{i.reference_encaissement ? ` · ${i.reference_encaissement}` : ''}</span></div>
              <div className="pr-ligne"><span className="pr-libelle">Trajet</span><span>{i.trajet}</span></div>
              <div className="pr-ligne"><span className="pr-libelle">Annulé</span><span>{dateCourte(i.pret_at)}</span></div>
              {i.code_requis && i.essais_restants < 5 && (
                <div className="pr-ligne"><span className="pr-libelle">Code</span><span style={{ color: 'var(--badge-amber-fg)' }}>{i.essais_restants} essai{i.essais_restants > 1 ? 's' : ''} restant{i.essais_restants > 1 ? 's' : ''}</span></div>
              )}
              <button className="btn btn-primary pr-action" disabled={i.code_requis && i.essais_restants === 0}
                      onClick={() => { setMessage(null); setARembourser(i); }}
                      title={i.code_requis && i.essais_restants === 0 ? 'Code bloqué après 5 essais : contactez le support Wonjo' : undefined}>
                {i.code_requis && i.essais_restants === 0 ? 'Code bloqué' : 'Rembourser'}
              </button>
            </article>
          ))}
        </div>
      )}

      {aRembourser && (
        <RembourserModal point={point} item={aRembourser} onClose={() => { setARembourser(null); charger(); }}
          onFait={(texte) => { setARembourser(null); setMessage(texte); charger(); }} />
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
                  <span className="moyen-pastille" style={{ background: m.couleur }} aria-hidden="true" />
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

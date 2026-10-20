import { useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { Modal } from '../Modal';
import { Badge } from '../Badge';
import { LIBELLE_STATUT_RECU, dateRecu, montantEurRecu, montantRecu, telechargerPdfRecu, type Recu } from '../../lib/recu';

// Actions sur un reçu d'espèces édité (migration 420) : télécharger le PDF, l'imprimer, l'envoyer par e-mail (3 envois au plus,
// fonction pr-envoyer-recu : le contenu du mail vient de la base). Même composant dans la validation d'un paiement et dans l'onglet Reçus.

const ENVOIS_MAX = 3;

/** Reçu mis en page pour l'impression : ajouté un instant à la page, seul visible à l'impression (voir .recu-impression). */
function FeuilleRecu({ recu }: { recu: Recu }) {
  const c = recu.contenu;
  return (
    <div className="recu-impression">
      <div className="recu-feuille">
        <div className="recu-bandeau"><strong>Wonjo</strong><span>REÇU D'ENCAISSEMENT<small>Paiement en espèces</small></span></div>
        <h1>Reçu n° {recu.numero}</h1>
        <p className="recu-sous">Édité le {dateRecu(recu.emis_at)}{c.agent ? ` par ${c.agent}` : ''}</p>
        {recu.statut === 'annule' && <p className="recu-annule">REÇU ANNULÉ : ne vaut plus justificatif</p>}
        <div className="recu-montant"><span>MONTANT REÇU</span><strong>{montantRecu(c)}</strong>{c.montant_eur != null && <em>soit {montantEurRecu(c)}</em>}</div>
        <dl>
          <dt>Payé par</dt><dd>{[c.payeur?.nom, c.payeur?.telephone].filter(Boolean).join(' · ') || '-'}</dd>
          <dt>Reçu par</dt><dd>{[c.point?.nom, c.point?.adresse, c.point?.ville].filter(Boolean).join(', ') || '-'}</dd>
          {c.point?.telephone && <><dt>Téléphone du point</dt><dd>{c.point.telephone}</dd></>}
          <dt>Envoi Wonjo</dt><dd>{[c.dossier?.reference ? `#${c.dossier.reference}` : '', c.dossier?.trajet].filter(Boolean).join(' · ') || '-'}</dd>
          <dt>Moyen de paiement</dt><dd>Espèces</dd>
        </dl>
        <div className="recu-signatures"><div>Signature du client</div><div>Signature et cachet du point relais</div></div>
        <p className="recu-pied">Reçu édité par Wonjo. Conservez-le : il prouve votre paiement. Son numéro est vérifié par Wonjo à l'encaissement.</p>
      </div>
    </div>
  );
}

export function RecuActions({ recu, compact = false, onEnvoye }: { recu: Recu; compact?: boolean; onEnvoye?: (envois: number) => void }) {
  const [envois, setEnvois] = useState(recu.envois);
  const [impression, setImpression] = useState(false);
  const [email, setEmail] = useState<{ ouvert: boolean; valeur: string; busy: boolean; error: string | null; fait: string | null }>({ ouvert: false, valeur: '', busy: false, error: null, fait: null });
  const annule = recu.statut === 'annule';

  function imprimer() {
    setImpression(true);
    // Laisse React poser la feuille dans la page avant d'ouvrir la boite d'impression.
    setTimeout(() => {
      const fin = () => { setImpression(false); window.removeEventListener('afterprint', fin); };
      window.addEventListener('afterprint', fin);
      window.print();
    }, 80);
  }

  async function envoyer() {
    setEmail((e) => ({ ...e, busy: true, error: null, fait: null }));
    const { data, error } = await supabase.functions.invoke('pr-envoyer-recu', { body: { recu_id: recu.id, email: email.valeur.trim() } });
    if (error || (data as { error?: string } | null)?.error) {
      // Le corps d'erreur de la fonction porte le message lisible.
      let message = (data as { error?: string } | null)?.error ?? '';
      if (!message && error && 'context' in error) {
        try { message = ((await (error as unknown as { context: Response }).context.json()) as { error?: string }).error ?? ''; } catch { /* corps illisible */ }
      }
      setEmail((e) => ({ ...e, busy: false, error: message || "L'e-mail n'a pas pu être envoyé." }));
      return;
    }
    const n = Math.min(ENVOIS_MAX, envois + 1);
    setEnvois(n);
    onEnvoye?.(n);
    setEmail((e) => ({ ...e, busy: false, fait: `Reçu envoyé à ${e.valeur.trim()}.` }));
  }

  return (
    <>
      <div className={`recu-actions ${compact ? 'recu-actions--compact' : ''}`}>
        <button type="button" className="btn btn-sm" onClick={() => telechargerPdfRecu(recu)}>Télécharger le PDF</button>
        <button type="button" className="btn btn-sm" onClick={imprimer}>Imprimer</button>
        <button type="button" className="btn btn-sm" disabled={annule || envois >= ENVOIS_MAX}
                title={annule ? 'Ce reçu est annulé' : envois >= ENVOIS_MAX ? `${ENVOIS_MAX} envois déjà faits` : undefined}
                onClick={() => setEmail({ ouvert: true, valeur: '', busy: false, error: null, fait: null })}>Envoyer par e-mail</button>
      </div>
      {impression && createPortal(<FeuilleRecu recu={recu} />, document.body)}
      {email.ouvert && (
        <Modal onClose={() => setEmail((e) => ({ ...e, ouvert: false }))}>
          <h2 className="modal-title">Envoyer le reçu {recu.numero}</h2>
          <div className="modal-body">
            <p className="hint">Le reçu est envoyé à l'adresse saisie, avec le contenu édité (montant, point, date). {ENVOIS_MAX - envois} envoi{ENVOIS_MAX - envois > 1 ? 's' : ''} restant{ENVOIS_MAX - envois > 1 ? 's' : ''} pour ce reçu.</p>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontWeight: 700, fontSize: 13 }}>Adresse e-mail du client
              <input type="email" value={email.valeur} autoFocus placeholder="client@exemple.com" maxLength={254} autoComplete="off"
                     onChange={(e) => setEmail((s) => ({ ...s, valeur: e.target.value, error: null, fait: null }))} />
            </label>
            {email.error && <p className="page-error" style={{ marginTop: 12 }}>{email.error}</p>}
            {email.fait && <p className="success-text" style={{ marginTop: 12 }}>{email.fait}</p>}
            <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn" onClick={() => setEmail((e) => ({ ...e, ouvert: false }))} disabled={email.busy}>{email.fait ? 'Fermer' : 'Annuler'}</button>
              {!email.fait && (
                <button className="btn btn-primary" onClick={envoyer} disabled={email.busy || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email.valeur.trim()) || envois >= ENVOIS_MAX}>
                  {email.busy ? 'Envoi…' : 'Envoyer'}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export function BadgeStatutRecu({ statut }: { statut: string }) {
  const tone = statut === 'utilise' ? 'green' : statut === 'emis' ? 'teal' : statut === 'annule' ? 'danger' : 'muted';
  return <Badge tone={tone}>{LIBELLE_STATUT_RECU[statut] ?? statut}</Badge>;
}

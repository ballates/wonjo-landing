import { useEffect, useMemo, useState } from 'react';
import { InfoBulle } from '../InfoBulle';
import { supabase } from '../../lib/supabase';
import { DataTable, type Column } from '../DataTable';
import { PanneauLateral } from '../PanneauLateral';
import { useMultiPoints } from '../../lib/useMultiPoints';
import { BandePoints, TOUS_LES_POINTS, type CompteurPoint } from './BandePoints';
import { useConfirmation } from '../Confirmation';
import { BadgeStatutRecu, RecuActions } from './RecuActions';
import { dateCourte, montantLocal, type PointRelais } from '../../lib/pointsRelais';
import { LIBELLE_STATUT_RECU, dateRecu, montantEurRecu, montantRecu, type Recu } from '../../lib/recu';

// Reçus d'espèces d'un point relais (migration 420) : tous ceux qui ont été édités, leur état (édité, utilisé à l'encaissement,
// annulé, caduc si la demande a été annulée depuis), et pour chacun : PDF, impression, e-mail, annulation (motif obligatoire,
// seulement tant qu'il n'a pas servi). Un reçu ne se modifie ni ne s'efface : la liste est une trace.

interface LigneRecuBrute {
  id: string; numero: string; statut: string; emis_at: string; payeur_nom: string | null; montant_local: number; devise: string;
  reference: string | null; demande_id: string; emis_par_nom: string | null; utilise_at: string | null; annule_motif: string | null; envois: number;
}

type LigneRecu = LigneRecuBrute & { point: PointRelais };

export function RecusSection({ points }: { points: PointRelais[] }) {
  const { items: recus, error, recharger: charger } = useMultiPoints<LigneRecuBrute>(points, 'lister_recus');
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [choix, setChoix] = useState(TOUS_LES_POINTS);
  const plusieurs = points.length > 1;

  const compteurs = useMemo(() => {
    const c: Record<string, CompteurPoint> = {};
    for (const r of recus ?? []) {
      const x = (c[r.point.id] ??= { total: 0, urgents: 0 });
      x.total += 1;
      if (r.statut === 'emis') x.urgents += 1;
    }
    return c;
  }, [recus]);
  const visibles = useMemo(() => (recus ?? []).filter((r) => choix === TOUS_LES_POINTS || r.point.id === choix), [recus, choix]);

  const colonnes: Column<LigneRecu>[] = [
    ...(plusieurs ? [{ key: 'point', label: 'Point', value: (r: LigneRecu) => r.point.nom, filter: 'options' as const, render: (r: LigneRecu) => <strong className="pr-nowrap">{r.point.nom}</strong> }] : []),
    { key: 'numero', label: 'Reçu', value: (r) => r.numero, render: (r) => <strong>{r.numero}</strong> },
    { key: 'date', label: 'Édité le', value: (r) => r.emis_at, render: (r) => dateCourte(r.emis_at), filter: 'date' },
    { key: 'payeur', label: 'Payé par', value: (r) => r.payeur_nom ?? '', render: (r) => <span className="pr-nowrap">{r.payeur_nom ?? '-'}{r.reference ? <span className="hint"> · #{r.reference}</span> : null}</span> },
    { key: 'montant', label: 'Montant', value: (r) => Number(r.montant_local), render: (r) => <strong className="pr-nowrap">{montantLocal(r.montant_local, r.devise)}</strong> },
    { key: 'statut', label: 'État', value: (r) => LIBELLE_STATUT_RECU[r.statut] ?? r.statut, filter: 'options', render: (r) => <BadgeStatutRecu statut={r.statut} /> },
    { key: 'par', label: 'Édité par', value: (r) => r.emis_par_nom ?? '', render: (r) => <span className="pr-nowrap">{r.emis_par_nom ?? '-'}</span> },
  ];

  return (
    <div>
      <div className="pr-entete">
        <div>
          <h3>Reçus d'espèces<InfoBulle>Chaque paiement en espèces s'encaisse avec un reçu édité ici : numéro unique, vérifié à l'encaissement.</InfoBulle></h3>
        </div>
      </div>
      {error && <p className="page-error">{error}</p>}
      {!recus ? <p className="loading-state">Chargement des reçus…</p> : (
        <>
          <BandePoints points={points} compteurs={compteurs} choix={choix} onChoix={setChoix} />
          <div className="pr-dense">
            <DataTable rows={visibles} columns={colonnes} rowKey={(r) => r.id} title="Reçus" integre emptyText="Aucun reçu édité pour le moment."
                       initialSort={{ key: 'date', dir: 'desc' }} pageSize={15} onRowClick={(r) => setOuvert(r.id)} />
          </div>
        </>
      )}
      {ouvert && <RecuModal id={ouvert} onClose={() => setOuvert(null)} onChange={charger} />}
    </div>
  );
}

function RecuModal({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const [recu, setRecu] = useState<(Recu & { annule_motif?: string | null; utilise_at?: string | null }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { demanderTexte, fenetre } = useConfirmation();

  function charger() {
    supabase.rpc('admin_pr_recu', { p_recu_id: id }).then(({ data, error: e }) => {
      if (e) { setError(e.message); return; }
      setRecu(data as Recu);
    });
  }
  useEffect(charger, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function annuler() {
    if (!recu) return;
    const motif = await demanderTexte({
      titre: `Annuler le reçu ${recu.numero} ?`, danger: true, libelleOui: 'Annuler le reçu',
      texte: 'Le reçu ne vaudra plus justificatif et son numéro ne sera jamais réutilisé. Vous pourrez en éditer un nouveau pour cette demande.',
      champ: { libelle: 'Motif (obligatoire)', obligatoire: true, min: 5 },
    });
    if (!motif) return;
    const { error: e } = await supabase.rpc('admin_pr_annuler_recu', { p_recu_id: recu.id, p_motif: motif });
    if (e) { setError(e.message.includes('non utilise') ? 'Ce reçu a déjà servi à un encaissement : il ne peut plus être annulé.' : e.message); return; }
    onChange();
    charger();
  }

  const c = recu?.contenu;
  return (
    <PanneauLateral titre={<>Reçu {recu?.numero ?? ''}</>} sousTitre={c?.dossier?.trajet ?? undefined} onClose={onClose}>
        {error && <p className="page-error">{error}</p>}
        {!recu && !error && <p className="loading-state">Chargement…</p>}
        {recu && c && (
          <>
            <div className="pr-a-recevoir">
              <span>Montant reçu en espèces</span>
              <strong>{montantRecu(c)}</strong>
              <small>{montantEurRecu(c)} · {c.dossier?.trajet ?? ''}</small>
            </div>
            <div className="pr-lignes" style={{ marginTop: 14, display: 'grid', gap: 8 }}>
              <div className="pr-ligne"><span className="pr-libelle">État</span><span><BadgeStatutRecu statut={recu.statut} />{recu.statut === 'annule' && recu.annule_motif ? <span className="hint"> · {recu.annule_motif}</span> : null}</span></div>
              <div className="pr-ligne"><span className="pr-libelle">Édité</span><span>{dateRecu(recu.emis_at)}{c.agent ? ` · ${c.agent}` : ''}</span></div>
              <div className="pr-ligne"><span className="pr-libelle">Payé par</span><span>{[c.payeur?.nom, c.payeur?.telephone].filter(Boolean).join(' · ') || '-'}</span></div>
              <div className="pr-ligne"><span className="pr-libelle">Envoi</span><span>{c.dossier?.reference ? `#${c.dossier.reference}` : '-'}</span></div>
              <div className="pr-ligne"><span className="pr-libelle">E-mails envoyés</span><span>{recu.envois} sur 3</span></div>
            </div>
            <div style={{ marginTop: 16 }}><RecuActions recu={recu} onEnvoye={(n) => setRecu((r) => (r ? { ...r, envois: n } : r))} /></div>
            <div className="action-row" style={{ justifyContent: 'space-between', marginTop: 16 }}>
              {recu.statut === 'emis' ? <button className="btn btn-soft btn-sm" onClick={annuler}>Annuler ce reçu</button> : <span />}
              <button className="btn" onClick={onClose}>Fermer</button>
            </div>
          </>
        )}
      {fenetre}
    </PanneauLateral>
  );
}

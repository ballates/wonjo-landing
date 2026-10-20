import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { supabase } from '../../lib/supabase';
import { Modal } from '../Modal';
import { InfoBulle } from '../InfoBulle';
import { DataTable, type Column } from '../DataTable';
import { PanneauLateral } from '../PanneauLateral';
import { useMultiPoints } from '../../lib/useMultiPoints';
import { BandePoints, TOUS_LES_POINTS, type CompteurPoint } from './BandePoints';
import { dateCourte, type PointRelais } from '../../lib/pointsRelais';

// Depots (docs/POINTS_RELAIS.md § 5, etape 6 ; migration 398) : colis payes au point, a deposer, deposes,
// puis remis au voyageur par le point focal au nom de l'expediteur. La remise reprend le QR de l'app :
// l'agent l'affiche, le voyageur le scanne depuis son application (format partage avec utils/remiseQr.ts).

interface Depot {
  demande_id: string;
  reference: string;
  statut_colis: 'en_attente' | 'accepte';
  flux: 'trajet' | 'colis';
  trajet: string;
  depart: string | null;
  expediteur_nom: string | null;
  expediteur_telephone: string | null;
  porteur_nom: string | null;
  porteur_telephone: string | null;
  description: string | null;
  poids_kg: number | null;
  type_envoi: string | null;
  depot_at: string | null;
  depot_photo_path: string | null;
  depot_note: string | null;
  paiement_valide_at: string;
}

type Etape = 'a_deposer' | 'attente_voyageur' | 'pret';
function etape(d: Depot): Etape {
  if (!d.depot_at) return 'a_deposer';
  return d.statut_colis === 'accepte' ? 'pret' : 'attente_voyageur';
}
const LIBELLE_ETAPE: Record<Etape, string> = {
  a_deposer: 'Colis pas encore déposé',
  attente_voyageur: 'Déposé · en attente du voyageur',
  pret: 'Prêt à remettre',
};

function tel(numero: string | null) {
  if (!numero) return null;
  return <a className="pr-tel" href={`tel:${numero.replace(/[^\d+]/g, '')}`}>{numero}</a>;
}

// Photo reduite avant envoi : 1600 px au plus, JPEG. Une photo de telephone brute depasse vite 5 Mo.
async function reduirePhoto(fichier: File): Promise<Blob> {
  const url = URL.createObjectURL(fichier);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error('Image illisible'));
      i.src = url;
    });
    const echelle = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * echelle);
    canvas.height = Math.round(img.height * echelle);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error('Conversion impossible'))), 'image/jpeg', 0.85));
  } finally {
    URL.revokeObjectURL(url);
  }
}

type LigneDepot = Depot & { point: PointRelais };

// Tous les points dans un tableau : ce qui attend une action de l'agent (depot a enregistrer, colis pret a remettre) d'abord.
export function DepotsSection({ points }: { points: PointRelais[] }) {
  const { items, error, recharger: charger } = useMultiPoints<Depot>(points, 'depots', 60_000);
  const [message, setMessage] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [aDeposer, setADeposer] = useState<LigneDepot | null>(null);
  const [aRemettre, setARemettre] = useState<LigneDepot | null>(null);
  const [choix, setChoix] = useState(TOUS_LES_POINTS);
  const plusieurs = points.length > 1;

  // Ordre de travail : prets a remettre, puis a deposer, puis en attente du voyageur.
  const rang: Record<Etape, number> = { pret: 0, a_deposer: 1, attente_voyageur: 2 };
  const compteurs = useMemo(() => {
    const c: Record<string, CompteurPoint> = {};
    for (const d of items ?? []) {
      const x = (c[d.point.id] ??= { total: 0, urgents: 0 });
      x.total += 1;
      if (etape(d) !== 'attente_voyageur') x.urgents += 1;
    }
    return c;
  }, [items]);
  const visibles = useMemo(() => (items ?? []).filter((d) => choix === TOUS_LES_POINTS || d.point.id === choix).sort((a, b) => rang[etape(a)] - rang[etape(b)]), [items, choix]); // eslint-disable-line react-hooks/exhaustive-deps
  const ligneOuverte = visibles.find((d) => d.demande_id === ouvert) ?? null;

  const action = (d: LigneDepot) => {
    const e = etape(d);
    if (e === 'a_deposer') return <button className="pr-paie-btn pr-paie-btn--autre" onClick={(ev) => { ev.stopPropagation(); setMessage(null); setADeposer(d); }}>Enregistrer le dépôt</button>;
    if (e === 'pret') return <button className="pr-paie-btn pr-paie-btn--stripe" onClick={(ev) => { ev.stopPropagation(); setMessage(null); setARemettre(d); }}>Remettre</button>;
    return <span className="hint">En attente du voyageur</span>;
  };

  const colonnes: Column<LigneDepot>[] = [
    ...(plusieurs ? [{ key: 'point', label: 'Point', value: (d: LigneDepot) => d.point.nom, filter: 'options' as const, render: (d: LigneDepot) => <strong className="pr-nowrap">{d.point.nom}</strong> }] : []),
    { key: 'ref', label: 'Référence', value: (d) => d.reference, render: (d) => <span className="pr-ref">#{d.reference}</span> },
    { key: 'etat', label: 'État', value: (d) => LIBELLE_ETAPE[etape(d)], filter: 'options',
      render: (d) => { const e = etape(d); return <span className={`pr-urgence pr-urgence--${e === 'pret' ? 'urgent' : e === 'a_deposer' ? 'ok' : 'proche'}`}>{LIBELLE_ETAPE[e]}</span>; } },
    { key: 'colis', label: 'Colis', value: (d) => `${d.type_envoi === 'document' ? 'Document' : `${d.poids_kg ?? 0} kg`} ${d.description ?? ''}`,
      render: (d) => <span className="pr-nowrap"><strong>{d.type_envoi === 'document' ? 'Document' : `${Number(d.poids_kg ?? 0).toLocaleString('fr-FR')} kg`}</strong>{d.description && <span className="hint"> · {d.description.length > 28 ? `${d.description.slice(0, 28)}…` : d.description}</span>}</span> },
    { key: 'trajet', label: 'Trajet', value: (d) => d.trajet, render: (d) => <span className="pr-nowrap">{d.trajet}</span> },
    { key: 'exp', label: 'Expéditeur', value: (d) => `${d.expediteur_nom ?? ''} ${d.expediteur_telephone ?? ''}`,
      render: (d) => <span className="pr-nowrap">{d.expediteur_nom ?? 'Membre'}{d.expediteur_telephone && <span className="hint"> · {d.expediteur_telephone}</span>}</span> },
    { key: 'voy', label: 'Voyageur', value: (d) => `${d.porteur_nom ?? ''} ${d.porteur_telephone ?? ''}`,
      render: (d) => <span className="pr-nowrap">{d.porteur_nom ?? '-'}{d.porteur_telephone && <span className="hint"> · {d.porteur_telephone}</span>}</span> },
    { key: 'actions', label: '', width: 170, render: action },
  ];

  return (
    <div>
      <div className="pr-entete">
        <div>
          <h3>Dépôts et remises<InfoBulle>Colis payés au point : enregistrez le dépôt quand l'expéditeur vous confie son colis, puis remettez-le au voyageur avec le QR code.</InfoBulle></h3>
        </div>
      </div>
      {message && <p className="success-text" style={{ marginBottom: 12 }}>{message}</p>}
      {error && <p className="page-error">{error}</p>}

      {!items ? <p className="loading-state">Chargement…</p> : (
        <>
          <BandePoints points={points} compteurs={compteurs} choix={choix} onChoix={setChoix} />
          <div className="pr-dense">
            <DataTable rows={visibles} columns={colonnes} rowKey={(d) => d.demande_id} integre title="Colis à déposer ou à remettre" pageSize={10}
                       onRowClick={(d) => setOuvert(d.demande_id)}
                       emptyText="Aucun colis payé en attente de dépôt ou de remise." />
          </div>
        </>
      )}

      {ligneOuverte && (
        <PanneauLateral
          titre={<>#{ligneOuverte.reference}</>}
          sousTitre={<>{ligneOuverte.point.nom} · {LIBELLE_ETAPE[etape(ligneOuverte)]}</>}
          onClose={() => setOuvert(null)}
          pied={(
            <>
              <button className="btn" onClick={() => setOuvert(null)}>Fermer</button>
              {etape(ligneOuverte) === 'a_deposer' && <button className="btn btn-primary" onClick={() => { setMessage(null); setADeposer(ligneOuverte); }}>Enregistrer le dépôt</button>}
              {etape(ligneOuverte) === 'pret' && <button className="btn btn-primary" onClick={() => { setMessage(null); setARemettre(ligneOuverte); }}>Remettre au voyageur</button>}
            </>
          )}
        >
          {(() => {
            const d = ligneOuverte;
            return (
              <>
                <div className="panneau-montant">
                  <strong>{d.type_envoi === 'document' ? 'Document' : `${Number(d.poids_kg ?? 0).toLocaleString('fr-FR')} kg`}</strong>
                  {d.description && <span>{d.description}</span>}
                </div>
                <dl className="panneau-liste">
                  <dt>Trajet</dt><dd>{d.trajet}{d.depart ? ` · départ ${dateCourte(d.depart)}` : ''}</dd>
                  <dt>Expéditeur</dt><dd>{d.expediteur_nom ?? 'Membre'}{d.expediteur_telephone && <> · {tel(d.expediteur_telephone)}</>}</dd>
                  <dt>Voyageur</dt><dd>{d.porteur_nom ?? '-'}{d.porteur_telephone && <> · {tel(d.porteur_telephone)}</>}</dd>
                  {d.depot_at && <><dt>Déposé</dt><dd>{dateCourte(d.depot_at)}{d.depot_note ? ` · ${d.depot_note}` : ''}</dd></>}
                  <dt>Point</dt><dd>{d.point.nom}</dd>
                </dl>
                {etape(d) === 'attente_voyageur' && <p className="hint">Le voyageur n'a pas encore accepté : la remise sera possible dès qu'il l'aura fait.</p>}
              </>
            );
          })()}
        </PanneauLateral>
      )}

      {aDeposer && (
        <DepotModal item={aDeposer} onClose={() => setADeposer(null)}
                    onFait={() => { setADeposer(null); setOuvert(null); setMessage(`Dépôt #${aDeposer.reference} enregistré : l'expéditeur a été prévenu.`); charger(); }} />
      )}
      {aRemettre && (
        <RemiseModal item={aRemettre} pointId={aRemettre.point.id} onClose={() => { setARemettre(null); charger(); }}
                     onRemis={() => { setARemettre(null); setOuvert(null); setMessage(`Colis #${aRemettre.reference} remis au voyageur.`); charger(); }} />
      )}
    </div>
  );
}

function DepotModal({ item, onClose, onFait }: { item: Depot; onClose: () => void; onFait: () => void }) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [verifie, setVerifie] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (apercu) URL.revokeObjectURL(apercu); }, [apercu]);

  function choisir(f: File | undefined) {
    if (!f) return;
    setPhoto(f);
    setApercu(URL.createObjectURL(f));
  }

  async function enregistrer() {
    if (!photo) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await reduirePhoto(photo);
      const chemin = `${item.demande_id}/remise_expediteur/depot-${Date.now()}.jpg`;
      const { error: up } = await supabase.storage.from('constats').upload(chemin, blob, { contentType: 'image/jpeg', upsert: false });
      if (up) throw new Error(up.message);
      const { error: e } = await supabase.rpc('admin_pr_enregistrer_depot', { p_demande_id: item.demande_id, p_photo_path: chemin, p_note: note.trim() });
      if (e) throw new Error(e.message);
      onFait();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="modal-title">Dépôt du colis #{item.reference}</h2>
      <div className="modal-body">
        <p className="hint">{item.expediteur_nom ?? 'L\'expéditeur'} vous confie son colis : photographiez-le tel que vous le recevez. Cette photo servira de constat de remise au voyageur.</p>
        <div className="pr-photo" onClick={() => input.current?.click()} role="button" tabIndex={0}
             onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') input.current?.click(); }}>
          {apercu ? <img src={apercu} alt="Colis déposé" /> : (
            <span><strong>Prendre ou choisir une photo</strong><small>Le colis entier, étiquette visible si possible</small></span>
          )}
        </div>
        <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => choisir(e.target.files?.[0])} />
        <div className="form-grid" style={{ marginTop: 14 }}>
          <label>Remarque (facultatif)<input type="text" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Ex. sac bleu fermé, 2 colis scotchés" /></label>
          <label style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, fontWeight: 600 }}>
            <input type="checkbox" checked={verifie} onChange={(e) => setVerifie(e.target.checked)} style={{ marginTop: 3 }} />
            <span>J'ai vérifié le contenu avec l'expéditeur : rien d'interdit, conforme à la description{item.description ? ` (« ${item.description} »)` : ''}.</span>
          </label>
        </div>
        {error && <p className="page-error" style={{ marginTop: 12 }}>{error}</p>}
        <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn" onClick={onClose} disabled={busy}>Annuler</button>
          <button className="btn btn-primary" onClick={enregistrer} disabled={busy || !photo || !verifie}>{busy ? 'Enregistrement…' : 'Enregistrer le dépôt'}</button>
        </div>
      </div>
    </Modal>
  );
}

// Contenu du QR : « wr:<demande sans tirets>:<code> », le format que lit l'app du voyageur (utils/remiseQr.ts).
function contenuQr(demandeId: string, code: string): string {
  return `wr:${demandeId.replace(/-/g, '').toLowerCase()}:${code}`;
}

function RemiseModal({ item, pointId, onClose, onRemis }: { item: Depot; pointId: string; onClose: () => void; onRemis: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [expire, setExpire] = useState<number | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [maintenant, setMaintenant] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generer(regenerer: boolean) {
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc('admin_pr_generer_qr_remise', { p_demande_id: item.demande_id, p_regenerer: regenerer });
    setBusy(false);
    const r = data as { ok?: boolean; code?: string; expire_at?: string; error?: string; reessayer_a?: string } | null;
    if (e || !r?.ok || !r.code) {
      setError(e?.message ?? (r?.reessayer_a ? `Trop de codes générés : réessayez à ${new Date(r.reessayer_a).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.` : r?.error ?? 'Code indisponible'));
      return;
    }
    setCode(r.code);
    setExpire(r.expire_at ? new Date(r.expire_at).getTime() : null);
    setSvg(await QRCode.toString(contenuQr(item.demande_id, r.code), { type: 'svg', errorCorrectionLevel: 'L', margin: 1, width: 280 }));
  }

  useEffect(() => { generer(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Compte a rebours du code (5 min cote serveur).
  useEffect(() => {
    const t = window.setInterval(() => setMaintenant(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  // Le voyageur scanne depuis son app : des que la demande sort de la file du point (remis_porteur), c'est fait.
  useEffect(() => {
    const t = window.setInterval(async () => {
      const { data, error: e } = await supabase.rpc('admin_pr_depots', { p_point_id: pointId });
      if (e) return;
      const encore = ((data ?? []) as Depot[]).some((d) => d.demande_id === item.demande_id && d.statut_colis === 'accepte');
      if (!encore) onRemis();
    }, 4000);
    return () => window.clearInterval(t);
  }, [item.demande_id, pointId]); // eslint-disable-line react-hooks/exhaustive-deps

  const restant = expire ? Math.max(0, Math.round((expire - maintenant) / 1000)) : null;
  const expireDeja = restant === 0;

  return (
    <Modal onClose={onClose}>
      <h2 className="modal-title">Remise au voyageur #{item.reference}</h2>
      <div className="modal-body">
        <p className="hint">Montrez ce QR code à <strong>{item.porteur_nom ?? 'le voyageur'}</strong> : il le scanne depuis son application, photographie le colis et confirme. Vérifiez d'abord son identité.</p>
        <div className={`pr-qr ${expireDeja ? 'pr-qr--expire' : ''}`}>
          {svg ? <div className="pr-qr-image" dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="loading-state">{busy ? 'Génération…' : ''}</p>}
          {code && (
            <div className="pr-qr-code">
              <span>Code à saisir si le scan échoue</span>
              <strong>{code}</strong>
            </div>
          )}
          {restant != null && (
            <span className={`pr-urgence pr-urgence--${expireDeja ? 'depasse' : restant < 60 ? 'urgent' : 'proche'}`}>
              {expireDeja ? 'Code expiré' : `Valable encore ${Math.floor(restant / 60)} min ${String(restant % 60).padStart(2, '0')} s`}
            </span>
          )}
        </div>
        {error && <p className="page-error" style={{ marginTop: 12 }}>{error}</p>}
        <div className="action-row" style={{ justifyContent: 'space-between', marginTop: 16 }}>
          <button className="btn" onClick={onClose}>Fermer</button>
          <button className="btn btn-soft" onClick={() => generer(true)} disabled={busy}>Nouveau code</button>
        </div>
        <p className="hint" style={{ marginTop: 10 }}>Cette fenêtre se ferme toute seule dès que le voyageur a confirmé la remise.</p>
      </div>
    </Modal>
  );
}

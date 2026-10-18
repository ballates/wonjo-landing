import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { supabase } from '../../lib/supabase';
import { Modal } from '../Modal';
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

export function DepotsSection({ point }: { point: PointRelais }) {
  const [items, setItems] = useState<Depot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [aDeposer, setADeposer] = useState<Depot | null>(null);
  const [aRemettre, setARemettre] = useState<Depot | null>(null);

  function charger() {
    supabase.rpc('admin_pr_depots', { p_point_id: point.id }).then(({ data, error: e }) => {
      if (e) { setError(e.message); setItems([]); return; }
      setError(null);
      setItems((data ?? []) as Depot[]);
    });
  }
  useEffect(() => {
    setItems(null);
    charger();
    const t = window.setInterval(charger, 60_000);
    return () => window.clearInterval(t);
  }, [point.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="pr-entete">
        <div>
          <h3>Dépôts et remises</h3>
          <p className="hint">Colis payés au point <strong>{point.nom}</strong> : enregistrez le dépôt quand l'expéditeur vous confie son colis, puis remettez-le au voyageur avec le QR code.</p>
        </div>
      </div>
      {message && <p className="success-text" style={{ marginBottom: 12 }}>{message}</p>}
      {error && <p className="page-error">{error}</p>}

      {!items ? <p className="loading-state">Chargement…</p> : items.length === 0 ? (
        <div className="empty-state">Aucun colis payé en attente de dépôt ou de remise.</div>
      ) : (
        <div className="pr-grid">
          {items.map((d) => {
            const e = etape(d);
            return (
              <article key={d.demande_id} className={`pr-card pr-card--${e === 'pret' ? 'urgent' : e === 'a_deposer' ? 'ok' : 'proche'}`}>
                <div className="pr-card-haut">
                  <span className="pr-ref">#{d.reference}</span>
                  <span className={`pr-urgence pr-urgence--${e === 'pret' ? 'urgent' : e === 'a_deposer' ? 'ok' : 'proche'}`}>{LIBELLE_ETAPE[e]}</span>
                </div>
                <div className="pr-colis">
                  <strong>{d.type_envoi === 'document' ? 'Document' : `${Number(d.poids_kg ?? 0).toLocaleString('fr-FR')} kg`}</strong>
                  {d.description && <span>{d.description}</span>}
                </div>
                <div className="pr-ligne"><span className="pr-libelle">Trajet</span><span>{d.trajet}{d.depart ? ` · départ ${dateCourte(d.depart)}` : ''}</span></div>
                <div className="pr-ligne"><span className="pr-libelle">Expéditeur</span><span>{d.expediteur_nom ?? 'Membre'}{d.expediteur_telephone && <> · {tel(d.expediteur_telephone)}</>}</span></div>
                <div className="pr-ligne"><span className="pr-libelle">Voyageur</span><span>{d.porteur_nom ?? '-'}{d.porteur_telephone && <> · {tel(d.porteur_telephone)}</>}</span></div>
                {d.depot_at && (
                  <div className="pr-ligne"><span className="pr-libelle">Déposé</span><span>{dateCourte(d.depot_at)}{d.depot_note ? ` · ${d.depot_note}` : ''}</span></div>
                )}
                {e === 'attente_voyageur' && <p className="hint">Le voyageur n'a pas encore accepté : la remise sera possible dès qu'il l'aura fait.</p>}
                {e === 'a_deposer' && (
                  <button className="btn btn-soft pr-action" onClick={() => { setMessage(null); setADeposer(d); }}>Enregistrer le dépôt</button>
                )}
                {e === 'pret' && (
                  <button className="btn btn-primary pr-action" onClick={() => { setMessage(null); setARemettre(d); }}>Remettre au voyageur</button>
                )}
              </article>
            );
          })}
        </div>
      )}

      {aDeposer && (
        <DepotModal item={aDeposer} onClose={() => setADeposer(null)}
                    onFait={() => { setADeposer(null); setMessage(`Dépôt #${aDeposer.reference} enregistré : l'expéditeur a été prévenu.`); charger(); }} />
      )}
      {aRemettre && (
        <RemiseModal item={aRemettre} pointId={point.id} onClose={() => { setARemettre(null); charger(); }}
                     onRemis={() => { setARemettre(null); setMessage(`Colis #${aRemettre.reference} remis au voyageur.`); charger(); }} />
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

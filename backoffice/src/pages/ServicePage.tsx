import { useCallback, useEffect, useState } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { peutGererAdmins } from '../lib/permissions';
import { messageServeur } from '../lib/labels';
import { ReglageTete } from '../components/ReglageTete';
import { VersionsAppSection, dateCourte, type EtatOta } from './VersionsAppSection';

// [526-530] Page Service : l'état de Wonjo d'un coup d'œil (bandeau et tuiles), puis un onglet par outil : maintenance (l'app
// affiche un écran de maintenance à la place de tout), versions de l'app (retour à une version précédente), interrupteurs (couper une
// fonctionnalité sans publier), version minimale, historique. Lecture : tout le siège. Modification : super admin, motif obligatoire,
// inscrite au journal, vérifiée par le serveur. Le bilan est aussi relevé chaque minute par le service de surveillance extérieur,
// qui prévient même quand ce back-office est fermé.

interface Reglages {
  maintenance_active: boolean;
  maintenance_message: string | null;
  maintenance_retour: string | null;
  maintenance_depuis: string | null;
  version_min_ios: number;
  version_min_android: number;
  lien_ios: string | null;
  lien_android: string | null;
}

interface Ligne {
  created_at: string;
  action: 'maintenance' | 'version_minimale' | 'interrupteur' | 'ota_retour';
  motif: string;
  detail: Record<string, unknown>;
  par: string | null;
}

interface EtatService {
  reglages: Reglages;
  sante: string[];
  historique: Ligne[];
}

interface Interrupteur { cle: string; actif: boolean; maj_at: string }

type Onglet = 'maintenance' | 'versions' | 'interrupteurs' | 'version-minimale' | 'historique';
const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: 'maintenance', libelle: 'Maintenance' },
  { cle: 'versions', libelle: 'Versions de l’app' },
  { cle: 'interrupteurs', libelle: 'Interrupteurs' },
  { cle: 'version-minimale', libelle: 'Version minimale' },
  { cle: 'historique', libelle: 'Historique' },
];

const RAISONS: Record<string, string> = {
  base_injoignable: 'La base ne répond pas.',
  connexion_injoignable: 'La connexion des utilisateurs ne répond pas.',
  taches_planifiees_arretees: 'Les tâches planifiées ne tournent plus (libération des fonds, remboursements, relances).',
  taches_planifiees_en_echec: 'Des tâches planifiées échouent à répétition (3 échecs ou plus dans l’heure).',
  fonctions_serveur_en_erreur: 'Des fonctions serveur répondent en erreur (3 fois ou plus dans l’heure).',
  paiements_non_traites: 'Un paiement reçu de Stripe n’est pas traité depuis plus de 30 minutes.',
};

// Texte que l'app affiche quand aucun message n'est saisi (service.maintenanceMessage dans l'app).
const MESSAGE_DEFAUT = 'Nous avons détecté un problème et notre équipe y travaille. Vos transports, vos messages et vos paiements restent enregistrés.';

// Ce que fait chaque interrupteur. `page` : il se règle sur sa propre page (règles propres, revue à deux), sinon ici (530).
const INTERRUPTEURS: Record<string, { titre: string; effet: string; page?: { chemin: string; nom: string } }> = {
  remise_qr_active: {
    titre: 'Remise par QR code',
    effet: 'Remise et restitution confirmées par QR code. Éteint : la photo seule suffit.',
  },
  flux2_plusieurs_voyageurs: {
    titre: 'Plusieurs voyageurs sur un colis',
    effet: 'Un colis réparti entre plusieurs voyageurs. Éteint : un seul.',
  },
  cgv_acceptation_exigee: {
    titre: 'Case des CGV avant paiement',
    effet: 'Case CGV à cocher pour payer. Éteint : paiement sans case.',
  },
  commission_minimums_actifs: { titre: 'Commission fixe par zone', effet: 'Ajoute le montant fixe de zone aux 10 %.', page: { chemin: '/tarification', nom: 'Tarification' } },
  commission_personnalisee_active: { titre: 'Commissions personnalisées', effet: 'Taux du back-office appliqués aux nouvelles demandes.', page: { chemin: '/tarification', nom: 'Tarification' } },
  annulation_frais_retenus_actif: { titre: 'Frais retenus à l’annulation', effet: 'Frais Stripe retenus si l’expéditeur annule après paiement.', page: { chemin: '/tarification', nom: 'Tarification' } },
  protection_valeur_active: { titre: 'Frais liés à la valeur déclarée', effet: 'Frais calculés sur la valeur déclarée.', page: { chemin: '/tarification', nom: 'Tarification' } },
  protection_renforcee_active: { titre: 'Protection renforcée', effet: 'Option colis fragile. Wonjo ne couvre pas la casse : laisser éteinte.', page: { chemin: '/tarification', nom: 'Tarification' } },
  stripe_frais_confirmes: { titre: 'Frais Stripe confirmés', effet: 'Frais Stripe estimés = ceux du contrat (affichage).', page: { chemin: '/tarification', nom: 'Tarification' } },
  points_relais_actif: { titre: 'Points relais', effet: 'Parcours des points relais, app et back-office.', page: { chemin: '/points-relais', nom: 'Points relais' } },
  points_relais_virement_avance: { titre: 'Virement avancé (points relais)', effet: 'Wonjo avance par Stripe un voyageur payé en caisse.', page: { chemin: '/points-relais', nom: 'Points relais' } },
};

const date = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const heure = (d: Date) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export function ServicePage() {
  const { roles } = useAuth();
  const modifiable = peutGererAdmins(roles);
  const [params, setParams] = useSearchParams();
  const onglet = (ONGLETS.find((o) => o.cle === params.get('onglet'))?.cle ?? 'maintenance') as Onglet;
  const [etat, setEtat] = useState<EtatService | null>(null);
  const [ota, setOta] = useState<EtatOta | null>(null);
  const [interrupteurs, setInterrupteurs] = useState<Interrupteur[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const [lu, setLu] = useState<Date | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    const [e, o, i] = await Promise.all([
      supabase.rpc('admin_etat_service'),
      supabase.rpc('admin_ota_etat'),
      supabase.rpc('admin_interrupteurs'),
    ]);
    setChargement(false);
    const err = e.error ?? o.error ?? i.error;
    if (err) { setErreur(messageServeur(err.message)); return; }
    setErreur(null);
    setEtat(e.data as EtatService);
    setOta(o.data as EtatOta);
    setInterrupteurs(i.data as Interrupteur[]);
    setLu(new Date());
  }, []);
  useEffect(() => { charger(); }, [charger]);

  // Pendant une opération sur les versions (une à deux minutes), la page se relit seule.
  useEffect(() => {
    if (!ota?.en_cours) return;
    const id = setInterval(charger, 8000);
    return () => clearInterval(id);
  }, [ota?.en_cours, charger]);

  return (
    <div className="service-page">
      <div className="page-head">
        <div>
          <h1>Service</h1>
          <p className="page-sub">L’état de Wonjo et les outils pour réagir à une panne.</p>
        </div>
        <button type="button" className="btn btn-sm" onClick={charger} disabled={chargement}>{chargement ? '…' : 'Actualiser'}</button>
      </div>

      {erreur && <p className="page-error">{erreur}</p>}
      {!etat || !ota || !interrupteurs ? (!erreur && <p className="loading-state">Chargement…</p>) : (
        <>
          <Bandeau etat={etat} lu={lu} />
          <Tuiles etat={etat} ota={ota} interrupteurs={interrupteurs} ouvrir={(o) => setParams({ onglet: o }, { replace: true })} />

          <div className="tabs service-onglets">
            {ONGLETS.map((o) => (
              <button key={o.cle} className={onglet === o.cle ? 'active' : ''} onClick={() => setParams({ onglet: o.cle }, { replace: true })}>
                {o.libelle}
              </button>
            ))}
          </div>

          {onglet === 'maintenance' && <Maintenance reglages={etat.reglages} modifiable={modifiable} onChange={charger} />}
          {onglet === 'versions' && <VersionsAppSection etat={ota} modifiable={modifiable} onChange={charger} />}
          {onglet === 'interrupteurs' && <Interrupteurs liste={interrupteurs} modifiable={modifiable} onChange={charger} />}
          {onglet === 'version-minimale' && <VersionMinimale reglages={etat.reglages} modifiable={modifiable} onChange={charger} />}
          {onglet === 'historique' && <Historique lignes={etat.historique} />}
        </>
      )}
    </div>
  );
}

function Bandeau({ etat, lu }: { etat: EtatService; lu: Date | null }) {
  const panne = etat.sante.length > 0;
  const maintenance = etat.reglages.maintenance_active;
  const ton = panne ? 'panne' : maintenance ? 'maintenance' : 'ok';
  const titre = panne ? 'Panne détectée' : maintenance ? 'Maintenance en cours' : 'Tout fonctionne';
  const detail = panne
    ? 'Le service de surveillance extérieur vous prévient aussi par e-mail et sur l’appli.'
    : maintenance
      ? 'Les utilisateurs voient l’écran de maintenance à la place de l’app.'
      : 'Base, connexion, tâches planifiées, fonctions serveur et paiements Stripe répondent.';
  return (
    <div className={`service-bandeau is-${ton}`} role="status">
      <span className="service-bandeau-point" aria-hidden="true" />
      <div className="service-bandeau-texte">
        <strong>{titre}</strong>
        <span>{detail}</span>
        {panne && (
          <ul className="service-raisons">
            {etat.sante.map((r) => <li key={r}>{RAISONS[r] ?? r}</li>)}
          </ul>
        )}
      </div>
      {lu && <span className="service-bandeau-heure">Vérifié à {heure(lu)}</span>}
    </div>
  );
}

function Tuiles({ etat, ota, interrupteurs, ouvrir }: {
  etat: EtatService; ota: EtatOta; interrupteurs: Interrupteur[]; ouvrir: (o: Onglet) => void;
}) {
  const r = etat.reglages;
  const enService = ota.versions.find((v) => v.en_service && v.branche === 'preview') ?? ota.versions.find((v) => v.en_service);
  const allumes = interrupteurs.filter((i) => i.actif).length;
  const minimale = r.version_min_ios > 0 || r.version_min_android > 0
    ? `iOS ${r.version_min_ios || '—'} · Android ${r.version_min_android || '—'}` : 'Aucune';
  const tuiles: { onglet: Onglet; libelle: string; valeur: string; detail: string; alerte?: boolean }[] = [
    {
      onglet: 'maintenance', libelle: 'Maintenance', alerte: r.maintenance_active,
      valeur: r.maintenance_active ? 'Allumée' : 'Éteinte',
      detail: r.maintenance_active && r.maintenance_depuis ? `depuis le ${date(r.maintenance_depuis)}` : 'L’app est ouverte à tous',
    },
    {
      onglet: 'versions', libelle: 'Version en service',
      valeur: enService ? date(enService.publie_at) : '—',
      detail: enService?.message ?? 'Liste à actualiser',
    },
    { onglet: 'interrupteurs', libelle: 'Interrupteurs', valeur: `${allumes} sur ${interrupteurs.length}`, detail: 'allumés' },
    { onglet: 'version-minimale', libelle: 'Version minimale', valeur: minimale, detail: 'Numéro de build exigé' },
  ];
  return (
    <div className="service-tuiles">
      {tuiles.map((t) => (
        <button key={t.onglet} type="button" className={`service-tuile ${t.alerte ? 'is-alerte' : ''}`} onClick={() => ouvrir(t.onglet)}>
          <span className="service-tuile-libelle">{t.libelle}</span>
          <span className="service-tuile-valeur">{t.valeur}</span>
          <span className="service-tuile-detail">{t.detail}</span>
        </button>
      ))}
    </div>
  );
}

function Maintenance({ reglages, modifiable, onChange }: { reglages: Reglages; modifiable: boolean; onChange: () => void }) {
  const actif = reglages.maintenance_active;
  const [message, setMessage] = useState('');
  const [retour, setRetour] = useState('');
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function basculer() {
    if (!motif.trim()) { setErreur('Le motif est obligatoire.'); return; }
    if (!actif && !window.confirm('Allumer la maintenance ? Plus personne ne pourra utiliser l’app, remise de colis en cours comprise, jusqu’à ce que vous l’éteigniez.')) return;
    setBusy(true);
    setErreur(null);
    const { error } = await supabase.rpc('admin_definir_maintenance', {
      p_active: !actif,
      p_message: actif ? null : message.trim() || null,
      p_retour: actif || !retour ? null : new Date(retour).toISOString(),
      p_motif: motif.trim(),
    });
    setBusy(false);
    if (error) { setErreur(messageServeur(error.message)); return; }
    setMessage(''); setRetour(''); setMotif('');
    onChange();
  }

  const apercuMessage = actif ? (reglages.maintenance_message || MESSAGE_DEFAUT) : (message.trim() || MESSAGE_DEFAUT);
  const apercuRetour = actif ? reglages.maintenance_retour : (retour ? new Date(retour).toISOString() : null);

  return (
    <div className="chart-card rg-carte">
      <div className="service-maintenance">
        <div className="service-maintenance-reglage">
          <div className="rg-tete-texte">
            <h3>Mode maintenance</h3>
            <p className="chart-sub">
              Remplace toute l’app par un écran de maintenance. Pour les vraies pannes : bloque aussi les remises en cours.
            </p>
          </div>

          {actif ? (
            <div className="service-apercu">
              <p><strong>Allumée depuis :</strong> {reglages.maintenance_depuis ? date(reglages.maintenance_depuis) : '—'}</p>
              <p className="hint">Visible dans l’app au plus tard 5 minutes après.</p>
            </div>
          ) : (
            <div className="form-grid service-form">
              <label className="field">
                Message affiché (facultatif)
                <textarea rows={3} maxLength={500} value={message} placeholder={MESSAGE_DEFAUT}
                          disabled={!modifiable} onChange={(e) => setMessage(e.target.value)} />
              </label>
              <label className="field">
                Retour prévu (facultatif)
                <input type="datetime-local" value={retour} disabled={!modifiable} onChange={(e) => setRetour(e.target.value)} />
              </label>
            </div>
          )}

          {modifiable ? (
            <div className="rg-confirmer-ligne service-action">
              <input type="text" value={motif} placeholder="Motif (inscrit au journal)" onChange={(e) => setMotif(e.target.value)} />
              <button type="button" className={`btn btn-sm ${actif ? 'btn-primary' : 'btn-danger'}`} disabled={busy || !motif.trim()} onClick={basculer}>
                {busy ? '…' : actif ? 'Éteindre la maintenance' : 'Allumer la maintenance'}
              </button>
            </div>
          ) : <p className="hint service-hint">Modifiable par un super admin.</p>}
          {erreur && <p className="page-error">{erreur}</p>}
        </div>

        {/* Ce que voit l'utilisateur, avec le texte saisi : on relit avant d'allumer. */}
        <div className="service-telephone" aria-label="Aperçu de l’écran dans l’app">
          <div className="service-telephone-ecran">
            <span className="service-telephone-pastille" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5z" />
              </svg>
            </span>
            <strong>Wonjo est en maintenance</strong>
            <p>{apercuMessage}</p>
            {apercuRetour && <p className="service-telephone-retour">Retour prévu : {date(apercuRetour)}</p>}
            <span className="service-telephone-bouton">Réessayer</span>
            <span className="service-telephone-lien">Contacter le support</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Interrupteurs({ liste, modifiable, onChange }: { liste: Interrupteur[]; modifiable: boolean; onChange: () => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const reglables = liste.filter((i) => INTERRUPTEURS[i.cle] && !INTERRUPTEURS[i.cle].page);
  const ailleurs = liste.filter((i) => !INTERRUPTEURS[i.cle] || INTERRUPTEURS[i.cle].page);

  async function basculer(cle: string, allumer: boolean, motif: string): Promise<string | null> {
    const { error } = await supabase.rpc('admin_definir_interrupteur', { p_cle: cle, p_actif: allumer, p_motif: motif });
    if (error) return messageServeur(error.message);
    setMessage(`${INTERRUPTEURS[cle]?.titre ?? cle} : ${allumer ? 'allumé' : 'éteint'}. L’app en tient compte à sa prochaine lecture des réglages.`);
    onChange();
    return null;
  }

  return (
    <>
      <div className="chart-card rg-carte">
        <h3>Couper ou rallumer une fonctionnalité</h3>
        <p className="chart-sub">Retour arrière immédiat, sans publier de version.</p>
        {message && <p className="success-text service-hint">{message}</p>}
        <div className="service-interrupteurs">
          {reglables.map((i) => (
            <div key={i.cle} className="service-interrupteur">
              <ReglageTete
                titre={INTERRUPTEURS[i.cle].titre}
                sousTitre={INTERRUPTEURS[i.cle].effet}
                actif={i.actif}
                etatOn="Allumé"
                etatOff="Éteint"
                questionAllumer={`Allumer « ${INTERRUPTEURS[i.cle].titre} » ?`}
                questionEteindre={`Éteindre « ${INTERRUPTEURS[i.cle].titre} » ?`}
                modifiable={modifiable}
                onConfirmer={(allumer, motif) => basculer(i.cle, allumer, motif)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="chart-card rg-carte">
        <h3>Réglés sur leur propre page</h3>
        <p className="chart-sub">Règles propres (ex. baisse validée par un second super admin) : réglage sur leur page.</p>
        <table className="service-historique">
          <tbody>
            {ailleurs.map((i) => {
              const c = INTERRUPTEURS[i.cle];
              return (
                <tr key={i.cle}>
                  <td><strong>{c?.titre ?? i.cle}</strong><div className="hint">{c?.effet}</div></td>
                  <td><span className={`badge ${i.actif ? 'badge-green' : 'badge-muted'}`}>{i.actif ? 'Allumé' : 'Éteint'}</span></td>
                  <td className="service-cellule-action">{c?.page && <NavLink to={c.page.chemin}>{c.page.nom} →</NavLink>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function VersionMinimale({ reglages, modifiable, onChange }: { reglages: Reglages; modifiable: boolean; onChange: () => void }) {
  const [ios, setIos] = useState(String(reglages.version_min_ios));
  const [android, setAndroid] = useState(String(reglages.version_min_android));
  const [lienIos, setLienIos] = useState(reglages.lien_ios ?? '');
  const [lienAndroid, setLienAndroid] = useState(reglages.lien_android ?? '');
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    setIos(String(reglages.version_min_ios));
    setAndroid(String(reglages.version_min_android));
    setLienIos(reglages.lien_ios ?? '');
    setLienAndroid(reglages.lien_android ?? '');
  }, [reglages]);

  async function enregistrer() {
    const i = Number.parseInt(ios || '0', 10);
    const a = Number.parseInt(android || '0', 10);
    if (!Number.isInteger(i) || !Number.isInteger(a) || i < 0 || a < 0) { setErreur('Numéros de build invalides.'); return; }
    if (!motif.trim()) { setErreur('Le motif est obligatoire.'); return; }
    setBusy(true);
    setErreur(null);
    setOk(false);
    const { error } = await supabase.rpc('admin_definir_version_minimale', {
      p_ios: i, p_android: a, p_lien_ios: lienIos.trim() || null, p_lien_android: lienAndroid.trim() || null, p_motif: motif.trim(),
    });
    setBusy(false);
    if (error) { setErreur(messageServeur(error.message)); return; }
    setMotif('');
    setOk(true);
    onChange();
  }

  return (
    <div className="chart-card rg-carte">
      <h3>Version minimale</h3>
      <p className="chart-sub">
        Un build plus ancien voit « Mise à jour nécessaire », avec le lien. 0 : aucune exigence.
      </p>
      <div className="form-grid service-form">
        <div className="field-row">
          <label className="field">
            Build iOS minimal
            <input type="number" min={0} value={ios} disabled={!modifiable} onChange={(e) => setIos(e.target.value)} />
          </label>
          <label className="field">
            Build Android minimal
            <input type="number" min={0} value={android} disabled={!modifiable} onChange={(e) => setAndroid(e.target.value)} />
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            Lien iOS (App Store ou TestFlight)
            <input type="text" value={lienIos} placeholder="https://" disabled={!modifiable} onChange={(e) => setLienIos(e.target.value)} />
          </label>
          <label className="field">
            Lien Android (Play Store ou APK)
            <input type="text" value={lienAndroid} placeholder="https://" disabled={!modifiable} onChange={(e) => setLienAndroid(e.target.value)} />
          </label>
        </div>
      </div>
      {modifiable ? (
        <div className="rg-confirmer-ligne service-action">
          <input type="text" value={motif} placeholder="Motif (inscrit au journal)" onChange={(e) => setMotif(e.target.value)} />
          <button type="button" className="btn btn-sm btn-primary" disabled={busy || !motif.trim()} onClick={enregistrer}>
            {busy ? '…' : 'Enregistrer'}
          </button>
        </div>
      ) : <p className="hint service-hint">Modifiable par un super admin.</p>}
      {ok && <p className="success-text service-hint">Enregistré : pris en compte au prochain lancement.</p>}
      {erreur && <p className="page-error">{erreur}</p>}
    </div>
  );
}

function Historique({ lignes }: { lignes: Ligne[] }) {
  const resume = (l: Ligne) => {
    const d = l.detail;
    switch (l.action) {
      case 'maintenance': return d.active ? 'Maintenance allumée' : 'Maintenance éteinte';
      case 'version_minimale': return `Version minimale : iOS ${d.ios ?? 0}, Android ${d.android ?? 0}`;
      case 'interrupteur': return `${INTERRUPTEURS[String(d.cle)]?.titre ?? d.cle} : ${d.actif ? 'allumé' : 'éteint'}`;
      case 'ota_retour': return `Retour à la version « ${d.message ?? d.groupe} »`;
      default: return l.action;
    }
  };
  return (
    <div className="chart-card rg-carte">
      <h3>Historique</h3>
      <p className="chart-sub">Qui, quand, pourquoi : maintenance, version minimale, interrupteurs, retours.</p>
      {lignes.length === 0 ? <p className="hint service-hint">Aucun changement pour l’instant.</p> : (
        <table className="service-historique">
          <thead><tr><th>Date</th><th>Changement</th><th>Motif</th><th>Par</th></tr></thead>
          <tbody>
            {lignes.map((l, i) => (
              <tr key={`${l.created_at}-${i}`}>
                <td className="service-date">{dateCourte(l.created_at)}</td>
                <td>{resume(l)}</td>
                <td>{l.motif}</td>
                <td>{l.par ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

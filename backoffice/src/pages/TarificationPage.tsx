import { useState } from 'react';
import { CommissionsSection } from './CommissionsPage';
import { CorridorsSection } from './CorridorsPage';

type SousOnglet = 'commissions' | 'corridors';

export function TarificationPage() {
  const [onglet, setOnglet] = useState<SousOnglet>('commissions');

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Tarification</h1>
          <p className="page-sub">Commissions, plafonds de prix par corridor et pays/villes desservis.</p>
        </div>
      </div>

      <div className="tabs">
        <button className={onglet === 'commissions' ? 'active' : ''} onClick={() => setOnglet('commissions')}>Commissions</button>
        <button className={onglet === 'corridors' ? 'active' : ''} onClick={() => setOnglet('corridors')}>Corridors</button>
      </div>

      {onglet === 'commissions' ? <CommissionsSection /> : <CorridorsSection />}
    </div>
  );
}

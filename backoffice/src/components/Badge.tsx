type BadgeTone = 'amber' | 'teal' | 'green' | 'muted' | 'danger';

const STATUT_TONES: Record<string, BadgeTone> = {
  nouveau: 'amber',
  en_cours: 'teal',
  clos_sans_suite: 'muted',
  clos_action_prise: 'green',
  pending: 'amber',
  approved: 'green',
  rejected: 'danger',
};

export function Badge({ children, tone }: { children: React.ReactNode; tone: BadgeTone }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function StatutBadge({ statut, label }: { statut: string; label: string }) {
  return <Badge tone={STATUT_TONES[statut] ?? 'muted'}>{label}</Badge>;
}

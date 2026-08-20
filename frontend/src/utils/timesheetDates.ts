/** Parse API datetime as UTC so display (local) matches what we sent. Append Z if no tz. */
export function parseUTC(s: string): Date {
  const t = s.trim();
  if (!/Z$|[-+]\d{2}:?\d{2}$/.test(t) && t.includes('T')) return new Date(t + 'Z');
  return new Date(t);
}

export function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatClockTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

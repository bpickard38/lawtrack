import type { Activity } from '../types';
import { parseUTC } from './timesheetDates';

export type Warning = 'unassigned' | 'overlap' | 'invalid-range';

export const WARNING_LABELS: Record<Warning, string> = {
  unassigned: 'Unassigned',
  overlap: 'Overlaps another entry',
  'invalid-range': 'Invalid time range',
};

/** An entry is safe to bulk-approve only once every warning here is cleared. */
export function computeWarnings(activity: Activity, sameDayActivities: Activity[]): Warning[] {
  const warnings: Warning[] = [];
  if (activity.case_id == null) warnings.push('unassigned');

  const start = parseUTC(activity.start_time).getTime();
  const end = parseUTC(activity.end_time).getTime();
  if (end <= start) {
    warnings.push('invalid-range');
  } else {
    const overlaps = sameDayActivities.some(other => {
      if (other.id === activity.id) return false;
      const os = parseUTC(other.start_time).getTime();
      const oe = parseUTC(other.end_time).getTime();
      return start < oe && os < end;
    });
    if (overlaps) warnings.push('overlap');
  }
  return warnings;
}

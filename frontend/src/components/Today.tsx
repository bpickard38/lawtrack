import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Activity, Case, RuleType } from '../types';
import {
  fetchActivities, updateActivity, bulkApproveActivities,
  createCase, createCaseRule, getSettings, updateTrackingEnabled,
  getAgentKeyStatus, isAgentInstalled,
} from '../api';
import { toYMD, formatDuration, formatClockTime, parseUTC } from '../utils/timesheetDates';
import { computeWarnings, WARNING_LABELS } from '../utils/reviewWarnings';
import { getNarrativeDescription } from '../utils/invoicePdf';
import Timesheet, { ActivityModal } from './Timesheet';

interface TodayProps {
  attorneyId: number;
  attorney: { billable_rate: number };
  cases: Case[];
  onCaseAdded: () => void;
  onNavigateToApprovedTime: () => void;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Heuristic pattern for "remember this assignment" - reuses the existing, real case_rules
 * engine rather than inventing a separate mechanism. */
function derivePattern(a: Activity): { rule_type: RuleType; pattern: string } | null {
  if (a.type === 'email' && a.email_from?.includes('@')) {
    const domain = a.email_from.split('@')[1]?.trim();
    if (domain) return { rule_type: 'email_domain_equals', pattern: domain };
  }
  if (a.type === 'call' && a.contact_name?.trim()) {
    return { rule_type: 'contact_name_contains', pattern: a.contact_name.trim() };
  }
  if (a.type === 'document' && a.document_name?.trim()) {
    return { rule_type: 'document_contains', pattern: a.document_name.trim() };
  }
  return null;
}

function getSourceLabel(a: Activity): string {
  if (a.type === 'document') return a.document_name || 'Document';
  if (a.type === 'email') return a.email_from ? `Email from ${a.email_from}` : (a.email_subject || 'Email');
  if (a.type === 'call') return a.contact_name ? `Call with ${a.contact_name}` : 'Call';
  return a.description || 'Activity';
}

function getActivityName(a: Activity): string {
  if (a.type === 'document') return a.document_name || 'Document';
  if (a.type === 'email') return a.email_subject || a.email_from || 'Email';
  if (a.type === 'call') return a.contact_name || 'Call';
  return a.description || 'Activity';
}

function getActivityTypeLabel(t: string): string {
  switch (t) {
    case 'document': return 'doc';
    case 'email': return 'email';
    case 'call': return 'call';
    default: return t;
  }
}

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export default function Today({ attorneyId, attorney, cases, onCaseAdded, onNavigateToApprovedTime }: TodayProps) {
  const [dayOffset, setDayOffset] = useState(0);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [editActivity, setEditActivity] = useState<Activity | null>(null);
  const [addingActivity, setAddingActivity] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [rememberPrompt, setRememberPrompt] = useState<{ activityId: number; caseId: number; caseName: string; pattern: { rule_type: RuleType; pattern: string } } | null>(null);
  const [newMatterFor, setNewMatterFor] = useState<number | null>(null);
  const [newMatterName, setNewMatterName] = useState('');
  const [newMatterClient, setNewMatterClient] = useState('');
  const [creatingMatter, setCreatingMatter] = useState(false);
  const [trackingEnabled, setTrackingEnabled] = useState<boolean | null>(null);
  // The pause toggle controls the desktop agent, so it's only meaningful once one is installed.
  const [agentInstalled, setAgentInstalled] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);

  const date = useMemo(() => addDays(new Date(), dayOffset), [dayOffset]);
  const isToday = dayOffset === 0;

  const loadActivities = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchActivities({ attorney_id: attorneyId, date: toYMD(date) });
      data.sort((a, b) => parseUTC(a.start_time).getTime() - parseUTC(b.start_time).getTime());
      setActivities(data);
    } catch (e) {
      console.error("Failed to load today's activities:", e);
    } finally {
      setLoading(false);
    }
  }, [attorneyId, date]);

  useEffect(() => { loadActivities(); }, [loadActivities]);

  useEffect(() => {
    getSettings().then(s => setTrackingEnabled(s.tracking_enabled)).catch(() => {});
    getAgentKeyStatus().then(s => setAgentInstalled(isAgentInstalled(s))).catch(() => {});
  }, []);

  const warningsById = useMemo(() => {
    const map = new Map<number, ReturnType<typeof computeWarnings>>();
    activities.forEach(a => map.set(a.id, computeWarnings(a, activities)));
    return map;
  }, [activities]);

  const billableMinutes = activities.filter(a => a.is_billable).reduce((s, a) => s + a.duration_minutes, 0);
  const estimatedValue = (billableMinutes / 60) * (attorney.billable_rate || 0);
  const needsMatterCount = activities.filter(a => a.case_id == null).length;
  const readyCount = activities.filter(a => a.case_id != null && a.status !== 'approved' && (warningsById.get(a.id)?.length ?? 0) === 0).length;
  const approvedActivities = activities.filter(a => a.status === 'approved');
  const approvedMinutes = approvedActivities.reduce((s, a) => s + a.duration_minutes, 0);
  const approvedValue = approvedActivities.filter(a => a.is_billable).reduce((s, a) => s + a.duration_minutes, 0) / 60 * (attorney.billable_rate || 0);
  const hasAnyActivity = activities.length > 0;
  const allReviewed = hasAnyActivity && needsMatterCount === 0 && readyCount === 0;

  async function withBusy<T>(id: number, fn: () => Promise<T>): Promise<T> {
    setBusyIds(prev => new Set(prev).add(id));
    try {
      return await fn();
    } finally {
      setBusyIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  async function handleAssign(activity: Activity, caseIdStr: string) {
    if (caseIdStr === '__new__') {
      setNewMatterFor(activity.id);
      return;
    }
    const caseId = caseIdStr ? parseInt(caseIdStr, 10) : null;
    const wasUnassigned = activity.case_id == null;
    try {
      const updated = await withBusy(activity.id, () => updateActivity(activity.id, { case_id: caseId, status: 'edited' }));
      setActivities(prev => prev.map(a => a.id === activity.id ? updated : a));
      if (wasUnassigned && caseId) {
        const pattern = derivePattern(activity);
        const caseName = cases.find(c => c.id === caseId)?.name ?? 'this matter';
        if (pattern) setRememberPrompt({ activityId: activity.id, caseId, caseName, pattern });
      }
    } catch (err) {
      alert('Failed to assign matter: ' + (err as Error).message);
    }
  }

  async function handleConfirmRemember() {
    if (!rememberPrompt) return;
    try {
      await createCaseRule({ case_id: rememberPrompt.caseId, rule_type: rememberPrompt.pattern.rule_type, pattern: rememberPrompt.pattern.pattern });
    } catch (err) {
      alert('Failed to save rule: ' + (err as Error).message);
    } finally {
      setRememberPrompt(null);
    }
  }

  async function handleApprove(activity: Activity) {
    try {
      const updated = await withBusy(activity.id, () => updateActivity(activity.id, { status: 'approved' }));
      setActivities(prev => prev.map(a => a.id === activity.id ? updated : a));
    } catch (err) {
      alert('Failed to approve: ' + (err as Error).message);
    }
  }

  async function handleUndoApprove(activity: Activity) {
    try {
      const updated = await withBusy(activity.id, () => updateActivity(activity.id, { status: 'edited' }));
      setActivities(prev => prev.map(a => a.id === activity.id ? updated : a));
    } catch (err) {
      alert('Failed to undo: ' + (err as Error).message);
    }
  }

  async function handleApproveAllReady() {
    const ids = activities
      .filter(a => a.case_id != null && a.status !== 'approved' && (warningsById.get(a.id)?.length ?? 0) === 0)
      .map(a => a.id);
    if (ids.length === 0) return;
    try {
      await bulkApproveActivities(ids);
      setActivities(prev => prev.map(a => ids.includes(a.id) ? { ...a, status: 'approved' as const } : a));
    } catch (err) {
      alert('Failed to approve entries: ' + (err as Error).message);
    }
  }

  async function handleCreateMatter(e: React.FormEvent) {
    e.preventDefault();
    if (!newMatterName.trim() || newMatterFor == null) return;
    const activity = activities.find(a => a.id === newMatterFor);
    if (!activity) return;
    setCreatingMatter(true);
    try {
      const created = await createCase({ name: newMatterName.trim(), client_name: newMatterClient.trim() || undefined, attorney_id: attorneyId });
      onCaseAdded();
      setNewMatterFor(null);
      setNewMatterName('');
      setNewMatterClient('');
      await handleAssign(activity, String(created.id));
    } catch (err) {
      alert('Failed to create matter: ' + (err as Error).message);
    } finally {
      setCreatingMatter(false);
    }
  }

  async function handleToggleTracking() {
    if (trackingEnabled == null) return;
    const next = !trackingEnabled;
    setTrackingEnabled(next);
    try {
      await updateTrackingEnabled(next);
    } catch {
      setTrackingEnabled(!next);
    }
  }

  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="today-view">
      <div className="today-header">
        <div className="today-header-nav">
          <button type="button" className="ts-header-arrow" onClick={() => setDayOffset(o => o - 1)} aria-label="Previous day">‹</button>
          <button type="button" className="ts-today-btn" onClick={() => setDayOffset(0)}>Today</button>
          <button type="button" className="ts-header-arrow" onClick={() => setDayOffset(o => o + 1)} aria-label="Next day">›</button>
          <span className="today-date-label">{isToday ? `Today · ${dateLabel}` : dateLabel}</span>
        </div>
        <div className="today-header-actions">
          {agentInstalled && (
            <button
              type="button"
              className={`today-tracking-pill ${trackingEnabled ? 'on' : 'off'}`}
              onClick={handleToggleTracking}
              disabled={trackingEnabled == null}
              title="Pause or resume the desktop app's automatic capture"
            >
              <span className="today-tracking-dot" />
              {trackingEnabled == null ? 'Loading…' : trackingEnabled ? 'Tracking' : 'Paused'}
            </button>
          )}
          <button type="button" className="today-add-btn" onClick={() => setAddingActivity(true)}>
            + Add
          </button>
        </div>
      </div>

      <div className="today-stats">
        <div className="today-stat-card">
          <span className="today-stat-value">{formatDuration(billableMinutes)}</span>
          <span className="today-stat-label">billable time detected</span>
        </div>
        <div className="today-stat-card">
          <span className="today-stat-value">{currency.format(estimatedValue)}</span>
          <span className="today-stat-label">estimated value</span>
        </div>
        <div className="today-stat-card">
          <span className="today-stat-value">{readyCount}</span>
          <span className="today-stat-label">ready to approve</span>
        </div>
        <div className={`today-stat-card ${needsMatterCount > 0 ? 'attention' : ''}`}>
          <span className="today-stat-value">{needsMatterCount}</span>
          <span className="today-stat-label">need a matter</span>
        </div>
      </div>

      {readyCount > 0 && (
        <div className="today-approve-bar">
          <span>{readyCount} {readyCount === 1 ? 'entry is' : 'entries are'} assigned and ready.</span>
          <button type="button" className="btn-primary" onClick={handleApproveAllReady}>
            Approve {readyCount} ready {readyCount === 1 ? 'entry' : 'entries'}
          </button>
        </div>
      )}

      {loading && <div className="ts-loading" aria-live="polite">Loading today's activity…</div>}

      {!loading && !hasAnyActivity && (
        <div className="ts-empty-state">
          <h3 className="ts-empty-title">Nothing captured {isToday ? 'yet today' : 'this day'}</h3>
          <p className="ts-empty-desc">
            {isToday
              ? 'As you work, the desktop agent and your logged entries will show up here for review.'
              : 'No activity was recorded on this day.'}
          </p>
        </div>
      )}

      {!loading && allReviewed && (
        <div className="today-completion-card">
          <h3>All caught up</h3>
          <p>
            {approvedActivities.length} {approvedActivities.length === 1 ? 'entry' : 'entries'} approved ·{' '}
            {formatDuration(approvedMinutes)} · {currency.format(approvedValue)} in billable value.
          </p>
          <p className="today-completion-sub">Every entry from this day has been reviewed.</p>
          <button type="button" className="btn-outline" onClick={onNavigateToApprovedTime}>View approved time</button>
        </div>
      )}

      {!loading && hasAnyActivity && (
        <ul className="today-list">
          {activities.map(a => {
            const warnings = warningsById.get(a.id) ?? [];
            const isApproved = a.status === 'approved';
            const busy = busyIds.has(a.id);
            const start = parseUTC(a.start_time);
            const end = parseUTC(a.end_time);
            const description = a.narrative || getNarrativeDescription(a);

            return (
              <li
                key={a.id}
                className={`today-row ${warnings.length > 0 ? 'attention' : ''} ${isApproved ? 'approved' : ''}`}
                onClick={() => setEditActivity(a)}
                title="Click to edit"
              >
                <div className="today-row-top">
                  <span className="today-row-time">{formatClockTime(start)} – {formatClockTime(end)}</span>
                  <span className="today-row-duration">{formatDuration(a.duration_minutes)}</span>
                  <span className="review-row-type-badge" data-type={a.type}>{getActivityTypeLabel(a.type)}</span>
                  {a.confidence === 'high' && <span className="confidence-badge high">Auto-matched</span>}
                  {a.case_id == null && <span className="confidence-badge low">Needs your review</span>}
                  {isApproved && <span className="review-badge ok">Approved</span>}
                  {!a.is_billable && <span className="review-badge muted">Non-billable</span>}
                  {warnings.map(w => <span key={w} className="review-badge warn">{WARNING_LABELS[w]}</span>)}
                </div>

                <div className="today-row-main">
                  <div className="today-row-desc">
                    <span className="today-row-name">{getActivityName(a)}</span>
                    <span className="today-row-narrative">{description}</span>
                    <span className="today-row-source">Source: {a.source === 'agent' ? 'Desktop agent' : 'Manually logged'} — {getSourceLabel(a)}</span>
                  </div>

                  <div className="today-row-matter" onClick={e => e.stopPropagation()}>
                    <select
                      value={a.case_id ?? ''}
                      onChange={e => handleAssign(a, e.target.value)}
                      disabled={busy}
                      aria-label={`Matter for ${getActivityName(a)}`}
                      className={a.case_id == null ? 'unassigned' : ''}
                    >
                      <option value="">Choose a matter…</option>
                      {cases.map(c => (
                        <option key={c.id} value={c.id}>{c.name}{c.client_name ? ` — ${c.client_name}` : ''}</option>
                      ))}
                      <option value="__new__">+ New matter…</option>
                    </select>
                  </div>

                  <div className="today-row-actions" onClick={e => e.stopPropagation()}>
                    {isApproved ? (
                      <button type="button" className="review-row-edit" onClick={() => handleUndoApprove(a)} disabled={busy}>Undo</button>
                    ) : (
                      <button
                        type="button"
                        className="today-approve-btn"
                        onClick={() => handleApprove(a)}
                        disabled={busy || a.case_id == null || warnings.length > 0}
                        title={a.case_id == null ? 'Choose a matter first' : warnings.length > 0 ? 'Fix warnings first' : 'Approve this entry'}
                      >
                        Approve
                      </button>
                    )}
                  </div>
                </div>

                {newMatterFor === a.id && (
                  <form className="today-new-matter-form" onSubmit={handleCreateMatter} onClick={e => e.stopPropagation()}>
                    <input
                      type="text"
                      placeholder="Matter name *"
                      value={newMatterName}
                      onChange={e => setNewMatterName(e.target.value)}
                      required
                      autoFocus
                    />
                    <input
                      type="text"
                      placeholder="Client name"
                      value={newMatterClient}
                      onChange={e => setNewMatterClient(e.target.value)}
                    />
                    <button type="submit" className="btn-primary" disabled={creatingMatter}>{creatingMatter ? 'Creating…' : 'Create & assign'}</button>
                    <button type="button" className="ts-btn-cancel" onClick={() => { setNewMatterFor(null); setNewMatterName(''); setNewMatterClient(''); }}>Cancel</button>
                  </form>
                )}

                {rememberPrompt?.activityId === a.id && (
                  <div className="today-remember-prompt" onClick={e => e.stopPropagation()}>
                    <span>Automatically assign similar activity to <strong>{rememberPrompt.caseName}</strong> next time?</span>
                    <button type="button" className="btn-primary" onClick={handleConfirmRemember}>Remember this assignment</button>
                    <button type="button" className="ts-btn-cancel" onClick={() => setRememberPrompt(null)}>No thanks</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="today-timeline-toggle">
        <button type="button" className="btn-outline" onClick={() => setShowTimeline(v => !v)}>
          {showTimeline ? 'Hide workday timeline' : 'Show workday timeline'}
        </button>
      </div>

      {showTimeline && (
        <div className="today-timeline">
          <Timesheet attorneyId={attorneyId} cases={cases} onCaseAdded={onCaseAdded} timelineOnly />
        </div>
      )}

      {addingActivity && (
        <ActivityModal
          mode="add"
          attorneyId={attorneyId}
          cases={cases}
          initialDay={date}
          initialSlotIndex={0}
          slotToTime={() => { const now = new Date(); return { h: now.getHours(), m: now.getMinutes() }; }}
          onClose={() => setAddingActivity(false)}
          onSaved={() => { setAddingActivity(false); loadActivities(); }}
        />
      )}

      {editActivity && (
        <ActivityModal
          mode="edit"
          attorneyId={attorneyId}
          cases={cases}
          activity={editActivity}
          slotToTime={() => ({ h: 9, m: 0 })}
          onClose={() => setEditActivity(null)}
          onSaved={() => { setEditActivity(null); loadActivities(); }}
          onDeleted={(deletedId) => { setEditActivity(null); setActivities(prev => prev.filter(a => a.id !== deletedId)); }}
        />
      )}
    </div>
  );
}

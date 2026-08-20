import { useEffect, useMemo, useState } from 'react';
import type { Activity, Case } from '../types';
import { parseUTC, formatDuration, formatClockTime } from '../utils/timesheetDates';
import { computeWarnings, WARNING_LABELS, type Warning } from '../utils/reviewWarnings';

interface TimesheetReviewProps {
  days: Date[];
  weekLabel: string;
  activitiesByDay: Map<string, Activity[]>;
  weekTotalMinutes: number;
  cases: Case[];
  onToday: () => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onEditActivity: (activity: Activity) => void;
  onAssignCase: (activityId: number, caseId: number | null) => void;
  onBulkAssign: (activityIds: number[], caseId: number) => Promise<void>;
  onBulkDelete: (activityIds: number[]) => Promise<void>;
  getActivityName: (a: Activity) => string;
  getActivityTypeLabel: (t: string) => string;
}

export default function TimesheetReview({
  days,
  weekLabel,
  activitiesByDay,
  weekTotalMinutes,
  cases,
  onToday,
  onPrevWeek,
  onNextWeek,
  onEditActivity,
  onAssignCase,
  onBulkAssign,
  onBulkDelete,
  getActivityName,
  getActivityTypeLabel,
}: TimesheetReviewProps) {
  const [filter, setFilter] = useState<'all' | 'attention'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkCaseId, setBulkCaseId] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const allActivities = useMemo(() => {
    const out: Activity[] = [];
    activitiesByDay.forEach(arr => out.push(...arr));
    return out;
  }, [activitiesByDay]);

  const warningsById = useMemo(() => {
    const map = new Map<number, Warning[]>();
    activitiesByDay.forEach(dayActivities => {
      dayActivities.forEach(a => {
        map.set(a.id, computeWarnings(a, dayActivities));
      });
    });
    return map;
  }, [activitiesByDay]);

  const needsAttentionCount = useMemo(
    () => allActivities.filter(a => (warningsById.get(a.id)?.length ?? 0) > 0).length,
    [allActivities, warningsById]
  );

  const dayGroups = useMemo(() => {
    return days.map(day => {
      const key = day.toDateString();
      const dayActivities = activitiesByDay.get(key) || [];
      const filtered = filter === 'attention'
        ? dayActivities.filter(a => (warningsById.get(a.id)?.length ?? 0) > 0)
        : dayActivities;
      const dayTotalMinutes = dayActivities.reduce((s, a) => s + a.duration_minutes, 0);
      return { day, key, dayActivities: filtered, dayTotalMinutes };
    });
  }, [days, activitiesByDay, filter, warningsById]);

  const visibleCount = dayGroups.reduce((s, g) => s + g.dayActivities.length, 0);
  const hasAnyActivity = allActivities.length > 0;

  const toggleSelected = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setBulkCaseId('');
  };

  const weekKey = days[0]?.toDateString() ?? '';
  useEffect(() => {
    clearSelection();
  }, [weekKey]);

  const handleBulkAssignClick = async () => {
    if (!bulkCaseId || selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      await onBulkAssign(Array.from(selectedIds), parseInt(bulkCaseId, 10));
      clearSelection();
    } catch {
      // onBulkAssign already surfaced the error; keep the selection so the user can retry.
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkDeleteClick = async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    if (!confirm(`Delete ${count} ${count === 1 ? 'entry' : 'entries'}? This cannot be undone.`)) return;
    setBulkBusy(true);
    try {
      await onBulkDelete(Array.from(selectedIds));
      clearSelection();
    } catch {
      // onBulkDelete already surfaced the error; keep the selection so the user can retry.
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="review-view">
      <div className="review-summary">
        <div className="review-summary-nav">
          <button type="button" className="ts-today-btn" onClick={onToday}>Today</button>
          <button type="button" className="ts-header-arrow" onClick={onPrevWeek} aria-label="Previous week">‹</button>
          <button type="button" className="ts-header-arrow" onClick={onNextWeek} aria-label="Next week">›</button>
          <span className="ts-week-label">{weekLabel}</span>
        </div>
        <div className="review-summary-stats">
          <div className="review-stat">
            <span className="review-stat-value">{formatDuration(weekTotalMinutes)}</span>
            <span className="review-stat-label">this week</span>
          </div>
          <div className={`review-attention-pill ${needsAttentionCount > 0 ? 'warn' : 'ok'}`}>
            {needsAttentionCount > 0
              ? `${needsAttentionCount} ${needsAttentionCount === 1 ? 'entry needs' : 'entries need'} attention`
              : 'All entries are ready'}
          </div>
        </div>
      </div>

      <div className="review-filters" role="tablist" aria-label="Filter entries">
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'all'}
          className={`review-filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All entries ({allActivities.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'attention'}
          className={`review-filter-btn ${filter === 'attention' ? 'active' : ''}`}
          onClick={() => setFilter('attention')}
        >
          Needs attention ({needsAttentionCount})
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div className="review-bulk-bar">
          <span className="review-bulk-count">{selectedIds.size} selected</span>
          <select
            value={bulkCaseId}
            onChange={e => setBulkCaseId(e.target.value)}
            aria-label="Case to assign selected entries to"
            disabled={bulkBusy}
          >
            <option value="">Assign to case…</option>
            {cases.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button
            type="button"
            className="ts-btn-save"
            onClick={handleBulkAssignClick}
            disabled={!bulkCaseId || bulkBusy}
          >
            Assign
          </button>
          <button
            type="button"
            className="ts-btn-delete"
            onClick={handleBulkDeleteClick}
            disabled={bulkBusy}
          >
            Delete
          </button>
          <button type="button" className="ts-btn-cancel" onClick={clearSelection} disabled={bulkBusy}>
            Cancel
          </button>
        </div>
      )}

      {!hasAnyActivity && (
        <div className="ts-empty-state">
          <h3 className="ts-empty-title">No activity recorded this week</h3>
          <p className="ts-empty-desc">Activity captured by your agent, or logged manually, will appear here for review.</p>
        </div>
      )}

      {hasAnyActivity && filter === 'attention' && visibleCount === 0 && (
        <div className="ts-empty-state">
          <h3 className="ts-empty-title">No entries need attention</h3>
          <p className="ts-empty-desc">Every entry this week is assigned to a case and free of warnings.</p>
        </div>
      )}

      {hasAnyActivity && visibleCount > 0 && (
        <div className="review-day-groups">
          {dayGroups.filter(g => g.dayActivities.length > 0).map(({ day, key, dayActivities, dayTotalMinutes }) => {
            const isToday = day.toDateString() === new Date().toDateString();
            return (
              <div className="review-day-group" key={key}>
                <div className="review-day-header">
                  <span className={`review-day-date ${isToday ? 'today' : ''}`}>
                    {day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                  </span>
                  <span className="review-day-total">{formatDuration(dayTotalMinutes)}</span>
                </div>
                <ul className="review-day-list">
                  {dayActivities.map(a => {
                    const warnings = warningsById.get(a.id) ?? [];
                    const needsAttention = warnings.length > 0;
                    const start = parseUTC(a.start_time);
                    const end = parseUTC(a.end_time);
                    const name = getActivityName(a);
                    return (
                      <li key={a.id} className={`review-row ${needsAttention ? 'attention' : ''}`}>
                        <input
                          type="checkbox"
                          className="review-row-checkbox"
                          checked={selectedIds.has(a.id)}
                          onChange={() => toggleSelected(a.id)}
                          aria-label={`Select ${name}`}
                        />
                        <span className="review-row-time">
                          {formatClockTime(start)} – {formatClockTime(end)}
                        </span>
                        <span className="review-row-duration">{formatDuration(a.duration_minutes)}</span>
                        <span className="review-row-type-badge" data-type={a.type}>
                          {getActivityTypeLabel(a.type)}
                        </span>
                        <span className="review-row-name" title={name}>{name}</span>
                        <span className="review-row-case">
                          <select
                            value={a.case_id ?? ''}
                            onChange={e => onAssignCase(a.id, e.target.value ? parseInt(e.target.value, 10) : null)}
                            aria-label={`Case for ${name}`}
                            className={a.case_id == null ? 'unassigned' : ''}
                          >
                            <option value="">Unassigned</option>
                            {cases.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </span>
                        <span className={`review-row-billable ${a.is_billable ? 'billable' : 'non-billable'}`}>
                          {a.is_billable ? 'Billable' : 'Non-billable'}
                        </span>
                        <span className="review-row-status">
                          {needsAttention ? (
                            warnings.map(w => (
                              <span key={w} className="review-badge warn">{WARNING_LABELS[w]}</span>
                            ))
                          ) : (
                            <span className="review-badge ok">Ready</span>
                          )}
                        </span>
                        <button
                          type="button"
                          className="review-row-edit"
                          onClick={() => onEditActivity(a)}
                          aria-label={`Edit ${name}`}
                        >
                          Edit
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

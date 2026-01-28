import { useState, useMemo } from 'react';
import type { Activity, Case } from '../types';
import { updateActivity, bulkAssignActivities, mergeActivities, deleteActivity } from '../api';

interface TimesheetProps {
  activities: Activity[];
  cases: Case[];
  onActivityUpdated: () => void;
}

export default function Timesheet({ activities, cases, onActivityUpdated }: TimesheetProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [bulkCaseId, setBulkCaseId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');
  const [weekOffset, setWeekOffset] = useState(0);

  // Calculate week boundaries
  const { weekStart, weekEnd, days } = useMemo(() => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay() + (weekOffset * 7));
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    const daysArr = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      daysArr.push(d);
    }

    return { weekStart: start, weekEnd: end, days: daysArr };
  }, [weekOffset]);

  // Group activities by day
  const activitiesByDay = useMemo(() => {
    const map = new Map<string, Activity[]>();
    days.forEach(d => map.set(d.toDateString(), []));

    activities.forEach(activity => {
      const date = new Date(activity.start_time);
      const key = date.toDateString();
      if (map.has(key)) {
        map.get(key)!.push(activity);
      }
    });

    // Sort each day's activities by start time
    map.forEach((acts, key) => {
      acts.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    });

    return map;
  }, [activities, days]);

  // Calculate totals
  const dailyTotals = useMemo(() => {
    const totals = new Map<string, { total: number; billable: number }>();
    activitiesByDay.forEach((acts, day) => {
      const total = acts.reduce((sum, a) => sum + a.duration_minutes, 0);
      const billable = acts.filter(a => a.is_billable).reduce((sum, a) => sum + a.duration_minutes, 0);
      totals.set(day, { total, billable });
    });
    return totals;
  }, [activitiesByDay]);

  const weekTotal = useMemo(() => {
    let total = 0, billable = 0;
    dailyTotals.forEach(t => {
      total += t.total;
      billable += t.billable;
    });
    return { total, billable };
  }, [dailyTotals]);

  const formatDuration = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const formatDayHeader = (date: Date) => {
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    return (
      <div className={`day-header ${isToday ? 'today' : ''}`}>
        <div className="day-name">{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
        <div className="day-date">{date.getDate()}</div>
      </div>
    );
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'document': return '📄';
      case 'email': return '📧';
      case 'call': return '📞';
      default: return '📋';
    }
  };

  const getCaseName = (caseId: number | null) => {
    if (!caseId) return null;
    return cases.find(c => c.id === caseId)?.name || 'Unknown';
  };

  const toggleSelect = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    const allIds = activities.map(a => a.id);
    setSelectedIds(new Set(allIds));
  };

  const selectNone = () => {
    setSelectedIds(new Set());
  };

  const handleBulkAssign = async () => {
    if (!bulkCaseId || selectedIds.size === 0) return;
    try {
      await bulkAssignActivities(Array.from(selectedIds), parseInt(bulkCaseId));
      setSelectedIds(new Set());
      setBulkCaseId('');
      onActivityUpdated();
    } catch (error) {
      alert('Error assigning activities: ' + (error as Error).message);
    }
  };

  const handleMerge = async () => {
    if (selectedIds.size < 2) {
      alert('Select at least 2 activities to merge');
      return;
    }
    const ids = Array.from(selectedIds);
    const selected = activities.filter(a => ids.includes(a.id));
    const types = new Set(selected.map(a => a.type));
    if (types.size > 1) {
      alert('Can only merge activities of the same type');
      return;
    }
    try {
      await mergeActivities(ids);
      setSelectedIds(new Set());
      onActivityUpdated();
    } catch (error) {
      alert('Error merging activities: ' + (error as Error).message);
    }
  };

  const handleToggleBillable = async (activity: Activity) => {
    try {
      await updateActivity(activity.id, { is_billable: !activity.is_billable, status: 'edited' });
      onActivityUpdated();
    } catch (error) {
      alert('Error updating activity: ' + (error as Error).message);
    }
  };

  const handleDelete = async (activityId: number) => {
    if (!confirm('Delete this activity?')) return;
    try {
      await deleteActivity(activityId);
      onActivityUpdated();
    } catch (error) {
      alert('Error deleting activity: ' + (error as Error).message);
    }
  };

  const handleUpdateNarrative = async (activity: Activity, narrative: string) => {
    try {
      await updateActivity(activity.id, { narrative, status: 'edited' });
      setEditingId(null);
      onActivityUpdated();
    } catch (error) {
      alert('Error updating narrative: ' + (error as Error).message);
    }
  };

  return (
    <div className="timesheet">
      {/* Header controls */}
      <div className="timesheet-header">
        <div className="week-nav">
          <button onClick={() => setWeekOffset(w => w - 1)} className="nav-btn">← Prev</button>
          <span className="week-label">
            {weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <button onClick={() => setWeekOffset(w => w + 1)} className="nav-btn">Next →</button>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} className="nav-btn" style={{ marginLeft: 8 }}>Today</button>
          )}
        </div>

        <div className="week-totals">
          <span><strong>Week:</strong> {formatDuration(weekTotal.total)}</span>
          <span style={{ marginLeft: 12 }}><strong>Billable:</strong> {formatDuration(weekTotal.billable)}</span>
        </div>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="bulk-actions">
          <span>{selectedIds.size} selected</span>
          <select value={bulkCaseId} onChange={e => setBulkCaseId(e.target.value)}>
            <option value="">Assign to case...</option>
            {cases.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={handleBulkAssign} disabled={!bulkCaseId}>Assign</button>
          <button onClick={handleMerge} disabled={selectedIds.size < 2}>Merge</button>
          <button onClick={selectNone}>Clear</button>
        </div>
      )}

      {/* Week grid */}
      <div className="timesheet-grid">
        {days.map(day => {
          const key = day.toDateString();
          const dayActivities = activitiesByDay.get(key) || [];
          const totals = dailyTotals.get(key) || { total: 0, billable: 0 };

          return (
            <div key={key} className="timesheet-day">
              {formatDayHeader(day)}
              <div className="day-totals">
                {formatDuration(totals.total)} ({formatDuration(totals.billable)} billable)
              </div>
              <div className="day-activities">
                {dayActivities.length === 0 ? (
                  <div className="no-activities">—</div>
                ) : (
                  dayActivities.map(activity => (
                    <div
                      key={activity.id}
                      className={`timesheet-activity ${activity.is_billable ? 'billable' : 'non-billable'} ${activity.case_id ? 'assigned' : 'unassigned'} ${selectedIds.has(activity.id) ? 'selected' : ''}`}
                    >
                      <div className="activity-row">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(activity.id)}
                          onChange={() => toggleSelect(activity.id)}
                        />
                        <span className="activity-icon">{getActivityIcon(activity.type)}</span>
                        <span className="activity-time">{formatTime(activity.start_time)}</span>
                        <span className="activity-duration">{formatDuration(activity.duration_minutes)}</span>
                        <button
                          className={`billable-toggle ${activity.is_billable ? 'on' : 'off'}`}
                          onClick={() => handleToggleBillable(activity)}
                          title={activity.is_billable ? 'Billable' : 'Non-billable'}
                        >
                          {activity.is_billable ? '$' : '—'}
                        </button>
                        <button className="delete-btn" onClick={() => handleDelete(activity.id)} title="Delete">×</button>
                      </div>
                      <div className="activity-details">
                        <div className="activity-desc">
                          {activity.document_name || activity.email_subject || activity.contact_name || activity.description || 'Activity'}
                        </div>
                        {activity.case_id ? (
                          <div className="case-badge small">✓ {getCaseName(activity.case_id)}</div>
                        ) : (
                          <div className="unassigned-badge">Unassigned</div>
                        )}
                      </div>
                      {editingId === activity.id ? (
                        <div className="narrative-edit">
                          <input
                            type="text"
                            defaultValue={activity.narrative || ''}
                            placeholder="Billing narrative..."
                            onBlur={e => handleUpdateNarrative(activity, e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleUpdateNarrative(activity, (e.target as HTMLInputElement).value)}
                            autoFocus
                          />
                        </div>
                      ) : (
                        <div className="narrative-display" onClick={() => setEditingId(activity.id)}>
                          {activity.narrative || <span className="placeholder">+ Add billing narrative</span>}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="timesheet-footer">
        <button onClick={selectAll} className="select-all-btn">Select All</button>
      </div>
    </div>
  );
}

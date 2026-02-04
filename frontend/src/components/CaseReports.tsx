import { useState, useEffect, useCallback } from 'react';
import type { Case, CaseTimeSummary, Activity, ActivityType } from '../types';
import {
  fetchCaseTimeSummary,
  fetchActivities,
  updateActivity,
  deleteActivity,
} from '../api';

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface CaseReportsProps {
  attorneyId: number;
  cases: Case[];
}

type ExpandKey = { caseId: number; type: 'document' | 'email' | 'call' };

export default function CaseReports({ attorneyId, cases }: CaseReportsProps) {
  const [summaries, setSummaries] = useState<Record<number, CaseTimeSummary>>({});
  const [unassignedSummary, setUnassignedSummary] = useState<CaseTimeSummary>({
    total_minutes: 0,
    total_hours: 0,
    document_minutes: 0,
    email_minutes: 0,
    call_minutes: 0,
    activity_count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [activitiesByCase, setActivitiesByCase] = useState<Record<number, Activity[]>>({});
  const [unassignedActivities, setUnassignedActivities] = useState<Activity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState<Record<number, boolean>>({});
  const [loadingUnassigned, setLoadingUnassigned] = useState(false);
  const [expanded, setExpanded] = useState<ExpandKey | null>(null);
  const [expandedUnassigned, setExpandedUnassigned] = useState<'document' | 'email' | 'call' | null>(null);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Activity | null>(null);

  const loadSummaries = useCallback(async () => {
    setLoading(true);
    const summaryMap: Record<number, CaseTimeSummary> = {};
    for (const c of cases) {
      try {
        const summary = await fetchCaseTimeSummary(c.id);
        summaryMap[c.id] = summary;
      } catch (error) {
        console.error(`Failed to load summary for case ${c.id}:`, error);
      }
    }
    setSummaries(summaryMap);
    
    // Load unassigned activities summary
    try {
      const unassigned = await fetchActivities({ attorney_id: attorneyId, unassigned: true });
      setUnassignedActivities(unassigned);
      
      // Calculate summary for unassigned
      const totalMinutes = unassigned.reduce((sum, a) => sum + a.duration_minutes, 0);
      const documentMinutes = unassigned.filter(a => a.type === 'document').reduce((sum, a) => sum + a.duration_minutes, 0);
      const emailMinutes = unassigned.filter(a => a.type === 'email').reduce((sum, a) => sum + a.duration_minutes, 0);
      const callMinutes = unassigned.filter(a => a.type === 'call').reduce((sum, a) => sum + a.duration_minutes, 0);
      
      setUnassignedSummary({
        total_minutes: totalMinutes,
        total_hours: totalMinutes / 60,
        document_minutes,
        email_minutes,
        call_minutes,
        activity_count: unassigned.length,
      });
    } catch (error) {
      console.error('Failed to load unassigned activities:', error);
      // Set empty summary on error - card will still show
      setUnassignedSummary({
        total_minutes: 0,
        total_hours: 0,
        document_minutes: 0,
        email_minutes: 0,
        call_minutes: 0,
        activity_count: 0,
      });
    }
    
    setLoading(false);
  }, [cases, attorneyId]);

  useEffect(() => {
    loadSummaries();
  }, [loadSummaries]);

  async function loadActivitiesForCase(caseId: number) {
    if (activitiesByCase[caseId]) return;
    setLoadingActivities(prev => ({ ...prev, [caseId]: true }));
    try {
      const list = await fetchActivities({ attorney_id: attorneyId, case_id: caseId });
      setActivitiesByCase(prev => ({ ...prev, [caseId]: list }));
    } catch (error) {
      console.error(`Failed to load activities for case ${caseId}:`, error);
    } finally {
      setLoadingActivities(prev => ({ ...prev, [caseId]: false }));
    }
  }

  function toggleExpand(caseId: number, type: 'document' | 'email' | 'call') {
    const key: ExpandKey = { caseId, type };
    const isSame = expanded?.caseId === caseId && expanded?.type === type;
    setExpanded(isSame ? null : key);
    if (!isSame) loadActivitiesForCase(caseId);
  }

  const formatHours = (hours: number) => hours.toFixed(1);
  const getPercentage = (part: number, total: number) =>
    total === 0 ? 0 : Math.round((part / total) * 100);

  function getActivityName(a: Activity) {
    return a.document_name || a.email_subject || a.contact_name || a.description || 'Activity';
  }

  function getActivityIcon(t: string) {
    switch (t) {
      case 'document': return '📄';
      case 'email': return '📧';
      case 'call': return '📞';
      default: return '📋';
    }
  }

  function handleActivityUpdated(updated: Activity) {
    const oldCaseId = editingActivity?.case_id ?? null;
    const newCaseId = updated.case_id;

    setActivitiesByCase(prev => {
      const next = { ...prev };
      if (oldCaseId != null && oldCaseId !== newCaseId) {
        const oldList = (next[oldCaseId] || []).filter(a => a.id !== updated.id);
        next[oldCaseId] = oldList;
      }
      if (newCaseId != null) {
        const newList = next[newCaseId] || [];
        const list = newList.some(a => a.id === updated.id)
          ? newList.map(a => (a.id === updated.id ? updated : a))
          : [...newList, updated];
        next[newCaseId] = list;
      }
      return next;
    });
    loadSummaries();
  }

  function handleDeleteClick(a: Activity) {
    setDeleteConfirm(a);
  }

  async function handleDeleteConfirm() {
    if (!deleteConfirm) return;
    const a = deleteConfirm;
    setDeleteConfirm(null);
    try {
      await deleteActivity(a.id);
      if (a.case_id) {
        setActivitiesByCase(prev => {
          const list = (prev[a.case_id!] || []).filter(x => x.id !== a.id);
          return { ...prev, [a.case_id!]: list };
        });
      } else {
        setUnassignedActivities(prev => prev.filter(x => x.id !== a.id));
      }
      if (editingActivity?.id === a.id) setEditingActivity(null);
      loadSummaries();
    } catch (err) {
      alert('Error deleting: ' + (err as Error).message);
    }
  }

  function toggleExpandUnassigned(type: 'document' | 'email' | 'call') {
    const isSame = expandedUnassigned === type;
    setExpandedUnassigned(isSame ? null : type);
  }

  if (loading) {
    return <div className="loading">Loading case reports...</div>;
  }

  if (cases.length === 0) {
    return (
      <div className="empty-state">
        <p>No cases yet.</p>
      </div>
    );
  }

  return (
    <div className="case-reports">
      <div className="case-reports-grid">
        {/* Unassigned Activities Card */}
        <div className="case-report-card">
            <div className="case-report-header">
              <div>
                <h3>Unassigned</h3>
                <p className="client-name" style={{ color: '#f59e0b' }}>Activities not assigned to a case</p>
              </div>
              <div className="total-time">
                <div className="time-value">{unassignedSummary.total_hours > 0 ? formatHours(unassignedSummary.total_hours) : '0.0'}</div>
                <div className="time-label">hours</div>
              </div>
            </div>

            <div className="time-breakdown">
              <BreakdownSection
                type="document"
                icon="📄"
                label="Documents"
                minutes={unassignedSummary.document_minutes}
                totalMinutes={unassignedSummary.total_minutes}
                expanded={expandedUnassigned === 'document'}
                onToggle={() => toggleExpandUnassigned('document')}
                loading={loadingUnassigned}
                activities={unassignedActivities.filter(a => a.type === 'document')}
                getActivityName={getActivityName}
                getActivityIcon={getActivityIcon}
                onEdit={setEditingActivity}
                onDelete={handleDeleteClick}
                cases={cases}
                onAssign={async (activity, caseId) => {
                  try {
                    const updated = await updateActivity(activity.id, { case_id: caseId, status: 'edited' });
                    setUnassignedActivities(prev => prev.filter(a => a.id !== activity.id));
                    handleActivityUpdated(updated);
                    loadSummaries();
                  } catch (err) {
                    alert('Error assigning: ' + (err as Error).message);
                  }
                }}
                isUnassigned={true}
              />
              <BreakdownSection
                type="email"
                icon="📧"
                label="Emails"
                minutes={unassignedSummary.email_minutes}
                totalMinutes={unassignedSummary.total_minutes}
                expanded={expandedUnassigned === 'email'}
                onToggle={() => toggleExpandUnassigned('email')}
                loading={loadingUnassigned}
                activities={unassignedActivities.filter(a => a.type === 'email')}
                getActivityName={getActivityName}
                getActivityIcon={getActivityIcon}
                onEdit={setEditingActivity}
                onDelete={handleDeleteClick}
                cases={cases}
                onAssign={async (activity, caseId) => {
                  try {
                    const updated = await updateActivity(activity.id, { case_id: caseId, status: 'edited' });
                    setUnassignedActivities(prev => prev.filter(a => a.id !== activity.id));
                    handleActivityUpdated(updated);
                    loadSummaries();
                  } catch (err) {
                    alert('Error assigning: ' + (err as Error).message);
                  }
                }}
                isUnassigned={true}
              />
              <BreakdownSection
                type="call"
                icon="📞"
                label="Calls"
                minutes={unassignedSummary.call_minutes}
                totalMinutes={unassignedSummary.total_minutes}
                expanded={expandedUnassigned === 'call'}
                onToggle={() => toggleExpandUnassigned('call')}
                loading={loadingUnassigned}
                activities={unassignedActivities.filter(a => a.type === 'call')}
                getActivityName={getActivityName}
                getActivityIcon={getActivityIcon}
                onEdit={setEditingActivity}
                onDelete={handleDeleteClick}
                cases={cases}
                onAssign={async (activity, caseId) => {
                  try {
                    const updated = await updateActivity(activity.id, { case_id: caseId, status: 'edited' });
                    setUnassignedActivities(prev => prev.filter(a => a.id !== activity.id));
                    handleActivityUpdated(updated);
                    loadSummaries();
                  } catch (err) {
                    alert('Error assigning: ' + (err as Error).message);
                  }
                }}
                isUnassigned={true}
              />
            </div>

            <div className="case-stats">
              <div className="stat">
                <span className="stat-label">Total Activities</span>
                <span className="stat-value">{unassignedSummary.activity_count}</span>
              </div>
            </div>
          </div>

        {/* Case Cards */}
        {cases.map((c) => {
        const summary = summaries[c.id] || {
          total_minutes: 0,
          total_hours: 0,
          document_minutes: 0,
          email_minutes: 0,
          call_minutes: 0,
          activity_count: 0,
        };

        const activities = activitiesByCase[c.id] || [];
        const docs = activities.filter(a => a.type === 'document');
        const emails = activities.filter(a => a.type === 'email');
        const calls = activities.filter(a => a.type === 'call');
        const loadingAct = loadingActivities[c.id];

        return (
          <div key={c.id} className="case-report-card">
            <div className="case-report-header">
              <div>
                <h3>{c.name}</h3>
                {c.client_name && <p className="client-name">Client: {c.client_name}</p>}
              </div>
              <div className="total-time">
                <div className="time-value">{formatHours(summary.total_hours)}</div>
                <div className="time-label">hours</div>
              </div>
            </div>

            <div className="time-breakdown">
              <BreakdownSection
                type="document"
                icon="📄"
                label="Documents"
                minutes={summary.document_minutes}
                totalMinutes={summary.total_minutes}
                expanded={expanded?.caseId === c.id && expanded?.type === 'document'}
                onToggle={() => toggleExpand(c.id, 'document')}
                loading={loadingAct}
                activities={docs}
                getActivityName={getActivityName}
                getActivityIcon={getActivityIcon}
                onEdit={setEditingActivity}
                onDelete={handleDeleteClick}
              />
              <BreakdownSection
                type="email"
                icon="📧"
                label="Emails"
                minutes={summary.email_minutes}
                totalMinutes={summary.total_minutes}
                expanded={expanded?.caseId === c.id && expanded?.type === 'email'}
                onToggle={() => toggleExpand(c.id, 'email')}
                loading={loadingAct}
                activities={emails}
                getActivityName={getActivityName}
                getActivityIcon={getActivityIcon}
                onEdit={setEditingActivity}
                onDelete={handleDeleteClick}
              />
              <BreakdownSection
                type="call"
                icon="📞"
                label="Calls"
                minutes={summary.call_minutes}
                totalMinutes={summary.total_minutes}
                expanded={expanded?.caseId === c.id && expanded?.type === 'call'}
                onToggle={() => toggleExpand(c.id, 'call')}
                loading={loadingAct}
                activities={calls}
                getActivityName={getActivityName}
                getActivityIcon={getActivityIcon}
                onEdit={setEditingActivity}
                onDelete={handleDeleteClick}
              />
            </div>

            <div className="case-stats">
              <div className="stat">
                <span className="stat-label">Total Activities</span>
                <span className="stat-value">{summary.activity_count}</span>
              </div>
            </div>
          </div>
        );
        })}
      </div>

      {deleteConfirm && (
        <DeleteConfirmModal
          activity={deleteConfirm}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {editingActivity && (
        <ActivityEditModal
          activity={editingActivity}
          cases={cases}
          onClose={() => setEditingActivity(null)}
          onSaved={(updated) => {
            setEditingActivity(null);
            if (updated) handleActivityUpdated(updated);
          }}
          onDeleted={() => {
            if (!editingActivity) return;
            const cid = editingActivity.case_id;
            setActivitiesByCase((prev) => {
              const list = (prev[cid!] || []).filter((x) => x.id !== editingActivity.id);
              return { ...prev, [cid!]: list };
            });
            setEditingActivity(null);
            loadSummaries();
          }}
        />
      )}
    </div>
  );
}

interface BreakdownSectionProps {
  type: 'document' | 'email' | 'call';
  icon: string;
  label: string;
  minutes: number;
  totalMinutes: number;
  expanded: boolean;
  onToggle: () => void;
  loading: boolean;
  activities: Activity[];
  getActivityName: (a: Activity) => string;
  getActivityIcon: (t: string) => string;
  onEdit: (a: Activity) => void;
  onDelete: (a: Activity) => void;
  cases?: Case[];
  onAssign?: (activity: Activity, caseId: number) => void;
  isUnassigned?: boolean;
}

function BreakdownSection({
  type,
  icon,
  label,
  minutes,
  totalMinutes,
  expanded,
  onToggle,
  loading,
  activities,
  getActivityName,
  getActivityIcon,
  onEdit,
  onDelete,
  cases,
  onAssign,
  isUnassigned,
}: BreakdownSectionProps) {
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const pct = totalMinutes === 0 ? 0 : Math.round((minutes / totalMinutes) * 100);
  const fillClass = type === 'document' ? 'document' : type === 'email' ? 'email' : 'call';

  async function handleAssign(activity: Activity, caseId: number) {
    if (!onAssign) return;
    setAssigningId(activity.id);
    try {
      await onAssign(activity, caseId);
    } finally {
      setAssigningId(null);
    }
  }

  return (
    <div className="breakdown-item">
      <div
        className="breakdown-header clickable"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onToggle()}
      >
        <span className="breakdown-icon">{icon}</span>
        <span className="breakdown-label">{label}</span>
        <span className="breakdown-value">{(minutes / 60).toFixed(1)}h</span>
        <span className="breakdown-chevron">{expanded ? '▾' : '▸'}</span>
      </div>
      <div className="breakdown-bar">
        <div className={`breakdown-fill ${fillClass}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="breakdown-percent">{pct}%</div>

      {expanded && (
        <div className="breakdown-dropdown">
          {loading ? (
            <div className="breakdown-loading">Loading…</div>
          ) : activities.length === 0 ? (
            <div className="breakdown-empty">No activities</div>
          ) : (
            <ul className="breakdown-activity-list">
              {activities.map((a) => {
                const start = new Date(a.start_time);
                const end = new Date(a.end_time);
                return (
                  <li key={a.id} className="breakdown-activity-item">
                    <span className="breakdown-act-icon">{getActivityIcon(a.type)}</span>
                    <div className="breakdown-act-main">
                      <span className="breakdown-act-name">{getActivityName(a)}</span>
                      <span className="breakdown-act-time">
                        {start.toLocaleDateString()}{' '}
                        {start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} –{' '}
                        {end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} ({a.duration_minutes}m)
                      </span>
                    </div>
                    <div className="breakdown-act-actions">
                      {isUnassigned && cases && cases.length > 0 && (
                        <select
                          onChange={(e) => {
                            const caseId = parseInt(e.target.value, 10);
                            if (caseId) handleAssign(a, caseId);
                          }}
                          disabled={assigningId === a.id}
                          style={{ padding: '4px 8px', fontSize: 12, marginRight: 8, border: '1px solid #e5e7eb', borderRadius: 4 }}
                          defaultValue=""
                        >
                          <option value="">Assign to...</option>
                          {cases.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      )}
                      <button type="button" className="breakdown-btn-edit" onClick={() => onEdit(a)}>
                        Edit
                      </button>
                      <button type="button" className="breakdown-btn-delete" onClick={() => onDelete(a)}>
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

interface ActivityEditModalProps {
  activity: Activity;
  cases: Case[];
  onClose: () => void;
  onSaved: (updated?: Activity) => void;
  onDeleted: () => void;
}

function ActivityEditModal({ activity, cases, onClose, onSaved, onDeleted }: ActivityEditModalProps) {
  const [type, setType] = useState<ActivityType>(activity.type);
  const [startDate, setStartDate] = useState(() => toYMD(new Date(activity.start_time)));
  const [startTime, setStartTime] = useState(() => {
    const s = new Date(activity.start_time);
    return `${s.getHours().toString().padStart(2, '0')}:${s.getMinutes().toString().padStart(2, '0')}`;
  });
  const [endTime, setEndTime] = useState(() => {
    const e = new Date(activity.end_time);
    return `${e.getHours().toString().padStart(2, '0')}:${e.getMinutes().toString().padStart(2, '0')}`;
  });
  const [name, setName] = useState(
    () => activity.document_name || activity.email_subject || activity.contact_name || ''
  );
  const [description, setDescription] = useState(activity.description ?? '');
  const [caseId, setCaseId] = useState(activity.case_id?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  function parseLocalDT(dateStr: string, timeStr: string): Date {
    const [y, mo, d] = dateStr.split('-').map(Number);
    const [h, mi] = timeStr.split(':').map(Number);
    return new Date(y, mo - 1, d, h, mi, 0, 0);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const start = parseLocalDT(startDate, startTime);
      const end = parseLocalDT(startDate, endTime);
      if (end.getTime() <= start.getTime()) {
        alert('End time must be after start time');
        setSaving(false);
        return;
      }
      const up: Record<string, unknown> = {
        type,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        description: description || undefined,
        case_id: caseId ? parseInt(caseId, 10) : null,
        status: 'edited',
      };
      if (type === 'document') up.document_name = name || undefined;
      else if (type === 'email') up.email_subject = name || undefined;
      else if (type === 'call') up.contact_name = name || undefined;
      const updated = await updateActivity(activity.id, up);
      onSaved(updated);
    } catch (err) {
      alert('Error saving: ' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirm() {
    try {
      await deleteActivity(activity.id);
      setShowDeleteConfirm(false);
      onDeleted();
    } catch (err) {
      alert('Error deleting: ' + (err as Error).message);
    }
  }

  return (
    <div className="ts-modal-overlay" onClick={onClose}>
      <div className="ts-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Edit activity</h3>
        <form onSubmit={handleSubmit}>
          <div className="ts-form-row">
            <label>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as ActivityType)}>
              <option value="document">📄 Document</option>
              <option value="email">📧 Email</option>
              <option value="call">📞 Call</option>
            </select>
          </div>
          <div className="ts-form-row">
            <label>Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <div className="ts-form-row ts-form-row-2">
            <div>
              <label>Start</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
            </div>
            <div>
              <label>End</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
            </div>
          </div>
          <div className="ts-form-row">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === 'document' ? 'Document name' : type === 'email' ? 'Subject' : 'Contact name'}
            />
          </div>
          <div className="ts-form-row">
            <label>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="ts-form-row">
            <label>Case</label>
            <select value={caseId} onChange={(e) => setCaseId(e.target.value)}>
              <option value="">—</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="ts-form-actions">
            <button type="button" className="ts-btn-delete" onClick={() => setShowDeleteConfirm(true)}>
              Delete
            </button>
            <div className="ts-form-actions-right">
              <button type="button" className="ts-btn-cancel" onClick={onClose}>Cancel</button>
              <button type="submit" className="ts-btn-save" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </form>
        {showDeleteConfirm && (
          <DeleteConfirmModal
            activity={activity}
            onConfirm={handleDeleteConfirm}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        )}
      </div>
    </div>
  );
}

interface DeleteConfirmModalProps {
  activity: Activity;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmModal({ activity, onConfirm, onCancel }: DeleteConfirmModalProps) {
  function getActivityName(a: Activity) {
    return a.document_name || a.email_subject || a.contact_name || a.description || 'Activity';
  }

  return (
    <div className="ts-modal-overlay" onClick={onCancel} style={{ zIndex: 1001 }}>
      <div className="ts-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <h3 style={{ marginBottom: 16 }}>Delete Activity?</h3>
        <p style={{ marginBottom: 24, color: '#6b7280' }}>
          Are you sure you want to delete "{getActivityName(activity)}"? This action cannot be undone.
        </p>
        <div className="ts-form-actions">
          <button type="button" className="ts-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="ts-btn-delete" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

interface UnassignedActivitiesProps {
  attorneyId: number;
  cases: Case[];
  onActivityAssigned: (activity: Activity) => void;
  onEdit: (activity: Activity) => void;
  onDelete: (activity: Activity) => void;
}

function UnassignedActivities({ attorneyId, cases, onActivityAssigned, onEdit, onDelete }: UnassignedActivitiesProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningId, setAssigningId] = useState<number | null>(null);

  useEffect(() => {
    loadUnassigned();
  }, []);

  async function loadUnassigned() {
    setLoading(true);
    try {
      const list = await fetchActivities({ attorney_id: attorneyId, unassigned: true });
      setActivities(list);
    } catch (error) {
      console.error('Failed to load unassigned activities:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAssign(activity: Activity, caseId: number) {
    setAssigningId(activity.id);
    try {
      const updated = await updateActivity(activity.id, { case_id: caseId, status: 'edited' });
      setActivities(prev => prev.filter(a => a.id !== activity.id));
      onActivityAssigned(updated);
    } catch (err) {
      alert('Error assigning: ' + (err as Error).message);
    } finally {
      setAssigningId(null);
    }
  }

  function getActivityName(a: Activity) {
    return a.document_name || a.email_subject || a.contact_name || a.description || 'Activity';
  }

  function getActivityIcon(t: string) {
    switch (t) {
      case 'document': return '📄';
      case 'email': return '📧';
      case 'call': return '📞';
      default: return '📋';
    }
  }

  if (loading) {
    return <div className="loading">Loading unassigned activities...</div>;
  }

  if (activities.length === 0) {
    return (
      <div className="empty-state">
        <p>No unassigned activities.</p>
      </div>
    );
  }

  return (
    <div className="unassigned-activities">
      <div style={{ marginBottom: 16, padding: 16, background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 8 }}>
        <strong>Unassigned Activities ({activities.length})</strong>
        <p style={{ margin: '8px 0 0 0', fontSize: 14, color: '#92400e' }}>
          Assign these activities to cases to track time properly.
        </p>
      </div>

      <ul className="breakdown-activity-list">
        {activities.map((a) => (
          <UnassignedActivityItem
            key={a.id}
            activity={a}
            cases={cases}
            assigningId={assigningId}
            onAssign={handleAssign}
            onEdit={onEdit}
            onDelete={onDelete}
            getActivityName={getActivityName}
            getActivityIcon={getActivityIcon}
          />
        ))}
      </ul>
    </div>
  );
}

interface UnassignedActivityItemProps {
  activity: Activity;
  cases: Case[];
  assigningId: number | null;
  onAssign: (activity: Activity, caseId: number) => void;
  onEdit: (activity: Activity) => void;
  onDelete: (activity: Activity) => void;
  getActivityName: (a: Activity) => string;
  getActivityIcon: (t: string) => string;
}

function UnassignedActivityItem({
  activity,
  cases,
  assigningId,
  onAssign,
  onEdit,
  onDelete,
  getActivityName,
  getActivityIcon,
}: UnassignedActivityItemProps) {
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const start = new Date(activity.start_time);
  const end = new Date(activity.end_time);

  return (
    <li className="breakdown-activity-item">
      <span className="breakdown-act-icon">{getActivityIcon(activity.type)}</span>
      <div className="breakdown-act-main" style={{ flex: 1 }}>
        <span className="breakdown-act-name">{getActivityName(activity)}</span>
        <span className="breakdown-act-time">
          {start.toLocaleDateString()}{' '}
          {start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} –{' '}
          {end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} ({activity.duration_minutes}m)
        </span>
        {activity.description && (
          <span style={{ display: 'block', fontSize: 12, color: '#6b7280', marginTop: 4 }}>
            {activity.description}
          </span>
        )}
      </div>
      <div className="breakdown-act-actions" style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
        <select
          value={selectedCaseId}
          onChange={(e) => setSelectedCaseId(e.target.value)}
          style={{ padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13 }}
          disabled={assigningId === activity.id}
        >
          <option value="">Select case...</option>
          {cases.map((c) => (
            <option key={c.id} value={c.id.toString()}>{c.name}</option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            className="breakdown-btn-edit"
            onClick={() => onAssign(activity, parseInt(selectedCaseId, 10))}
            disabled={!selectedCaseId || assigningId === activity.id}
            style={{ fontSize: 12, padding: '4px 8px' }}
          >
            {assigningId === activity.id ? 'Assigning...' : 'Assign'}
          </button>
          <button type="button" className="breakdown-btn-edit" onClick={() => onEdit(activity)} style={{ fontSize: 12, padding: '4px 8px' }}>
            Edit
          </button>
          <button type="button" className="breakdown-btn-delete" onClick={() => onDelete(activity)} style={{ fontSize: 12, padding: '4px 8px' }}>
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}

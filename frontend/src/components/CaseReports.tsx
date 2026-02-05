import { useState, useEffect, useCallback } from 'react';
import type { Case, CaseTimeSummary, Activity, ActivityType } from '../types';
import {
  fetchCaseTimeSummary,
  fetchActivities,
  updateActivity,
  deleteActivity,
  createCase,
} from '../api';
import { buildAndDownloadInvoicePdf } from '../utils/invoicePdf';

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface CaseReportsProps {
  attorneyId: number;
  cases: Case[];
  onCaseAdded?: () => void;
}

type ExpandKey = { caseId: number; type: 'document' | 'email' | 'call' };

export default function CaseReports({ attorneyId, cases, onCaseAdded }: CaseReportsProps) {
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
  const [showAddCase, setShowAddCase] = useState(false);
  const [newCaseName, setNewCaseName] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [creatingCase, setCreatingCase] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportCaseId, setExportCaseId] = useState<number | ''>('');
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [exportLoading, setExportLoading] = useState(false);

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

  async function handleExportInvoicePdf() {
    if (exportCaseId === '' || !exportStartDate || !exportEndDate) {
      alert('Please select a case and date range.');
      return;
    }
    const c = cases.find(x => x.id === exportCaseId);
    if (!c) return;
    setExportLoading(true);
    try {
      const activities = await fetchActivities({
        attorney_id: attorneyId,
        case_id: exportCaseId as number,
        start_date: exportStartDate,
        end_date: exportEndDate,
      });
      buildAndDownloadInvoicePdf(c, activities, exportStartDate, exportEndDate);
      setShowExportModal(false);
    } catch (err) {
      alert('Failed to load activities: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setExportLoading(false);
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

    // Update activities in state
    if (oldCaseId == null && newCaseId != null) {
      // Moving from unassigned to a case
      setUnassignedActivities(prev => prev.filter(a => a.id !== updated.id));
    }
    
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

    // Update summaries locally without reloading
    if (oldCaseId !== newCaseId) {
      // Activity moved between cases or to/from unassigned
      if (oldCaseId != null) {
        // Removing from old case
        setSummaries(prev => {
          const oldSummary = prev[oldCaseId];
          if (oldSummary) {
            const newSummary = { ...oldSummary };
            newSummary.total_minutes -= updated.duration_minutes;
            newSummary.total_hours = newSummary.total_minutes / 60;
            newSummary.activity_count -= 1;
            if (updated.type === 'document') newSummary.document_minutes -= updated.duration_minutes;
            else if (updated.type === 'email') newSummary.email_minutes -= updated.duration_minutes;
            else if (updated.type === 'call') newSummary.call_minutes -= updated.duration_minutes;
            return { ...prev, [oldCaseId]: newSummary };
          }
          return prev;
        });
      } else {
        // Removing from unassigned
        setUnassignedSummary(prev => ({
          ...prev,
          total_minutes: prev.total_minutes - updated.duration_minutes,
          total_hours: (prev.total_minutes - updated.duration_minutes) / 60,
          activity_count: prev.activity_count - 1,
          document_minutes: updated.type === 'document' ? prev.document_minutes - updated.duration_minutes : prev.document_minutes,
          email_minutes: updated.type === 'email' ? prev.email_minutes - updated.duration_minutes : prev.email_minutes,
          call_minutes: updated.type === 'call' ? prev.call_minutes - updated.duration_minutes : prev.call_minutes,
        }));
      }
      
      if (newCaseId != null) {
        // Adding to new case
        setSummaries(prev => {
          const newSummary = prev[newCaseId];
          if (newSummary) {
            const updatedSummary = { ...newSummary };
            updatedSummary.total_minutes += updated.duration_minutes;
            updatedSummary.total_hours = updatedSummary.total_minutes / 60;
            updatedSummary.activity_count += 1;
            if (updated.type === 'document') updatedSummary.document_minutes += updated.duration_minutes;
            else if (updated.type === 'email') updatedSummary.email_minutes += updated.duration_minutes;
            else if (updated.type === 'call') updatedSummary.call_minutes += updated.duration_minutes;
            return { ...prev, [newCaseId]: updatedSummary };
          }
          return prev;
        });
      } else {
        // Moved to unassigned
        setUnassignedSummary(prev => ({
          ...prev,
          total_minutes: prev.total_minutes + updated.duration_minutes,
          total_hours: (prev.total_minutes + updated.duration_minutes) / 60,
          activity_count: prev.activity_count + 1,
          document_minutes: updated.type === 'document' ? prev.document_minutes + updated.duration_minutes : prev.document_minutes,
          email_minutes: updated.type === 'email' ? prev.email_minutes + updated.duration_minutes : prev.email_minutes,
          call_minutes: updated.type === 'call' ? prev.call_minutes + updated.duration_minutes : prev.call_minutes,
        }));
        setUnassignedActivities(prev => [...prev, updated]);
      }
    } else if (newCaseId != null) {
      // Activity updated within same case - update summary
      setSummaries(prev => {
        const summary = prev[newCaseId];
        if (summary) {
          // Find old activity to calculate difference
          const oldActivity = activitiesByCase[newCaseId]?.find(a => a.id === updated.id);
          if (oldActivity) {
            const durationDiff = updated.duration_minutes - oldActivity.duration_minutes;
            const typeChanged = oldActivity.type !== updated.type;
            
            const newSummary = { ...summary };
            newSummary.total_minutes += durationDiff;
            newSummary.total_hours = newSummary.total_minutes / 60;
            
            if (typeChanged) {
              // Remove old type minutes, add new type minutes
              if (oldActivity.type === 'document') newSummary.document_minutes -= oldActivity.duration_minutes;
              else if (oldActivity.type === 'email') newSummary.email_minutes -= oldActivity.duration_minutes;
              else if (oldActivity.type === 'call') newSummary.call_minutes -= oldActivity.duration_minutes;
              
              if (updated.type === 'document') newSummary.document_minutes += updated.duration_minutes;
              else if (updated.type === 'email') newSummary.email_minutes += updated.duration_minutes;
              else if (updated.type === 'call') newSummary.call_minutes += updated.duration_minutes;
            } else {
              // Same type, just update minutes
              if (updated.type === 'document') newSummary.document_minutes += durationDiff;
              else if (updated.type === 'email') newSummary.email_minutes += durationDiff;
              else if (updated.type === 'call') newSummary.call_minutes += durationDiff;
            }
            
            return { ...prev, [newCaseId]: newSummary };
          }
        }
        return prev;
      });
    }
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
      
      // Update activities in state
      if (a.case_id) {
        setActivitiesByCase(prev => {
          const list = (prev[a.case_id!] || []).filter(x => x.id !== a.id);
          return { ...prev, [a.case_id!]: list };
        });
        
        // Update summary locally
        setSummaries(prev => {
          const summary = prev[a.case_id!];
          if (summary) {
            const newSummary = { ...summary };
            newSummary.total_minutes -= a.duration_minutes;
            newSummary.total_hours = newSummary.total_minutes / 60;
            newSummary.activity_count -= 1;
            if (a.type === 'document') newSummary.document_minutes -= a.duration_minutes;
            else if (a.type === 'email') newSummary.email_minutes -= a.duration_minutes;
            else if (a.type === 'call') newSummary.call_minutes -= a.duration_minutes;
            return { ...prev, [a.case_id!]: newSummary };
          }
          return prev;
        });
      } else {
        setUnassignedActivities(prev => prev.filter(x => x.id !== a.id));
        
        // Update unassigned summary locally
        setUnassignedSummary(prev => ({
          ...prev,
          total_minutes: prev.total_minutes - a.duration_minutes,
          total_hours: (prev.total_minutes - a.duration_minutes) / 60,
          activity_count: prev.activity_count - 1,
          document_minutes: a.type === 'document' ? prev.document_minutes - a.duration_minutes : prev.document_minutes,
          email_minutes: a.type === 'email' ? prev.email_minutes - a.duration_minutes : prev.email_minutes,
          call_minutes: a.type === 'call' ? prev.call_minutes - a.duration_minutes : prev.call_minutes,
        }));
      }
      
      if (editingActivity?.id === a.id) setEditingActivity(null);
    } catch (err) {
      alert('Error deleting: ' + (err as Error).message);
    }
  }

  function toggleExpandUnassigned(type: 'document' | 'email' | 'call') {
    const isSame = expandedUnassigned === type;
    setExpandedUnassigned(isSame ? null : type);
  }

  async function handleCreateCase(e: React.FormEvent) {
    e.preventDefault();
    if (!newCaseName.trim()) {
      alert('Please enter a case name');
      return;
    }
    setCreatingCase(true);
    try {
      await createCase({
        name: newCaseName.trim(),
        client_name: newClientName.trim() || undefined,
        attorney_id: attorneyId,
      });
      setNewCaseName('');
      setNewClientName('');
      setShowAddCase(false);
      if (onCaseAdded) {
        onCaseAdded();
      }
      // Reload summaries to include the new case (only when creating a new case)
      loadSummaries();
    } catch (err) {
      alert('Error creating case: ' + (err as Error).message);
    } finally {
      setCreatingCase(false);
    }
  }

  if (loading) {
    return <div className="loading">Loading case reports...</div>;
  }

  if (cases.length === 0 && !showAddCase) {
    return (
      <div className="empty-state">
        <p>No cases yet.</p>
        <button onClick={() => setShowAddCase(true)} className="add-case-btn" style={{ marginTop: 16 }}>
          + Add Case
        </button>
      </div>
    );
  }

  if (cases.length === 0 && showAddCase) {
    return (
      <div className="case-reports">
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <form onSubmit={handleCreateCase} style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, maxWidth: 600 }}>
            <input
              type="text"
              value={newCaseName}
              onChange={(e) => setNewCaseName(e.target.value)}
              placeholder="Case name *"
              required
              style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 6, flex: 1 }}
            />
            <input
              type="text"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              placeholder="Client name"
              style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 6, flex: 1 }}
            />
            <button type="submit" className="submit-btn" disabled={creatingCase} style={{ padding: '8px 16px' }}>
              {creatingCase ? 'Creating...' : 'Create'}
            </button>
            <button type="button" onClick={() => { setShowAddCase(false); setNewCaseName(''); setNewClientName(''); }} className="cancel-btn" style={{ padding: '8px 16px' }}>
              Cancel
            </button>
          </form>
        </div>
        <div className="reports-empty-state">
          <p className="reports-empty-title">No cases yet</p>
          <p className="reports-empty-desc">Create a case above or add time on the Timesheet to see reports here.</p>
        </div>
      </div>
    );
  }

  const totalActivityCount = cases.reduce((sum, c) => sum + (summaries[c.id]?.activity_count ?? 0), 0) + unassignedSummary.activity_count;
  const showNoTimeHint = cases.length > 0 && totalActivityCount === 0 && !loading;

  return (
    <div className="case-reports">
      <div className="reports-toolbar">
        {showNoTimeHint && (
          <p className="reports-no-time-hint">No time logged yet. Add time on the Timesheet or create rules to auto-assign.</p>
        )}
        <div className="reports-toolbar-actions">
          {!showAddCase ? (
            <button onClick={() => setShowAddCase(true)} className="add-case-btn">
              + Add Case
            </button>
          ) : (
          <form onSubmit={handleCreateCase} style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, maxWidth: 600 }}>
            <input
              type="text"
              value={newCaseName}
              onChange={(e) => setNewCaseName(e.target.value)}
              placeholder="Case name *"
              required
              style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 6, flex: 1 }}
            />
            <input
              type="text"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              placeholder="Client name"
              style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 6, flex: 1 }}
            />
            <button type="submit" className="submit-btn" disabled={creatingCase} style={{ padding: '8px 16px' }}>
              {creatingCase ? 'Creating...' : 'Create'}
            </button>
            <button type="button" onClick={() => { setShowAddCase(false); setNewCaseName(''); setNewClientName(''); }} className="cancel-btn" style={{ padding: '8px 16px' }}>
              Cancel
            </button>
          </form>
          )}
          <button type="button" onClick={() => setShowExportModal(true)} className="btn-secondary reports-export-btn">
            Export Invoice PDF
          </button>
        </div>
      </div>
      <div className="case-reports-grid">
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
              {summary.activity_count === 0 && (
                <p className="case-card-empty-hint">No time logged yet for this case.</p>
              )}
            </div>
          </div>
        );
        })}

        {/* Unassigned Activities Card - total derived from category counts so it always matches Documents + Emails + Calls */}
        {(() => {
          const unassignedDocCount = unassignedActivities.filter(a => a.type === 'document').length;
          const unassignedEmailCount = unassignedActivities.filter(a => a.type === 'email').length;
          const unassignedCallCount = unassignedActivities.filter(a => a.type === 'call').length;
          const unassignedTotalCount = unassignedDocCount + unassignedEmailCount + unassignedCallCount;
          return (
        <div className="case-report-card">
          <div className="case-report-header">
            <div>
              <h3>Unassigned</h3>
              <p className="client-name" style={{ color: '#f59e0b' }}>Activities not assigned to a case</p>
            </div>
            <div className="total-time">
              <div className="time-value">{unassignedTotalCount}</div>
              <div className="time-label">unassigned</div>
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
                } catch (err) {
                  alert('Error assigning: ' + (err as Error).message);
                }
              }}
              isUnassigned={true}
              displayCount={unassignedDocCount}
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
                } catch (err) {
                  alert('Error assigning: ' + (err as Error).message);
                }
              }}
              isUnassigned={true}
              displayCount={unassignedEmailCount}
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
                } catch (err) {
                  alert('Error assigning: ' + (err as Error).message);
                }
              }}
              isUnassigned={true}
              displayCount={unassignedCallCount}
            />
          </div>

          <div className="case-stats">
            <div className="stat">
              <span className="stat-label">Total Activities</span>
              <span className="stat-value">{unassignedTotalCount}</span>
            </div>
            {unassignedTotalCount === 0 && (
              <p className="case-card-empty-hint">No unassigned activities.</p>
            )}
          </div>
        </div>
          );
        })()}
      </div>

      {deleteConfirm && (
        <DeleteConfirmModal
          activity={deleteConfirm}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {showExportModal && (
        <div className="agent-quit-modal-overlay" onClick={() => setShowExportModal(false)} role="presentation">
          <div className="agent-quit-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="export-invoice-title">
            <h3 id="export-invoice-title">Export Invoice PDF</h3>
            <p style={{ marginBottom: 16 }}>Select a case and date range. The PDF will list activities with template descriptions only (no content).</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span>Case</span>
                <select
                  value={exportCaseId}
                  onChange={(e) => setExportCaseId(e.target.value === '' ? '' : Number(e.target.value))}
                  style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 6 }}
                >
                  <option value="">Select case</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.client_name ? ` (${c.client_name})` : ''}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span>Start date</span>
                <input
                  type="date"
                  value={exportStartDate}
                  onChange={(e) => setExportStartDate(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 6 }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span>End date</span>
                <input
                  type="date"
                  value={exportEndDate}
                  onChange={(e) => setExportEndDate(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 6 }}
                />
              </label>
            </div>
            <div className="agent-quit-modal-actions">
              <button type="button" className="agent-quit-done-btn" onClick={() => setShowExportModal(false)}>
                Cancel
              </button>
              <button type="button" className="agent-quit-gotit-btn" onClick={handleExportInvoicePdf} disabled={exportLoading}>
                {exportLoading ? 'Loading…' : 'Download PDF'}
              </button>
            </div>
          </div>
        </div>
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
            const a = editingActivity;
            const cid = a.case_id;
            
            // Update activities in state
            if (cid) {
              setActivitiesByCase((prev) => {
                const list = (prev[cid] || []).filter((x) => x.id !== a.id);
                return { ...prev, [cid]: list };
              });
              
              // Update summary locally
              setSummaries(prev => {
                const summary = prev[cid];
                if (summary) {
                  const newSummary = { ...summary };
                  newSummary.total_minutes -= a.duration_minutes;
                  newSummary.total_hours = newSummary.total_minutes / 60;
                  newSummary.activity_count -= 1;
                  if (a.type === 'document') newSummary.document_minutes -= a.duration_minutes;
                  else if (a.type === 'email') newSummary.email_minutes -= a.duration_minutes;
                  else if (a.type === 'call') newSummary.call_minutes -= a.duration_minutes;
                  return { ...prev, [cid]: newSummary };
                }
                return prev;
              });
            } else {
              // Unassigned activity
              setUnassignedActivities(prev => prev.filter(x => x.id !== a.id));
              setUnassignedSummary(prev => ({
                ...prev,
                total_minutes: prev.total_minutes - a.duration_minutes,
                total_hours: (prev.total_minutes - a.duration_minutes) / 60,
                activity_count: prev.activity_count - 1,
                document_minutes: a.type === 'document' ? prev.document_minutes - a.duration_minutes : prev.document_minutes,
                email_minutes: a.type === 'email' ? prev.email_minutes - a.duration_minutes : prev.email_minutes,
                call_minutes: a.type === 'call' ? prev.call_minutes - a.duration_minutes : prev.call_minutes,
              }));
            }
            
            setEditingActivity(null);
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
  /** When set (e.g. for unassigned card), show this count instead of hours in the section header */
  displayCount?: number;
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
  displayCount,
}: BreakdownSectionProps) {
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const pct = totalMinutes === 0 ? 0 : Math.round((minutes / totalMinutes) * 100);
  const fillClass = type === 'document' ? 'document' : type === 'email' ? 'email' : 'call';
  const totalCount = displayCount ?? 0;
  const showCount = displayCount !== undefined;

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
        <span className="breakdown-value">
          {showCount ? totalCount : `${(minutes / 60).toFixed(1)}h`}
        </span>
        <span className="breakdown-chevron">{expanded ? '▾' : '▸'}</span>
      </div>
      {!showCount && (
        <>
          <div className="breakdown-bar">
            <div className={`breakdown-fill ${fillClass}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="breakdown-percent">{pct}%</div>
        </>
      )}

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

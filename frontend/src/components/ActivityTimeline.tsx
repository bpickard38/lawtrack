import { useState } from 'react';
import type { Activity, Case } from '../types';
import { assignActivityToCase, deleteActivity } from '../api';
import EditActivityForm from './EditActivityForm';

interface ActivityTimelineProps {
  activities: Activity[];
  cases: Case[];
  onActivityUpdated: () => void;
}

export default function ActivityTimeline({ activities, cases, onActivityUpdated }: ActivityTimelineProps) {
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Check if it's today
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }
    
    // Check if it's yesterday
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    
    // Otherwise show the date
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'document': return '📄';
      case 'email': return '📧';
      case 'call': return '📞';
      default: return '📋';
    }
  };

  const getActivityDetails = (activity: Activity) => {
    if (activity.type === 'document') {
      return activity.document_name || 'Document';
    } else if (activity.type === 'email') {
      return activity.email_subject || `Email: ${activity.email_from} → ${activity.email_to}`;
    } else if (activity.type === 'call') {
      return `Call: ${activity.contact_name || activity.phone_number || 'Unknown'}`;
    }
    return activity.description || 'Activity';
  };

  const handleAssign = async (activityId: number, caseId: string) => {
    if (!caseId) return;
    
    try {
      await assignActivityToCase(activityId, parseInt(caseId));
      setAssigningId(null);
      onActivityUpdated();
    } catch (error) {
      alert('Error assigning activity: ' + (error as Error).message);
    }
  };

  const handleDelete = async (activityId: number) => {
    if (!confirm('Are you sure you want to delete this activity? This cannot be undone.')) return;
    
    try {
      await deleteActivity(activityId);
      onActivityUpdated();
    } catch (error) {
      alert('Error deleting activity: ' + (error as Error).message);
    }
  };

  const handleEdit = (activity: Activity) => {
    setEditingActivity(activity);
  };

  const handleEditClose = () => {
    setEditingActivity(null);
  };

  const handleEditSaved = () => {
    onActivityUpdated();
  };

  const getCaseName = (caseId: number | null) => {
    if (!caseId) return null;
    const c = cases.find(c => c.id === caseId);
    return c?.name;
  };

  if (activities.length === 0) {
    return (
      <div className="empty-state">
        <p>No activities found for the selected date range.</p>
        <p className="help-text">Try selecting a different date range or add new activities.</p>
      </div>
    );
  }

  return (
    <>
      <div className="timeline">
        {activities.map((activity) => (
          <div key={activity.id} className={`timeline-item ${activity.case_id ? 'assigned' : 'unassigned'}`}>
            <div className="timeline-time">
              <div className="time-date">{formatDate(activity.start_time)}</div>
              <div className="time-range">
                {formatTime(activity.start_time)} - {formatTime(activity.end_time)}
              </div>
              <div className="duration">{formatDuration(activity.duration_minutes)}</div>
            </div>

            <div className="timeline-content">
              <div className="activity-header">
                <span className="activity-icon">{getActivityIcon(activity.type)}</span>
                <span className="activity-title">{getActivityDetails(activity)}</span>
                <div className="activity-actions">
                  <button 
                    onClick={() => handleEdit(activity)} 
                    className="edit-activity-btn"
                    title="Edit activity"
                  >
                    ✏️
                  </button>
                  <button 
                    onClick={() => handleDelete(activity.id)} 
                    className="delete-activity-btn"
                    title="Delete activity"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {activity.type === 'email' && (activity.email_from || activity.email_to) && (
                <div className="activity-meta">
                  {activity.email_from && <span>From: {activity.email_from}</span>}
                  {activity.email_to && <span>To: {activity.email_to}</span>}
                </div>
              )}

              {activity.description && (
                <div className="activity-description">{activity.description}</div>
              )}

              <div className="activity-footer">
                {activity.case_id ? (
                  <div className="case-badge">
                    ✓ {getCaseName(activity.case_id)}
                  </div>
                ) : (
                  <div className="assign-controls">
                    {assigningId === activity.id ? (
                      <>
                        <select
                          onChange={(e) => handleAssign(activity.id, e.target.value)}
                          defaultValue=""
                          className="case-select"
                        >
                          <option value="">Select case...</option>
                          {cases.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <button onClick={() => setAssigningId(null)} className="cancel-assign-btn">
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setAssigningId(activity.id)} className="assign-btn">
                        Assign to Case
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {editingActivity && (
        <EditActivityForm
          activity={editingActivity}
          cases={cases}
          onClose={handleEditClose}
          onSaved={handleEditSaved}
        />
      )}
    </>
  );
}
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Activity, Case, ActivityType } from '../types';
import {
  fetchActivities,
  createActivity,
  updateActivity,
  deleteActivity,
  createCase,
} from '../api';

const SLOT_MINUTES = 30;
const GRID_START_HOUR = 6;
const GRID_END_HOUR = 22;
const SLOTS_PER_HOUR = 60 / SLOT_MINUTES;
const ROW_HEIGHT = 48;

interface TimesheetProps {
  attorneyId: number;
  cases: Case[];
  onCaseAdded: () => void;
}

type AddActivityPayload = { day: Date; slotIndex: number } | null;
type EditActivityPayload = Activity | null;

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function slotToTime(slotIndex: number): { h: number; m: number } {
  const totalMin = slotIndex * SLOT_MINUTES;
  const h = GRID_START_HOUR + Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return { h, m };
}

function slotToDate(day: Date, slotIndex: number): Date {
  const { h, m } = slotToTime(slotIndex);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
}

/** Parse API datetime as UTC so display (local) matches what we sent. Append Z if no tz. */
function parseUTC(s: string): Date {
  const t = s.trim();
  if (!/Z$|[-+]\d{2}:?\d{2}$/.test(t) && t.includes('T')) return new Date(t + 'Z');
  return new Date(t);
}


export default function Timesheet({ attorneyId, cases, onCaseAdded }: TimesheetProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [addAt, setAddAt] = useState<AddActivityPayload>(null);
  const [editActivity, setEditActivity] = useState<EditActivityPayload>(null);
  const [showAddCase, setShowAddCase] = useState(false);
  const [draggingActivity, setDraggingActivity] = useState<Activity | null>(null);
  const [dropTarget, setDropTarget] = useState<{ dayIndex: number; slotIndex: number } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number } | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [didDrag, setDidDrag] = useState(false);
  const dragRef = useRef<{ activity: Activity; startX: number; startY: number; didMove: boolean } | null>(null);
  const dropTargetRef = useRef<{ dayIndex: number; slotIndex: number } | null>(null);

  const { weekStart, weekEnd, days, slotCount } = useMemo(() => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay() + weekOffset * 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    const daysArr: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      daysArr.push(d);
    }
    const slots = (GRID_END_HOUR - GRID_START_HOUR) * SLOTS_PER_HOUR;
    return { weekStart: start, weekEnd: end, days: daysArr, slotCount: slots };
  }, [weekOffset]);

  const loadActivities = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchActivities({
        attorney_id: attorneyId,
        start_date: toYMD(weekStart),
        end_date: toYMD(weekEnd),
      });
      setActivities(data);
    } catch (e) {
      console.error('Failed to load activities:', e);
    } finally {
      setLoading(false);
    }
  }, [attorneyId, weekStart, weekEnd]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  useEffect(() => {
    if (!draggingActivity || dragStart == null) return;
    const activity = draggingActivity;
    const startX = dragStart.x;
    const startY = dragStart.y;
    dragRef.current = { activity, startX, startY, didMove: false };
    dropTargetRef.current = null;

    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      setDragPreview({ x: e.clientX, y: e.clientY });
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (dx * dx + dy * dy > 25 && dragRef.current) {
        setDidDrag(true);
        dragRef.current.didMove = true;
      }
      const els = document.elementsFromPoint(e.clientX, e.clientY);
      const cell = els.find(el => el instanceof HTMLElement && el.classList?.contains('ts-cell'));
      if (cell instanceof HTMLElement) {
        const di = cell.getAttribute('data-day-index');
        const si = cell.getAttribute('data-slot');
        if (di != null && si != null) {
          const next = { dayIndex: +di, slotIndex: +si };
          dropTargetRef.current = next;
          setDropTarget(next);
        } else {
          dropTargetRef.current = null;
          setDropTarget(null);
        }
      } else {
        dropTargetRef.current = null;
        setDropTarget(null);
      }
    };

    const onUp = async () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      const ref = dragRef.current;
      const dt = dropTargetRef.current;
      setDraggingActivity(null);
      setDropTarget(null);
      setDragPreview(null);
      setDragStart(null);
      setDidDrag(false);
      dragRef.current = null;
      dropTargetRef.current = null;

      if (ref && dt && ref.didMove) {
        const day = days[dt.dayIndex];
        const newStart = slotToDate(day, dt.slotIndex);
        const newEnd = new Date(newStart.getTime() + ref.activity.duration_minutes * 60000);
        try {
          await updateActivity(ref.activity.id, {
            start_time: newStart.toISOString(),
            end_time: newEnd.toISOString(),
          });
          setActivities(prev => prev.map(a => a.id === ref.activity.id ? {
            ...a,
            start_time: newStart.toISOString(),
            end_time: newEnd.toISOString(),
          } : a));
        } catch (err) {
          console.error('Failed to move activity:', err);
        }
      } else if (ref && !ref.didMove) {
        setEditActivity(ref.activity);
        setAddAt(null);
      }
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [draggingActivity, dragStart, days, loadActivities]);

  const activitiesByDay = useMemo(() => {
    const map = new Map<string, Activity[]>();
    days.forEach(d => map.set(d.toDateString(), []));
    activities.forEach(a => {
      const key = parseUTC(a.start_time).toDateString();
      if (map.has(key)) map.get(key)!.push(a);
    });
    map.forEach((arr, k) => arr.sort((x, y) => parseUTC(x.start_time).getTime() - parseUTC(y.start_time).getTime()));
    return map;
  }, [activities, days]);

  const weekTotalMinutes = useMemo(() => {
    return activities.reduce((s, a) => s + a.duration_minutes, 0);
  }, [activities]);

  const handleCellClick = (day: Date, slotIndex: number) => {
    setAddAt({ day, slotIndex });
    setEditActivity(null);
  };

  const handleBlockPointerDown = (e: React.PointerEvent, a: Activity) => {
    e.stopPropagation();
    setDraggingActivity(a);
    setDragStart({ x: e.clientX, y: e.clientY });
    setDragPreview({ x: e.clientX, y: e.clientY });
  };

  const getCaseName = (caseId: number | null) =>
    caseId ? cases.find(c => c.id === caseId)?.name ?? '—' : '—';

  const getActivityName = (a: Activity) =>
    a.document_name || a.email_subject || a.contact_name || a.description || 'Activity';

  const getActivityIcon = (t: string) => {
    switch (t) {
      case 'document': return '📄';
      case 'email': return '📧';
      case 'call': return '📞';
      default: return '📋';
    }
  };

  return (
    <div className="timesheet-calendar">
      <div className="ts-header">
        <div className="ts-nav">
          <button type="button" className="ts-nav-btn" onClick={() => setWeekOffset(o => o - 1)}>← Prev</button>
          <span className="ts-week-label">
            {weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <button type="button" className="ts-nav-btn" onClick={() => setWeekOffset(o => o + 1)}>Next →</button>
          {weekOffset !== 0 && (
            <button type="button" className="ts-nav-btn" onClick={() => setWeekOffset(0)}>Today</button>
          )}
        </div>
        <div className="ts-actions">
          <span className="ts-total">Week: {Math.floor(weekTotalMinutes / 60)}h {weekTotalMinutes % 60}m</span>
          <button type="button" className="ts-add-case-btn" onClick={() => setShowAddCase(true)}>+ Add a case</button>
        </div>
      </div>

      {loading ? (
        <div className="ts-loading">Loading…</div>
      ) : (
        <div className="ts-grid-outer">
          <div
            className="ts-grid-head"
            style={{
              gridTemplateColumns: '72px repeat(7, 1fr)',
            }}
          >
            <div className="ts-time-header" />
            {days.map((day, j) => {
              const key = day.toDateString();
              const isToday = day.toDateString() === new Date().toDateString();
              return (
                <div
                  key={key}
                  className={`ts-day-header ${isToday ? 'today' : ''}`}
                  style={{ gridColumn: j + 2 }}
                >
                  <div className="ts-day-name">{day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                  <div className="ts-day-num">{day.getDate()}</div>
                </div>
              );
            })}
          </div>

          <div className="ts-grid-body-wrap">
            <div
              className="ts-grid-body"
              style={{
                gridTemplateRows: `repeat(${slotCount}, ${ROW_HEIGHT}px)`,
                gridTemplateColumns: '72px repeat(7, 1fr)',
              }}
            >
              {Array.from({ length: slotCount }, (_, i) => {
                const { h, m } = slotToTime(i);
                const label = h < 12 ? `${h}:${m.toString().padStart(2, '0')} AM` : (h === 12 ? '12' : h - 12) + `:${m.toString().padStart(2, '0')} PM`;
                return (
                  <div key={`t-${i}`} className="ts-time-slot" style={{ gridColumn: 1, gridRow: i + 1 }}>
                    {label}
                  </div>
                );
              })}
            {days.map((day, j) => {
              const key = day.toDateString();
              const isToday = day.toDateString() === new Date().toDateString();
              const dayActivities = activitiesByDay.get(key) || [];
              return (
                <div
                  key={key}
                  className={`ts-day-col ${isToday ? 'today' : ''}`}
                  style={{ gridColumn: j + 2, gridRow: `1 / ${1 + slotCount}` }}
                >
                  <div className="ts-day-cells">
                    {Array.from({ length: slotCount }, (_, i) => {
                      const isDrop = dropTarget?.dayIndex === j && dropTarget?.slotIndex === i;
                      return (
                        <div
                          key={i}
                          className={`ts-cell ${isToday ? 'today' : ''} ${isDrop ? 'ts-cell-drop-target' : ''}`}
                          data-day-index={j}
                          data-slot={i}
                          onClick={() => handleCellClick(day, i)}
                          role="gridcell"
                        />
                      );
                    })}
                  </div>
                  <div className="ts-day-blocks">
                    {dayActivities.map(a => {
                      const start = parseUTC(a.start_time);
                      const end = parseUTC(a.end_time);
                      const dayStart = new Date(day);
                      dayStart.setHours(GRID_START_HOUR, 0, 0, 0);
                      const topMin = (start.getTime() - dayStart.getTime()) / 60000;
                      const durMin = a.duration_minutes;
                      const top = (topMin / SLOT_MINUTES) * ROW_HEIGHT;
                      const height = Math.max((durMin / SLOT_MINUTES) * ROW_HEIGHT, 24);
                      const isDragging = draggingActivity?.id === a.id;
                      return (
                        <div
                          key={a.id}
                          className={`ts-block ${isDragging ? 'ts-block-dragging' : ''}`}
                          style={{ top, height }}
                          onPointerDown={e => handleBlockPointerDown(e, a)}
                        >
                          <span className="ts-block-icon">{getActivityIcon(a.type)}</span>
                          <span className="ts-block-time">
                            {start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – {end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </span>
                          <span className="ts-block-name">{getActivityName(a)}</span>
                          {a.case_id && <span className="ts-block-case">{getCaseName(a.case_id)}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </div>
      )}

      {draggingActivity && dragPreview && (
        <div
          className="ts-drag-preview"
          style={{
            left: dragPreview.x,
            top: dragPreview.y,
          }}
          aria-hidden
        >
          <span className="ts-block-icon">{getActivityIcon(draggingActivity.type)}</span>
          <span className="ts-block-time">
            {parseUTC(draggingActivity.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – {parseUTC(draggingActivity.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>
          <span className="ts-block-name">{getActivityName(draggingActivity)}</span>
          {draggingActivity.case_id && <span className="ts-block-case">{getCaseName(draggingActivity.case_id)}</span>}
        </div>
      )}

      {addAt && (
        <ActivityModal
          mode="add"
          attorneyId={attorneyId}
          cases={cases}
          initialDay={addAt.day}
          initialSlotIndex={addAt.slotIndex}
          slotToTime={slotToTime}
          onClose={() => setAddAt(null)}
          onSaved={(created) => {
            setAddAt(null);
            setActivities(prev => [created, ...prev]);
          }}
        />
      )}

      {editActivity && (
        <ActivityModal
          mode="edit"
          attorneyId={attorneyId}
          cases={cases}
          activity={editActivity}
          slotToTime={slotToTime}
          onClose={() => setEditActivity(null)}
          onSaved={(updated) => {
            setEditActivity(null);
            setActivities(prev => prev.map(a => a.id === updated.id ? updated : a));
          }}
          onDeleted={(deletedId) => {
            setEditActivity(null);
            setActivities(prev => prev.filter(a => a.id !== deletedId));
          }}
        />
      )}

      {showAddCase && (
        <AddCaseModal
          attorneyId={attorneyId}
          onClose={() => setShowAddCase(false)}
          onAdded={() => { setShowAddCase(false); onCaseAdded(); }}
        />
      )}
    </div>
  );
}

interface ActivityModalProps {
  mode: 'add' | 'edit';
  attorneyId: number;
  cases: Case[];
  activity?: Activity;
  initialDay?: Date;
  initialSlotIndex?: number;
  slotToTime: (i: number) => { h: number; m: number };
  onClose: () => void;
  onSaved: (saved: Activity) => void;
  onDeleted?: (deletedId: number) => void;
}

function ActivityModal({
  mode,
  attorneyId,
  cases,
  activity,
  initialDay,
  initialSlotIndex = 0,
  slotToTime,
  onClose,
  onSaved,
  onDeleted,
}: ActivityModalProps) {
  const { h: defaultH, m: defaultM } = slotToTime(initialSlotIndex ?? 0);
  const endM = defaultM + SLOT_MINUTES;
  const endH = endM >= 60 ? defaultH + 1 : defaultH;
  const endM2 = endM % 60;

  const [type, setType] = useState<ActivityType>(activity?.type ?? 'document');
  const [startDate, setStartDate] = useState(() => {
    if (activity) return toYMD(parseUTC(activity.start_time));
    return initialDay ? toYMD(initialDay) : toYMD(new Date());
  });
  const [startTime, setStartTime] = useState(() => {
    if (activity) {
      const s = parseUTC(activity.start_time);
      return `${s.getHours().toString().padStart(2, '0')}:${s.getMinutes().toString().padStart(2, '0')}`;
    }
    return `${defaultH.toString().padStart(2, '0')}:${defaultM.toString().padStart(2, '0')}`;
  });
  const [endTime, setEndTime] = useState(() => {
    if (activity) {
      const e = parseUTC(activity.end_time);
      return `${e.getHours().toString().padStart(2, '0')}:${e.getMinutes().toString().padStart(2, '0')}`;
    }
    return `${endH.toString().padStart(2, '0')}:${(endM2).toString().padStart(2, '0')}`;
  });
  const [name, setName] = useState(() => getActName(activity));
  const [description, setDescription] = useState(activity?.description ?? '');
  const [caseId, setCaseId] = useState<string>(activity?.case_id?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function getActName(a?: Activity) {
    if (!a) return '';
    return a.document_name || a.email_subject || a.contact_name || '';
  }

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
      if (mode === 'add') {
        const payload: any = {
          attorney_id: attorneyId,
          type,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          description: description || undefined,
        };
        if (type === 'document') payload.document_name = name || undefined;
        else if (type === 'email') payload.email_subject = name || undefined;
        else if (type === 'call') payload.contact_name = name || undefined;
        let created = await createActivity(payload);
        if (caseId) {
          created = await updateActivity(created.id, { case_id: parseInt(caseId), status: 'edited' });
        }
        onSaved(created);
      } else if (activity) {
        const up: any = {
          type,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          description: description || undefined,
          case_id: caseId ? parseInt(caseId) : null,
          status: 'edited',
        };
        if (type === 'document') up.document_name = name || undefined;
        else if (type === 'email') up.email_subject = name || undefined;
        else if (type === 'call') up.contact_name = name || undefined;
        const updated = await updateActivity(activity.id, up);
        onSaved(updated);
      }
    } catch (err) {
      alert('Error saving: ' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!activity || !onDeleted || !confirm('Delete this activity?')) return;
    setDeleting(true);
    try {
      await deleteActivity(activity.id);
      onDeleted(activity.id);
    } catch (err) {
      alert('Error deleting: ' + (err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="ts-modal-overlay" onClick={onClose}>
      <div className="ts-modal" onClick={e => e.stopPropagation()}>
        <h3>{mode === 'add' ? 'Add activity' : 'Edit activity'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="ts-form-row">
            <label>Type</label>
            <select value={type} onChange={e => setType(e.target.value as ActivityType)}>
              <option value="document">📄 Document</option>
              <option value="email">📧 Email</option>
              <option value="call">📞 Call</option>
            </select>
          </div>
          <div className="ts-form-row">
            <label>Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
          </div>
          <div className="ts-form-row ts-form-row-2">
            <div>
              <label>Start</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required />
            </div>
            <div>
              <label>End</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} required />
            </div>
          </div>
          <div className="ts-form-row">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={type === 'document' ? 'Document name' : type === 'email' ? 'Subject' : 'Contact name'}
            />
          </div>
          <div className="ts-form-row">
            <label>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Notes…" rows={2} />
          </div>
          <div className="ts-form-row">
            <label>Case</label>
            <select value={caseId} onChange={e => setCaseId(e.target.value)}>
              <option value="">—</option>
              {cases.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="ts-form-actions">
            {mode === 'edit' && onDeleted && (
              <button type="button" className="ts-btn-delete" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            )}
            <div className="ts-form-actions-right">
              <button type="button" className="ts-btn-cancel" onClick={onClose}>Cancel</button>
              <button type="submit" className="ts-btn-save" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddCaseModal({
  attorneyId,
  onClose,
  onAdded,
}: { attorneyId: number; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createCase({ name: name.trim(), client_name: clientName.trim() || undefined, attorney_id: attorneyId });
      setName('');
      setClientName('');
      onAdded();
    } catch (err) {
      alert('Error adding case: ' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ts-modal-overlay" onClick={onClose}>
      <div className="ts-modal" onClick={e => e.stopPropagation()}>
        <h3>Add a case</h3>
        <form onSubmit={handleSubmit}>
          <div className="ts-form-row">
            <label>Case name *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Smith v. Jones" required />
          </div>
          <div className="ts-form-row">
            <label>Client name</label>
            <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Optional" />
          </div>
          <div className="ts-form-actions">
            <button type="button" className="ts-btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="ts-btn-save" disabled={saving}>{saving ? 'Saving…' : 'Add case'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

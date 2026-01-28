import { useState } from 'react';
import type { Activity, ActivityType, Case } from '../types';
import { updateActivity } from '../api';

interface EditActivityFormProps {
  activity: Activity;
  cases: Case[];
  onClose: () => void;
  onSaved: () => void;
}

export default function EditActivityForm({ activity, cases, onClose, onSaved }: EditActivityFormProps) {
  const [type, setType] = useState<ActivityType>(activity.type);
  const [startTime, setStartTime] = useState(formatDateTimeLocal(activity.start_time));
  const [endTime, setEndTime] = useState(formatDateTimeLocal(activity.end_time));
  const [caseId, setCaseId] = useState(activity.case_id?.toString() || '');
  const [description, setDescription] = useState(activity.description || '');
  
  // Type-specific fields
  const [documentName, setDocumentName] = useState(activity.document_name || '');
  const [emailFrom, setEmailFrom] = useState(activity.email_from || '');
  const [emailTo, setEmailTo] = useState(activity.email_to || '');
  const [emailSubject, setEmailSubject] = useState(activity.email_subject || '');
  const [contactName, setContactName] = useState(activity.contact_name || '');
  const [phoneNumber, setPhoneNumber] = useState(activity.phone_number || '');

  function formatDateTimeLocal(dateStr: string): string {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!startTime || !endTime) {
      alert('Please enter start and end times');
      return;
    }

    const duration = Math.floor((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000);

    const updateData: any = {
      type,
      start_time: new Date(startTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
      duration_minutes: duration,
      case_id: caseId ? parseInt(caseId) : null,
      description,
    };

    // Add type-specific fields
    if (type === 'document') {
      updateData.document_name = documentName;
      updateData.email_from = null;
      updateData.email_to = null;
      updateData.email_subject = null;
      updateData.contact_name = null;
      updateData.phone_number = null;
    } else if (type === 'email') {
      updateData.document_name = null;
      updateData.email_from = emailFrom;
      updateData.email_to = emailTo;
      updateData.email_subject = emailSubject;
      updateData.contact_name = null;
      updateData.phone_number = null;
    } else if (type === 'call') {
      updateData.document_name = null;
      updateData.email_from = null;
      updateData.email_to = null;
      updateData.email_subject = null;
      updateData.contact_name = contactName;
      updateData.phone_number = phoneNumber;
    }

    try {
      await updateActivity(activity.id, updateData);

      onSaved();
      onClose();
    } catch (error) {
      alert('Error updating activity: ' + (error as Error).message);
    }
  };

  return (
    <div className="activity-form-overlay">
      <div className="activity-form">
        <h2>Edit Activity</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Activity Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as ActivityType)} required>
              <option value="document">📄 Document</option>
              <option value="email">📧 Email</option>
              <option value="call">📞 Phone Call</option>
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Start Time</label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>End Time</label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Assigned Case</label>
            <select value={caseId} onChange={(e) => setCaseId(e.target.value)}>
              <option value="">Unassigned</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {type === 'document' && (
            <div className="form-group">
              <label>Document Name</label>
              <input
                type="text"
                value={documentName}
                onChange={(e) => setDocumentName(e.target.value)}
                placeholder="e.g., Motion_to_Dismiss.pdf"
              />
            </div>
          )}

          {type === 'email' && (
            <>
              <div className="form-group">
                <label>From</label>
                <input
                  type="email"
                  value={emailFrom}
                  onChange={(e) => setEmailFrom(e.target.value)}
                  placeholder="sender@email.com"
                />
              </div>
              <div className="form-group">
                <label>To</label>
                <input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="recipient@email.com"
                />
              </div>
              <div className="form-group">
                <label>Subject</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Email subject"
                />
              </div>
            </>
          )}

          {type === 'call' && (
            <>
              <div className="form-group">
                <label>Contact Name</label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="John Smith"
                />
              </div>
              <div className="form-group">
                <label>Phone Number</label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="555-1234"
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label>Description (Optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional notes..."
              rows={3}
            />
          </div>

          <div className="form-actions">
            <button type="button" onClick={onClose} className="cancel-btn">
              Cancel
            </button>
            <button type="submit" className="submit-btn">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
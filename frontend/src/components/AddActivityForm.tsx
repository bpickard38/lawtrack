import { useState } from 'react';
import type { ActivityType, ActivityCreate } from '../types';
import { createActivity } from '../api';

interface AddActivityFormProps {
  attorneyId: number;
  onActivityAdded: () => void;
}

export default function AddActivityForm({ attorneyId, onActivityAdded }: AddActivityFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<ActivityType>('document');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [description, setDescription] = useState('');
  
  // Type-specific fields
  const [documentName, setDocumentName] = useState('');
  const [emailFrom, setEmailFrom] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [contactName, setContactName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  const resetForm = () => {
    setType('document');
    setStartTime('');
    setEndTime('');
    setDescription('');
    setDocumentName('');
    setEmailFrom('');
    setEmailTo('');
    setEmailSubject('');
    setContactName('');
    setPhoneNumber('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!startTime || !endTime) {
      alert('Please enter start and end times');
      return;
    }

    const activity: ActivityCreate = {
      attorney_id: attorneyId,
      type,
      start_time: new Date(startTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
      description,
    };

    // Add type-specific fields
    if (type === 'document' && documentName) {
      activity.document_name = documentName;
    } else if (type === 'email') {
      activity.email_from = emailFrom;
      activity.email_to = emailTo;
      activity.email_subject = emailSubject;
    } else if (type === 'call') {
      activity.contact_name = contactName;
      activity.phone_number = phoneNumber;
    }

    try {
      await createActivity(activity);

      resetForm();
      setIsOpen(false);
      onActivityAdded();
    } catch (error) {
      alert('Error creating activity: ' + (error as Error).message);
    }
  };

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} className="add-btn">
        + Add Activity
      </button>
    );
  }

  return (
    <div className="activity-form-overlay">
      <div className="activity-form">
        <h2>Add New Activity</h2>
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
            <button type="button" onClick={() => { resetForm(); setIsOpen(false); }} className="cancel-btn">
              Cancel
            </button>
            <button type="submit" className="submit-btn">
              Add Activity
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
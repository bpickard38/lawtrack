import { useState } from 'react';
import type { Case } from '../types';
import { updateCase } from '../api';

interface EditCaseFormProps {
  caseData: Case;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditCaseForm({ caseData, onClose, onSaved }: EditCaseFormProps) {
  const [name, setName] = useState(caseData.name);
  const [clientName, setClientName] = useState(caseData.client_name || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name) {
      alert('Please enter case name');
      return;
    }

    try {
      await updateCase(caseData.id, {
        name,
        client_name: clientName || undefined,
      });

      onSaved();
      onClose();
    } catch (error) {
      alert('Error updating case: ' + (error as Error).message);
    }
  };

  return (
    <div className="activity-form-overlay">
      <div className="activity-form">
        <h2>Edit Case</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Case Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Smith v. Jones"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Client Name</label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Robert Smith"
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
import { useState } from 'react';
import type { Attorney } from '../types';
import { createCase } from '../api';

interface AddCaseFormProps {
  attorneys: Attorney[];
  selectedAttorneyId: number;
  onCaseAdded: () => void;
}

export default function AddCaseForm({ attorneys, selectedAttorneyId, onCaseAdded }: AddCaseFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [attorneyId, setAttorneyId] = useState(selectedAttorneyId.toString());

  const resetForm = () => {
    setName('');
    setClientName('');
    setAttorneyId(selectedAttorneyId.toString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name) {
      alert('Please enter case name');
      return;
    }

    try {
      await createCase({
        name,
        client_name: clientName || undefined,
        attorney_id: parseInt(attorneyId)
      });

      resetForm();
      setIsOpen(false);
      onCaseAdded();
    } catch (error) {
      alert('Error creating case: ' + (error as Error).message);
    }
  };

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} className="add-case-btn">
        + Add Case
      </button>
    );
  }

  return (
    <div className="activity-form-overlay">
      <div className="activity-form">
        <h2>Add New Case</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Case Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Smith v. Jones"
              required
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

          <div className="form-group">
            <label>Attorney</label>
            <select
              value={attorneyId}
              onChange={(e) => setAttorneyId(e.target.value)}
              required
            >
              {attorneys.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-actions">
            <button type="button" onClick={() => { resetForm(); setIsOpen(false); }} className="cancel-btn">
              Cancel
            </button>
            <button type="submit" className="submit-btn">
              Add Case
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
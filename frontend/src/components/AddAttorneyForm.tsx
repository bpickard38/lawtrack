import { useState } from 'react';

interface AddAttorneyFormProps {
  onAttorneyAdded: () => void;
}

export default function AddAttorneyForm({ onAttorneyAdded }: AddAttorneyFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [billableRate, setBillableRate] = useState('350');

  const resetForm = () => {
    setName('');
    setEmail('');
    setBillableRate('350');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !email) {
      alert('Please enter name and email');
      return;
    }

    try {
      const response = await fetch('http://localhost:8000/api/attorneys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          billable_rate: parseFloat(billableRate)
        }),
      });

      if (!response.ok) throw new Error('Failed to create attorney');

      resetForm();
      setIsOpen(false);
      onAttorneyAdded();
    } catch (error) {
      alert('Error creating attorney: ' + (error as Error).message);
    }
  };

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} className="add-attorney-btn">
        + Add Attorney
      </button>
    );
  }

  return (
    <div className="activity-form-overlay">
      <div className="activity-form">
        <h2>Add New Attorney</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              required
            />
          </div>

          <div className="form-group">
            <label>Email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@lawfirm.com"
              required
            />
          </div>

          <div className="form-group">
            <label>Billable Rate ($/hour)</label>
            <input
              type="number"
              value={billableRate}
              onChange={(e) => setBillableRate(e.target.value)}
              placeholder="350"
              step="0.01"
            />
          </div>

          <div className="form-actions">
            <button type="button" onClick={() => { resetForm(); setIsOpen(false); }} className="cancel-btn">
              Cancel
            </button>
            <button type="submit" className="submit-btn">
              Add Attorney
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
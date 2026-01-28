import { useState } from 'react';
import type { Case } from '../types';
import { deleteCase, fetchCaseTimeSummary } from '../api';
import EditCaseForm from './EditCaseForm';
import type { CaseTimeSummary } from '../types';

interface CaseListProps {
  cases: Case[];
  onCaseUpdated: () => void;
}

export default function CaseList({ cases, onCaseUpdated }: CaseListProps) {
  const [editingCase, setEditingCase] = useState<Case | null>(null);
  const [caseSummaries, setCaseSummaries] = useState<Map<number, CaseTimeSummary>>(new Map());
  const [loadingSummaries, setLoadingSummaries] = useState(false);

  const handleDelete = async (caseId: number, caseName: string) => {
    if (!confirm(`Are you sure you want to delete "${caseName}"? Activities will be unassigned but not deleted.`)) {
      return;
    }

    try {
      await deleteCase(caseId);
      onCaseUpdated();
    } catch (error) {
      alert('Error deleting case: ' + (error as Error).message);
    }
  };

  const handleEdit = (caseData: Case) => {
    setEditingCase(caseData);
  };

  const handleEditClose = () => {
    setEditingCase(null);
  };

  const handleEditSaved = () => {
    onCaseUpdated();
  };

  // Load summaries on mount
  useState(() => {
    if (cases.length > 0 && !loadingSummaries) {
      setLoadingSummaries(true);
      Promise.all(
        cases.map(c => 
          fetchCaseTimeSummary(c.id)
            .then(summary => ({ id: c.id, summary }))
            .catch(() => null)
        )
      ).then(results => {
        const summaryMap = new Map();
        results.forEach(result => {
          if (result) {
            summaryMap.set(result.id, result.summary);
          }
        });
        setCaseSummaries(summaryMap);
        setLoadingSummaries(false);
      });
    }
  });

  if (cases.length === 0) {
    return (
      <div className="empty-state">
        <p>No cases yet. Create your first case to get started!</p>
      </div>
    );
  }

  return (
    <>
      <div className="case-list">
        {cases.map((caseData) => {
          const summary = caseSummaries.get(caseData.id);
          return (
            <div key={caseData.id} className="case-card">
              <div className="case-header">
                <div className="case-info">
                  <h3>{caseData.name}</h3>
                  {caseData.client_name && (
                    <p className="case-client">Client: {caseData.client_name}</p>
                  )}
                </div>
                <div className="case-actions">
                  <button 
                    onClick={() => handleEdit(caseData)} 
                    className="edit-case-btn"
                    title="Edit case"
                  >
                    ✏️
                  </button>
                  <button 
                    onClick={() => handleDelete(caseData.id, caseData.name)} 
                    className="delete-case-btn"
                    title="Delete case"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              
              {summary && (
                <div className="case-stats">
                  <div className="stat">
                    <span className="stat-label">Total Time:</span>
                    <span className="stat-value">{summary.total_hours}h</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Activities:</span>
                    <span className="stat-value">{summary.activity_count}</span>
                  </div>
                </div>
              )}

              <div className="case-footer">
                <span className="case-date">
                  Created: {new Date(caseData.created_at).toLocaleDateString()}
                </span>
                <span className={`case-status ${caseData.status}`}>
                  {caseData.status}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {editingCase && (
        <EditCaseForm
          caseData={editingCase}
          onClose={handleEditClose}
          onSaved={handleEditSaved}
        />
      )}
    </>
  );
}
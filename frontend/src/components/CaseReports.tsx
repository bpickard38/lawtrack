import { useState, useEffect } from 'react';
import type { Case, CaseTimeSummary } from '../types';
import { fetchCaseTimeSummary } from '../api';

interface CaseReportsProps {
  cases: Case[];
}

export default function CaseReports({ cases }: CaseReportsProps) {
  const [summaries, setSummaries] = useState<Record<number, CaseTimeSummary>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSummaries();
  }, [cases]);

  async function loadSummaries() {
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
    setLoading(false);
  }

  const formatHours = (hours: number) => {
    return hours.toFixed(1);
  };

  const getPercentage = (part: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((part / total) * 100);
  };

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
      {cases.map((c) => {
        const summary = summaries[c.id];
        if (!summary || summary.total_minutes === 0) return null;

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
              <div className="breakdown-item">
                <div className="breakdown-header">
                  <span className="breakdown-icon">📄</span>
                  <span className="breakdown-label">Documents</span>
                  <span className="breakdown-value">
                    {formatHours(summary.document_minutes / 60)}h
                  </span>
                </div>
                <div className="breakdown-bar">
                  <div 
                    className="breakdown-fill document"
                    style={{ width: `${getPercentage(summary.document_minutes, summary.total_minutes)}%` }}
                  />
                </div>
                <div className="breakdown-percent">
                  {getPercentage(summary.document_minutes, summary.total_minutes)}%
                </div>
              </div>

              <div className="breakdown-item">
                <div className="breakdown-header">
                  <span className="breakdown-icon">📧</span>
                  <span className="breakdown-label">Emails</span>
                  <span className="breakdown-value">
                    {formatHours(summary.email_minutes / 60)}h
                  </span>
                </div>
                <div className="breakdown-bar">
                  <div 
                    className="breakdown-fill email"
                    style={{ width: `${getPercentage(summary.email_minutes, summary.total_minutes)}%` }}
                  />
                </div>
                <div className="breakdown-percent">
                  {getPercentage(summary.email_minutes, summary.total_minutes)}%
                </div>
              </div>

              <div className="breakdown-item">
                <div className="breakdown-header">
                  <span className="breakdown-icon">📞</span>
                  <span className="breakdown-label">Calls</span>
                  <span className="breakdown-value">
                    {formatHours(summary.call_minutes / 60)}h
                  </span>
                </div>
                <div className="breakdown-bar">
                  <div 
                    className="breakdown-fill call"
                    style={{ width: `${getPercentage(summary.call_minutes, summary.total_minutes)}%` }}
                  />
                </div>
                <div className="breakdown-percent">
                  {getPercentage(summary.call_minutes, summary.total_minutes)}%
                </div>
              </div>
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
  );
}
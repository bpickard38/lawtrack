import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { createCase, importCases, updateAttorneyRate, updateReminderTime, completeOnboarding, createAgentKey } from '../api';

interface OnboardingProps {
  onDone: () => void;
}

const STEPS = ['Firm & rate', 'Clients & matters', 'Connect sources', 'What we capture', 'Daily reminder', 'Ready'] as const;

function parseCsv(text: string): { name: string; client_name?: string }[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const hasHeader = lines[0].toLowerCase().includes('name');
  return (hasHeader ? lines.slice(1) : lines)
    .map(line => {
      const [name, client] = line.split(',').map(s => (s ?? '').trim());
      return { name, client_name: client || undefined };
    })
    .filter(r => r.name);
}

export default function Onboarding({ onDone }: OnboardingProps) {
  const { user, attorney, refreshAttorney } = useAuth();
  const [step, setStep] = useState(0);

  const [rate, setRate] = useState(attorney ? String(attorney.billable_rate) : '300');
  const [savingRate, setSavingRate] = useState(false);

  const [matterName, setMatterName] = useState('');
  const [matterClient, setMatterClient] = useState('');
  const [addedMatters, setAddedMatters] = useState<string[]>([]);
  const [addingMatter, setAddingMatter] = useState(false);
  const [importSummary, setImportSummary] = useState<string | null>(null);

  const [creatingKey, setCreatingKey] = useState(false);
  const [agentKey, setAgentKey] = useState<string | null>(null);

  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderTime, setReminderTimeState] = useState('17:00');
  const [finishing, setFinishing] = useState(false);

  async function handleNext() {
    if (step === 0) {
      const parsed = parseFloat(rate);
      if (!isNaN(parsed) && parsed >= 0) {
        setSavingRate(true);
        // Only persists the rate server-side here - refreshing the shared attorney object
        // mid-wizard would change its reference and unmount this wizard (App.tsx reloads
        // cases on every attorney change). The shared copy is refreshed once, at the end.
        try { await updateAttorneyRate(parsed); } catch { /* non-blocking */ }
        setSavingRate(false);
      }
    }
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  }

  function handleBack() {
    setStep(s => Math.max(s - 1, 0));
  }

  async function handleAddMatter(e: React.FormEvent) {
    e.preventDefault();
    if (!matterName.trim() || !attorney) return;
    setAddingMatter(true);
    try {
      await createCase({ name: matterName.trim(), client_name: matterClient.trim() || undefined, attorney_id: attorney.id });
      setAddedMatters(prev => [...prev, matterName.trim()]);
      setMatterName('');
      setMatterClient('');
    } catch (err) {
      alert('Failed to add matter: ' + (err as Error).message);
    } finally {
      setAddingMatter(false);
    }
  }

  async function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) {
      setImportSummary('No rows found in that file.');
      return;
    }
    try {
      const result = await importCases(rows);
      setImportSummary(`Imported ${result.created} matter${result.created === 1 ? '' : 's'}${result.skipped ? `, skipped ${result.skipped}` : ''}.`);
    } catch (err) {
      setImportSummary('Import failed: ' + (err as Error).message);
    }
  }

  async function handleCreateAgentKey() {
    setCreatingKey(true);
    try {
      const res = await createAgentKey();
      setAgentKey(res.api_key);
    } catch (err) {
      alert('Failed to create agent key: ' + (err as Error).message);
    } finally {
      setCreatingKey(false);
    }
  }

  async function handleFinish() {
    setFinishing(true);
    try {
      await updateReminderTime(reminderEnabled ? reminderTime : null);
      await completeOnboarding();
      await refreshAttorney();
    } catch {
      // Even if a setting call fails, don't trap the user in onboarding.
    } finally {
      setFinishing(false);
      onDone();
    }
  }

  return (
    <div className="onboarding-view">
      <div className="onboarding-card">
        <div className="onboarding-progress">
          {STEPS.map((s, i) => (
            <div key={s} className={`onboarding-progress-dot ${i === step ? 'active' : i < step ? 'done' : ''}`} />
          ))}
        </div>
        <p className="onboarding-step-label">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>

        {step === 0 && (
          <div className="onboarding-step">
            <h1>Welcome, {user?.full_name?.split(' ')[0] || 'there'}.</h1>
            <p className="onboarding-sub">Your billable work is captured automatically. You approve it in under two minutes. Let's set up the basics.</p>
            <label className="onboarding-field-label">Default hourly rate</label>
            <div className="settings-rate-form">
              <span className="settings-rate-prefix">$</span>
              <input type="number" min="0" step="1" value={rate} onChange={e => setRate(e.target.value)} />
              <span className="settings-rate-suffix">/ hour</span>
            </div>
            <p className="onboarding-hint">Used to estimate the value of captured time. You can change this later in Settings.</p>
          </div>
        )}

        {step === 1 && (
          <div className="onboarding-step">
            <h1>Add your clients and matters</h1>
            <p className="onboarding-sub">Captured activity gets matched to these. Add a few now, or skip and add more later from Matters.</p>
            <form className="matters-add-form" onSubmit={handleAddMatter}>
              <input type="text" placeholder="Matter name" value={matterName} onChange={e => setMatterName(e.target.value)} />
              <input type="text" placeholder="Client name" value={matterClient} onChange={e => setMatterClient(e.target.value)} />
              <button type="submit" className="btn-primary" disabled={addingMatter || !matterName.trim()}>{addingMatter ? 'Adding…' : 'Add'}</button>
            </form>
            {addedMatters.length > 0 && (
              <ul className="onboarding-added-list">
                {addedMatters.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            )}
            <div className="onboarding-csv-row">
              <label className="btn-outline onboarding-file-btn">
                Import CSV
                <input type="file" accept=".csv,text/csv" hidden onChange={handleCsvFile} />
              </label>
              <span className="onboarding-hint">Columns: name, client_name</span>
            </div>
            {importSummary && <p className="settings-message">{importSummary}</p>}
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-step">
            <h1>Connect what LawTrack should watch</h1>
            <p className="onboarding-sub">This is what actually captures your time.</p>
            <div className="integration-cards">
              <div className="integration-card connected">
                <div className="integration-card-head">
                  <span className="integration-card-name">Desktop agent (Windows)</span>
                  <span className="integration-status-badge connected">Real</span>
                </div>
                <p>Watches documents, email windows, and calls on this computer — titles and duration only, never content.</p>
                {agentKey ? (
                  <div className="onboarding-agent-key">
                    <p>Key created — copy it now:</p>
                    <code>{agentKey}</code>
                  </div>
                ) : (
                  <button type="button" className="btn-outline" onClick={handleCreateAgentKey} disabled={creatingKey}>
                    {creatingKey ? 'Creating…' : 'Generate agent key'}
                  </button>
                )}
              </div>
              <div className="integration-card simulated">
                <div className="integration-card-head">
                  <span className="integration-card-name">Email (Gmail / Outlook)</span>
                  <span className="integration-status-badge simulated">Coming soon</span>
                </div>
                <p>Direct inbox connection isn't built yet.</p>
              </div>
              <div className="integration-card simulated">
                <div className="integration-card-head">
                  <span className="integration-card-name">Calendar</span>
                  <span className="integration-status-badge simulated">Coming soon</span>
                </div>
                <p>Calendar-based capture isn't built yet.</p>
              </div>
            </div>
            <p className="onboarding-hint">You can install the desktop agent and manage this later from Settings → Account.</p>
          </div>
        )}

        {step === 3 && (
          <div className="onboarding-step">
            <h1>What we capture</h1>
            <p className="onboarding-sub">Understand this before you turn tracking on.</p>
            <div className="onboarding-capture-grid">
              <div>
                <h3>We capture</h3>
                <ul className="privacy-list">
                  <li>Activity titles — document name, email subject, call/app name</li>
                  <li>Duration</li>
                  <li>Timestamps and matter assignment</li>
                </ul>
              </div>
              <div>
                <h3>We never capture</h3>
                <ul className="privacy-list">
                  <li>Body or content of emails</li>
                  <li>Content of documents or files</li>
                  <li>Call audio or transcripts</li>
                </ul>
              </div>
            </div>
            <p className="onboarding-hint">Tracking can be paused anytime, and you can exclude specific apps or contacts in Settings.</p>
          </div>
        )}

        {step === 4 && (
          <div className="onboarding-step">
            <h1>When should we remind you?</h1>
            <p className="onboarding-sub">A daily nudge to review captured time before it piles up.</p>
            <div className="settings-reminder-row">
              <label className="privacy-toggle-label">
                <span className="privacy-toggle-text">Remind me daily</span>
                <input type="checkbox" checked={reminderEnabled} onChange={e => setReminderEnabled(e.target.checked)} className="privacy-toggle-input" />
                <span className="privacy-toggle-switch" aria-hidden />
              </label>
              <input type="time" value={reminderTime} onChange={e => setReminderTimeState(e.target.value)} disabled={!reminderEnabled} />
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="onboarding-step">
            <h1>You're set up.</h1>
            <p className="onboarding-sub">
              Nothing is billed without your approval. Every day, come back to Today, review what
              was captured, fix anything uncertain, and approve.
            </p>
          </div>
        )}

        <div className="onboarding-actions">
          {step > 0 && step < STEPS.length - 1 && (
            <button type="button" className="ts-btn-cancel" onClick={handleBack}>Back</button>
          )}
          <div className="onboarding-actions-right">
            {step < STEPS.length - 1 && step !== 0 && (
              <button type="button" className="ts-btn-cancel" onClick={() => setStep(s => s + 1)}>Skip</button>
            )}
            {step < STEPS.length - 1 ? (
              <button type="button" className="btn-primary" onClick={handleNext} disabled={savingRate}>
                {savingRate ? 'Saving…' : 'Continue'}
              </button>
            ) : (
              <button type="button" className="btn-primary" onClick={handleFinish} disabled={finishing}>
                {finishing ? 'Finishing…' : 'Go to dashboard'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

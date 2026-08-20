import { useState, useEffect } from 'react';
import type { Case } from '../types';
import { useAuth } from '../AuthContext';
import { getSettings, updateReminderTime, updateExcludedKeywords, updateAttorneyRate } from '../api';
import Profile from './Profile';
import Privacy from './Privacy';
import CaseRules from './CaseRules';

interface SettingsProps {
  cases: Case[];
  onBack: () => void;
}

type Tab = 'account' | 'billing' | 'notifications' | 'tracking' | 'rules' | 'integrations';

const TABS: { id: Tab; label: string }[] = [
  { id: 'account', label: 'Account' },
  { id: 'billing', label: 'Billing rate' },
  { id: 'notifications', label: 'Reminders' },
  { id: 'tracking', label: 'Tracking & privacy' },
  { id: 'rules', label: 'Case rules' },
  { id: 'integrations', label: 'Sources' },
];

function BillingRateSection() {
  const { attorney } = useAuth();
  const [rate, setRate] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (attorney) setRate(String(attorney.billable_rate));
  }, [attorney?.billable_rate]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(rate);
    if (isNaN(parsed) || parsed < 0) {
      setMessage('Enter a valid hourly rate.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await updateAttorneyRate(parsed);
      setMessage('Rate updated.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update rate');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-section">
      <h2>Default hourly rate</h2>
      <p className="settings-section-desc">
        Used to estimate the billable value of captured time on the Today page. It does not change
        rates on time already approved or invoiced.
      </p>
      <form onSubmit={handleSave} className="settings-rate-form">
        <span className="settings-rate-prefix">$</span>
        <input type="number" min="0" step="1" value={rate} onChange={e => setRate(e.target.value)} />
        <span className="settings-rate-suffix">/ hour</span>
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </form>
      {message && <p className="settings-message">{message}</p>}
    </div>
  );
}

function NotificationsSection() {
  const [reminderTime, setReminderTimeState] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings()
      .then(s => {
        if (s.reminder_time) {
          setEnabled(true);
          setReminderTimeState(s.reminder_time);
        } else {
          setReminderTimeState('17:00');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(next: boolean) {
    setEnabled(next);
    setSaving(true);
    try {
      await updateReminderTime(next ? (reminderTime || '17:00') : null);
    } catch {
      setEnabled(!next);
    } finally {
      setSaving(false);
    }
  }

  async function handleTimeChange(value: string) {
    setReminderTimeState(value);
    if (!enabled) return;
    setSaving(true);
    try {
      await updateReminderTime(value);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-section">
      <h2>Daily review reminder</h2>
      <p className="settings-section-desc">
        A daily nudge to review today's captured time. This sets your preferred time — actual delivery
        depends on notification channels not yet built.
      </p>
      {loading ? (
        <p className="settings-message">Loading…</p>
      ) : (
        <div className="settings-reminder-row">
          <label className="privacy-toggle-label">
            <span className="privacy-toggle-text">Remind me daily</span>
            <input type="checkbox" checked={enabled} onChange={e => handleToggle(e.target.checked)} className="privacy-toggle-input" />
            <span className="privacy-toggle-switch" aria-hidden />
          </label>
          <input
            type="time"
            value={reminderTime}
            onChange={e => handleTimeChange(e.target.value)}
            disabled={!enabled}
          />
          {saving && <span className="privacy-control-meta">Saving…</span>}
        </div>
      )}
    </div>
  );
}

function ExcludedKeywordsSection() {
  const [keywords, setKeywords] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getSettings()
      .then(s => setKeywords(s.excluded_keywords || ''))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      await updateExcludedKeywords(keywords);
      setMessage('Saved. Matching activity will no longer be captured.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-section">
      <h2>Excluded apps &amp; contacts</h2>
      <p className="settings-section-desc">
        One per line. Any captured document name, email sender/subject, or contact name containing
        this text is never recorded by the desktop agent — not hidden after the fact, not captured
        at all.
      </p>
      {loading ? (
        <p className="settings-message">Loading…</p>
      ) : (
        <>
          <textarea
            className="settings-excluded-textarea"
            rows={4}
            placeholder={'e.g. personal-email@gmail.com\nSpotify\nSlack - #general'}
            value={keywords}
            onChange={e => setKeywords(e.target.value)}
          />
          <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save exclusions'}
          </button>
          {message && <p className="settings-message">{message}</p>}
        </>
      )}
    </div>
  );
}

function IntegrationsSection() {
  return (
    <div className="settings-section">
      <h2>Capture sources</h2>
      <p className="settings-section-desc">
        What LawTrack watches to build your daily review.
      </p>
      <div className="integration-cards">
        <div className="integration-card connected">
          <div className="integration-card-head">
            <span className="integration-card-name">Desktop agent</span>
            <span className="integration-status-badge connected">Real · connect in Account</span>
          </div>
          <p>Tracks documents, email windows, and calls on this computer by window title and duration only — never content.</p>
        </div>
        <div className="integration-card simulated">
          <div className="integration-card-head">
            <span className="integration-card-name">Email (Gmail / Outlook)</span>
            <span className="integration-status-badge simulated">Coming soon</span>
          </div>
          <p>Direct inbox connection isn't built yet. Email activity captured today comes from the desktop agent watching your email client window.</p>
        </div>
        <div className="integration-card simulated">
          <div className="integration-card-head">
            <span className="integration-card-name">Calendar</span>
            <span className="integration-status-badge simulated">Coming soon</span>
          </div>
          <p>Calendar-based meeting capture isn't built yet. Meetings show up today only if you're on a call app the desktop agent recognizes.</p>
        </div>
      </div>
    </div>
  );
}

export default function Settings({ cases, onBack }: SettingsProps) {
  const [tab, setTab] = useState<Tab>('account');

  return (
    <div className="settings-view">
      <div className="view-header">
        <h2>Settings</h2>
      </div>

      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`review-filter-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="settings-tab-panel">
        {tab === 'account' && <Profile onBack={onBack} />}
        {tab === 'billing' && <BillingRateSection />}
        {tab === 'notifications' && <NotificationsSection />}
        {tab === 'tracking' && (
          <>
            <Privacy onOpenProfile={() => setTab('account')} />
            <ExcludedKeywordsSection />
          </>
        )}
        {tab === 'rules' && (
          <div className="settings-section">
            <CaseRules cases={cases} />
          </div>
        )}
        {tab === 'integrations' && <IntegrationsSection />}
      </div>
    </div>
  );
}

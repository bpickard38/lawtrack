import { useState, useEffect } from 'react';
import { getSettings, updateTrackingEnabled, getAgentKeyStatus } from '../api';

export default function Privacy({ onOpenProfile }: { onOpenProfile: () => void }) {
  const [trackingEnabled, setTrackingEnabled] = useState<boolean>(true);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [trackingSaving, setTrackingSaving] = useState(false);
  const [agentKeyStatus, setAgentKeyStatus] = useState<{ has_key: boolean; key_prefix: string | null } | null>(null);

  useEffect(() => {
    getSettings()
      .then((s) => setTrackingEnabled(s.tracking_enabled))
      .catch(() => {})
      .finally(() => setSettingsLoading(false));
    getAgentKeyStatus()
      .then(setAgentKeyStatus)
      .catch(() => setAgentKeyStatus({ has_key: false, key_prefix: null }));
  }, []);

  function handleTrackingToggle(enabled: boolean) {
    setTrackingSaving(true);
    updateTrackingEnabled(enabled)
      .then((s) => setTrackingEnabled(s.tracking_enabled))
      .catch(() => {})
      .finally(() => setTrackingSaving(false));
  }

  return (
    <div className="privacy-view">
      <div className="view-header">
        <h2>Privacy &amp; Controls</h2>
      </div>

      <section className="privacy-section">
        <h3 className="privacy-section-title">Privacy-first by design</h3>
        <p className="privacy-section-p">
          LawTrack is built so you can track time accurately without exposing client confidences.
          We capture only what’s needed for timesheets and billing—titles and duration—and never
          the content of documents, emails, or calls.
        </p>
      </section>

      <section className="privacy-section">
        <h3 className="privacy-section-title">What we capture</h3>
        <ul className="privacy-list">
          <li>Activity titles (e.g. document name, email subject, call or app name)</li>
          <li>Duration (how long you spent)</li>
          <li>Timestamps and assignment to cases (when you assign or rules match)</li>
        </ul>
      </section>

      <section className="privacy-section">
        <h3 className="privacy-section-title">What we never capture</h3>
        <ul className="privacy-list">
          <li>Body or content of emails</li>
          <li>Content of documents or files</li>
          <li>Call audio, transcripts, or content</li>
          <li>Anything you type or paste outside of LawTrack</li>
        </ul>
      </section>

      <section className="privacy-section">
        <h3 className="privacy-section-title">Data retention</h3>
        <p className="privacy-section-p">
          Your activity data is retained for as long as your account is active. If you delete your
          account, your data is removed in line with our data handling processes.
        </p>
      </section>

      <section className="privacy-section">
        <h3 className="privacy-section-title">Controls</h3>
        <div className="privacy-control-row">
          <label className="privacy-toggle-label">
            <span className="privacy-toggle-text">Tracking enabled</span>
            <input
              type="checkbox"
              checked={trackingEnabled}
              disabled={settingsLoading || trackingSaving}
              onChange={(e) => handleTrackingToggle(e.target.checked)}
              className="privacy-toggle-input"
            />
            <span className="privacy-toggle-switch" aria-hidden />
          </label>
          {settingsLoading && <span className="privacy-control-meta">Loading…</span>}
          {trackingSaving && <span className="privacy-control-meta">Saving…</span>}
        </div>
        <p className="privacy-section-p privacy-control-desc">
          When off, the desktop agent stops capturing and sending new activities until you turn it back on.
        </p>
        {agentKeyStatus !== null && (
          <p className="privacy-section-p privacy-agent-status">
            Agent: {agentKeyStatus.has_key ? (
              <>Connected (key {agentKeyStatus.key_prefix}…)</>
            ) : (
              <>No API key. Create one in Profile to use the desktop agent.</>
            )}
          </p>
        )}
        <p className="privacy-section-p">
          <button type="button" className="privacy-link-btn" onClick={onOpenProfile}>
            Manage desktop agent (create or revoke API key)
          </button>
          — available in Profile.
        </p>
      </section>
    </div>
  );
}

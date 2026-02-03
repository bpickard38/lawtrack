import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import { getAgentKeyStatus, createAgentKey, revokeAgentKey } from '../api';

export default function Profile({ onBack }: { onBack: () => void }) {
  const { user, attorney, updateProfile, changePassword } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [agentKeyStatus, setAgentKeyStatus] = useState<{ has_key: boolean; key_prefix: string | null } | null>(null);
  const [agentKeyJustCreated, setAgentKeyJustCreated] = useState<string | null>(null);
  const [agentKeyLoading, setAgentKeyLoading] = useState(false);

  useEffect(() => {
    setFullName(user?.full_name || '');
    setEmail(user?.email || '');
  }, [user?.full_name, user?.email]);

  useEffect(() => {
    if (attorney) {
      getAgentKeyStatus()
        .then(setAgentKeyStatus)
        .catch(() => setAgentKeyStatus({ has_key: false, key_prefix: null }));
    } else {
      setAgentKeyStatus(null);
    }
  }, [attorney]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      await updateProfile({ fullName, email });
      setMessage('Profile updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setMessage('Password updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateAgentKey() {
    setError(null);
    setAgentKeyLoading(true);
    try {
      const res = await createAgentKey();
      setAgentKeyJustCreated(res.api_key);
      setAgentKeyStatus({ has_key: true, key_prefix: res.key_prefix });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent key');
    } finally {
      setAgentKeyLoading(false);
    }
  }

  async function handleRevokeAgentKey() {
    if (!confirm('Revoke your agent API key? The desktop agent will stop sending activities until you create a new key.')) return;
    setError(null);
    setAgentKeyLoading(true);
    try {
      await revokeAgentKey();
      setAgentKeyJustCreated(null);
      setAgentKeyStatus({ has_key: false, key_prefix: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke agent key');
    } finally {
      setAgentKeyLoading(false);
    }
  }

  function copyAgentKey() {
    if (agentKeyJustCreated) {
      navigator.clipboard.writeText(agentKeyJustCreated);
      setMessage('API key copied to clipboard.');
      setTimeout(() => setMessage(null), 3000);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>Profile</h1>
          <div className="attorney-info">
            <button onClick={onBack} className="logout-btn">
              Back
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="auth-card" style={{ maxWidth: 720, margin: '24px auto' }}>
          {error && <div className="error-message">{error}</div>}
          {message && <div className="success-message">{message}</div>}

          <div style={{ marginBottom: 16 }}>
            <div><strong>Role:</strong> {user?.role || 'attorney'}</div>
            <div><strong>Firm ID:</strong> {user?.firm_id ?? '—'}</div>
            {attorney && (
              <div><strong>Billable rate:</strong> ${attorney.billable_rate}/hr</div>
            )}
          </div>

          <h2 style={{ marginBottom: 12 }}>Account details</h2>
          <form onSubmit={handleSaveProfile}>
            <div className="form-group">
              <label>Full Name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button type="submit" className="auth-submit-btn" disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </form>

          <hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />

          <h2 style={{ marginBottom: 12 }}>Change password</h2>
          <form onSubmit={handleChangePassword}>
            <div className="form-group">
              <label>Current password</label>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>New password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Confirm new password</label>
              <input type="password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} required />
            </div>
            <button type="submit" className="auth-submit-btn" disabled={saving}>
              {saving ? 'Saving...' : 'Update password'}
            </button>
          </form>

          {attorney && (
            <>
              <hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />
              <h2 style={{ marginBottom: 12 }}>Auto-tracking agent</h2>
              <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 16 }}>
                The desktop app tracks documents, email, and calls and sends activities to LawTrack. Install it, then
                open the app and sign in with your LawTrack email and password — no API key to copy.
              </p>
              <p style={{ marginBottom: 16 }}>
                <a
                  href={(import.meta.env.VITE_AGENT_INSTALLER_URL as string) || 'https://github.com/bpickard38/lawtrack/releases/latest/download/LawTrackAgent-Setup.exe'}
                  className="install-app-link"
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Install desktop app
                </a>
                {' '}(Windows)
              </p>
              {agentKeyJustCreated ? (
                <div className="agent-key-reveal">
                  <p><strong>Store this key securely; it won&apos;t be shown again.</strong></p>
                  <code>{agentKeyJustCreated}</code>
                  <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                    <button type="button" onClick={copyAgentKey} className="auth-submit-btn">Copy</button>
                    <button type="button" onClick={() => setAgentKeyJustCreated(null)} className="logout-btn">
                      Done
                    </button>
                  </div>
                </div>
              ) : agentKeyStatus?.has_key ? (
                <div className="agent-key-status">
                  <p>Key active <code>{agentKeyStatus.key_prefix}…</code></p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={handleCreateAgentKey}
                      disabled={agentKeyLoading}
                      className="auth-submit-btn"
                    >
                      {agentKeyLoading ? 'Creating…' : 'Create new key'}
                    </button>
                    <button
                      type="button"
                      onClick={handleRevokeAgentKey}
                      disabled={agentKeyLoading}
                      className="logout-btn"
                    >
                      {agentKeyLoading ? 'Revoking…' : 'Revoke key'}
                    </button>
                  </div>
                  <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
                    Creating a new key revokes the current one. Store the new key securely.
                  </p>
                </div>
              ) : (
                <div>
                  <button
                    type="button"
                    onClick={handleCreateAgentKey}
                    disabled={agentKeyLoading}
                    className="auth-submit-btn"
                  >
                    {agentKeyLoading ? 'Creating…' : 'Create API key'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}


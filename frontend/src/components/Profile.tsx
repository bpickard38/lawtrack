import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';

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

  useEffect(() => {
    setFullName(user?.full_name || '');
    setEmail(user?.email || '');
  }, [user?.full_name, user?.email]);

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
        </div>
      </main>
    </div>
  );
}


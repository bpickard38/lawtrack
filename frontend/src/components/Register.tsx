import { useState } from 'react';
import { useAuth } from '../AuthContext';

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
  </svg>
);

interface RegisterProps {
  onSwitchToLogin: () => void;
}

export default function Register({ onSwitchToLogin }: RegisterProps) {
  const { register } = useAuth();
  const [fullName, setFullName] = useState('');
  const [firmName, setFirmName] = useState('');
  const [role, setRole] = useState<'attorney' | 'admin' | 'billing'>('attorney');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setIsLoading(true);
    try {
      await register({ email, password, fullName, firmName: firmName.trim() || undefined, role });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-box">
        <div className="auth-logo">
          <img src="/logo.jpg" alt="" className="auth-logo-img" />
          <span className="auth-logo-wordmark">LawTrack</span>
        </div>

        <h1 className="auth-heading">Create account</h1>
        <p className="auth-sub">Start tracking billable time in minutes.</p>

        <a href="/api/auth/google" className="auth-google-btn">
          <GoogleIcon />
          Continue with Google
        </a>

        <div className="auth-divider">
          <span>or</span>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-row">
            <div className="auth-field">
              <label htmlFor="reg-name">Full name</label>
              <input
                id="reg-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Smith"
                required
                autoFocus
              />
            </div>
            <div className="auth-field">
              <label htmlFor="reg-firm">Firm name <span className="auth-optional">(optional)</span></label>
              <input
                id="reg-firm"
                type="text"
                value={firmName}
                onChange={(e) => setFirmName(e.target.value)}
                placeholder="Smith & Associates"
              />
            </div>
          </div>

          <div className="auth-field">
            <label htmlFor="reg-role">Role</label>
            <select id="reg-role" value={role} onChange={(e) => setRole(e.target.value as 'attorney' | 'admin' | 'billing')}>
              <option value="attorney">Attorney</option>
              <option value="admin">Admin</option>
              <option value="billing">Billing</option>
            </select>
          </div>

          <div className="auth-field">
            <label htmlFor="reg-email">Email</label>
            <input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@lawfirm.com"
              required
            />
          </div>

          <div className="auth-row">
            <div className="auth-field">
              <label htmlFor="reg-pw">Password</label>
              <input
                id="reg-pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <div className="auth-field">
              <label htmlFor="reg-pw2">Confirm password</label>
              <input
                id="reg-pw2"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button type="submit" className="auth-submit" disabled={isLoading}>
            {isLoading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="auth-footer-text">
          Already have an account?{' '}
          <button type="button" onClick={onSwitchToLogin} className="auth-text-btn">
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}

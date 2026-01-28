import { useAuth } from '../AuthContext';
import { useState } from 'react';
import Profile from './Profile';

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [view, setView] = useState<'dashboard' | 'profile'>('dashboard');

  if (view === 'profile') {
    return <Profile onBack={() => setView('dashboard')} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>LawTrack Admin</h1>
          <div className="attorney-info">
            <button onClick={() => setView('profile')} className="logout-btn">
              Profile
            </button>
            <span className="attorney-name">{user?.full_name}</span>
            <button onClick={logout} className="logout-btn">
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="empty-state">
          <p>
            You’re signed in as <strong>{user?.role}</strong>.
          </p>
          <p style={{ marginTop: 12 }}>
            Next up: user management, firm settings (rounding/minimums), and
            firm-wide reports.
          </p>
        </div>
      </main>
    </div>
  );
}


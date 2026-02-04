import { useState, useEffect } from 'react';
import type { Case } from './types';
import { fetchCases } from './api';
import { useAuth } from './AuthContext';
import AuthPage from './components/AuthPage';
import AdminDashboard from './components/AdminDashboard';
import Profile from './components/Profile';
import CaseReports from './components/CaseReports';
import Timesheet from './components/Timesheet';
import CaseRules from './components/CaseRules';
import LandingPage from './components/LandingPage';
import './styles.css';

const AGENT_INSTALLER_URL =
  (import.meta.env.VITE_AGENT_INSTALLER_URL as string) ||
  'https://github.com/bpickard38/lawtrack/releases/latest/download/LawTrackAgent-Setup.exe';

const AGENT_INDICATOR_STORAGE_KEY = 'lawtrack_agent_indicator_active';

type View = 'timesheet' | 'reports' | 'rules' | 'profile';
type PublicView = 'home' | 'auth';

function App() {
  const { user, attorney, logout, isLoading: authLoading } = useAuth();
  
  const [cases, setCases] = useState<Case[]>([]);
  const [currentView, setCurrentView] = useState<View>('timesheet');
  const [loading, setLoading] = useState(true);
  const [publicView, setPublicView] = useState<PublicView>('home');
  const [showHomepage, setShowHomepage] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Agent status: "Start auto tracker" (click → launch) or "Active" (click → show quit instructions)
  const [agentIndicatorActive, setAgentIndicatorActive] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(AGENT_INDICATOR_STORAGE_KEY);
      return stored === 'true';
    } catch {
      return false;
    }
  });
  const [showQuitInstructions, setShowQuitInstructions] = useState(false);

  const LAWTRACK_LAUNCH_URL = 'lawtrack://launch';

  function handleAgentPillClick() {
    if (agentIndicatorActive) {
      setShowQuitInstructions(true);
    } else {
      setAgentIndicatorActive(true);
      try {
        localStorage.setItem(AGENT_INDICATOR_STORAGE_KEY, 'true');
      } catch {}
      window.open(LAWTRACK_LAUNCH_URL, '_blank', 'noopener,noreferrer');
    }
  }

  function markAgentQuit() {
    setAgentIndicatorActive(false);
    setShowQuitInstructions(false);
    try {
      localStorage.setItem(AGENT_INDICATOR_STORAGE_KEY, 'false');
    } catch {}
  }

  useEffect(() => {
    if (attorney) loadCases();
  }, [attorney]);

  async function loadCases() {
    if (!attorney) return;
    try {
      setLoading(true);
      const casesData = await fetchCases(attorney.id);
      setCases(casesData);
    } catch (error) {
      console.error('Error loading cases:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleCaseAdded = () => loadCases();

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="app">
        <div className="loading-screen">
          <h2>Loading LawTrack...</h2>
        </div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!user) {
    if (publicView === 'auth') {
      return (
        <div className="app">
          <header className="app-header">
            <div className="header-content">
              <button className="app-logo" type="button" onClick={() => setPublicView('home')}>
                ⚖️ LawTrack
              </button>
              <button className="logout-btn" type="button" onClick={() => setPublicView('home')}>
                Back
              </button>
            </div>
          </header>
          <main className="app-main">
            <AuthPage />
          </main>
        </div>
      );
    }

    return (
      <LandingPage
        rightCta={
          <button className="lp-signin-btn" type="button" onClick={() => setPublicView('auth')}>
            Sign In
          </button>
        }
        onLogoClick={() => setPublicView('home')}
      />
    );
  }

  // Admin/billing users don't have an attorney profile; show admin area.
  if (user.role && user.role !== 'attorney') {
    return <AdminDashboard />;
  }

  // Attorney users must have an attorney profile.
  if (!attorney) {
    return <AuthPage />;
  }

  // Show main app if authenticated
  if (loading) {
    return (
      <div className="app">
        <div className="loading-screen">
          <h2>Loading your data...</h2>
        </div>
      </div>
    );
  }

  // Logged in, but user wants to view the homepage/marketing site.
  if (showHomepage) {
    return (
      <LandingPage
        rightCta={
          <div className="lp-cta-row">
            <button className="lp-signin-btn" type="button" onClick={() => setShowHomepage(false)}>
              Go to app
            </button>
            <button onClick={logout} className="logout-btn" type="button">
              Sign Out
            </button>
          </div>
        }
        onLogoClick={() => setShowHomepage(true)}
      />
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <button className="app-logo" type="button" onClick={() => setShowHomepage(true)}>
            ⚖️ LawTrack
          </button>
          <nav className="nav-tabs">
            <button 
              className={`nav-tab ${currentView === 'timesheet' ? 'active' : ''}`}
              onClick={() => setCurrentView('timesheet')}
            >
              📅 Timesheet
            </button>
            <button 
              className={`nav-tab ${currentView === 'reports' ? 'active' : ''}`}
              onClick={() => setCurrentView('reports')}
            >
              📊 Reports
            </button>
            <button 
              className={`nav-tab ${currentView === 'rules' ? 'active' : ''}`}
              onClick={() => setCurrentView('rules')}
            >
              🔗 Rules
            </button>
          </nav>

          <a
            href={AGENT_INSTALLER_URL}
            className="install-app-link"
            download
            target="_blank"
            rel="noopener noreferrer"
          >
            Install app
          </a>

          <div className="attorney-info">
            <button
              type="button"
              className="user-menu-btn"
              onClick={() => setUserMenuOpen((v) => !v)}
            >
              <span className="attorney-name">{attorney.name}</span>
              <span className="user-menu-caret">▾</span>
            </button>
            {userMenuOpen && (
              <div className="user-menu-dropdown" role="menu">
                {currentView === 'profile' ? (
                  <button
                    type="button"
                    className="user-menu-item"
                    onClick={() => { setUserMenuOpen(false); setCurrentView('timesheet'); }}
                  >
                    Back to app
                  </button>
                ) : (
                  <button
                    type="button"
                    className="user-menu-item"
                    onClick={() => { setUserMenuOpen(false); setCurrentView('profile'); }}
                  >
                    Profile
                  </button>
                )}
                <button
                  type="button"
                  className="user-menu-item danger"
                  onClick={() => { setUserMenuOpen(false); logout(); }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="app-main">
        {currentView === 'profile' ? (
          <Profile onBack={() => setCurrentView('timesheet')} />
        ) : currentView === 'timesheet' ? (
          <div className="timesheet-view">
            <Timesheet
              attorneyId={attorney.id}
              cases={cases}
              onCaseAdded={handleCaseAdded}
            />
          </div>
        ) : currentView === 'rules' ? (
          <div className="rules-view">
            <CaseRules cases={cases} />
          </div>
        ) : (
          <div className="reports-view">
            <div className="view-header">
              <h2>Case Time Reports</h2>
            </div>
            <CaseReports attorneyId={attorney.id} cases={cases} onCaseAdded={handleCaseAdded} />
          </div>
        )}
      </main>

      {/* Agent status: "Start auto tracker" (click → launch) or "Active" (click → quit instructions) */}
      <button
        type="button"
        className={`agent-status-pill ${agentIndicatorActive ? 'agent-status-active' : 'agent-status-start'}`}
        onClick={handleAgentPillClick}
        title={agentIndicatorActive ? 'Click for how to quit' : 'Click to start the auto tracker'}
        aria-label={agentIndicatorActive ? 'Auto tracker active (click for quit instructions)' : 'Start auto tracker'}
      >
        {agentIndicatorActive && <span className="agent-status-dot" aria-hidden />}
        <span className="agent-status-label">
          {agentIndicatorActive ? 'Active' : 'Start auto tracker'}
        </span>
      </button>

      {showQuitInstructions && (
        <div className="agent-quit-modal-overlay" onClick={() => setShowQuitInstructions(false)} role="presentation">
          <div className="agent-quit-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="agent-quit-title">
            <h3 id="agent-quit-title">Quit the auto tracker</h3>
            <p>
              In the system tray (bottom-right of your taskbar), right-click the <strong>LawTrack (L)</strong> icon and choose <strong>Quit</strong>.
            </p>
            <div className="agent-quit-modal-actions">
              <button type="button" className="agent-quit-done-btn" onClick={markAgentQuit}>
                I&apos;ve quit
              </button>
              <button type="button" className="agent-quit-gotit-btn" onClick={() => setShowQuitInstructions(false)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
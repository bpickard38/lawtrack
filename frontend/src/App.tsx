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
import Privacy from './components/Privacy';
import LandingPage from './components/LandingPage';
import './styles.css';

const AGENT_INSTALLER_URL =
  (import.meta.env.VITE_AGENT_INSTALLER_URL as string) ||
  'https://github.com/bpickard38/lawtrack/releases/latest/download/LawTrackAgent-Setup.exe';

type View = 'timesheet' | 'reports' | 'rules' | 'profile' | 'privacy';
type PublicView = 'home' | 'auth';

function App() {
  const { user, attorney, logout, isLoading: authLoading } = useAuth();
  
  const [cases, setCases] = useState<Case[]>([]);
  const [currentView, setCurrentView] = useState<View>('timesheet');
  const [loading, setLoading] = useState(true);
  const [publicView, setPublicView] = useState<PublicView>('home');
  const [showHomepage, setShowHomepage] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [marketingMenuOpen, setMarketingMenuOpen] = useState(false);

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
          <div className="lp-cta-row">
            <button type="button" className="btn-outline" onClick={() => setPublicView('auth')}>
              Sign in
            </button>
            <button type="button" className="btn-primary" onClick={() => setPublicView('auth')}>
              Get started
            </button>
          </div>
        }
        onLogoClick={() => setPublicView('home')}
        onGetStarted={() => setPublicView('auth')}
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
            <button type="button" className="btn-primary" onClick={() => setShowHomepage(false)}>
              Open app
            </button>
            <div className="attorney-info" style={{ position: 'relative' }}>
              <button
                type="button"
                className="user-menu-btn"
                onClick={() => setMarketingMenuOpen((v) => !v)}
                aria-expanded={marketingMenuOpen}
                aria-haspopup="menu"
              >
                <span className="attorney-name">{attorney.name}</span>
                <span className="user-menu-caret">▾</span>
              </button>
              {marketingMenuOpen && (
                <div className="user-menu-dropdown" role="menu">
                  <button
                    type="button"
                    className="user-menu-item"
                    onClick={() => {
                      setMarketingMenuOpen(false);
                      setShowHomepage(false);
                      setCurrentView('profile');
                    }}
                  >
                    Profile
                  </button>
                  <button
                    type="button"
                    className="user-menu-item danger"
                    onClick={() => { setMarketingMenuOpen(false); logout(); }}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        }
        onLogoClick={() => setShowHomepage(true)}
        onGetStarted={() => setShowHomepage(false)}
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
            <button 
              className={`nav-tab ${currentView === 'privacy' ? 'active' : ''}`}
              onClick={() => setCurrentView('privacy')}
            >
              Privacy
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
                {(currentView === 'profile' || currentView === 'privacy') ? (
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
        ) : currentView === 'privacy' ? (
          <Privacy onOpenProfile={() => setCurrentView('profile')} />
        ) : currentView === 'timesheet' ? (
          <div className="timesheet-view">
            <Timesheet
              attorneyId={attorney.id}
              cases={cases}
              onCaseAdded={handleCaseAdded}
              onNavigateToRules={() => setCurrentView('rules')}
              onNavigateToReports={() => setCurrentView('reports')}
              installAppUrl={AGENT_INSTALLER_URL}
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
    </div>
  );
}

export default App;
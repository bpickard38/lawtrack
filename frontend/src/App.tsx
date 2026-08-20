import { useState, useEffect, useRef } from 'react';
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
import AgentStatusBadge from './components/AgentStatusBadge';
import ConnectionBanner from './components/ConnectionBanner';
import './styles.css';

type View = 'timesheet' | 'reports' | 'rules' | 'profile' | 'privacy';
type PublicView = 'home' | 'auth';

function App() {
  const { user, attorney, logout, isLoading: authLoading } = useAuth();
  
  const [cases, setCases] = useState<Case[]>([]);
  const [currentView, setCurrentView] = useState<View>('timesheet');
  const [loading, setLoading] = useState(true);
  const [publicView, setPublicView] = useState<PublicView>(
    () => window.location.hash === '#auth' ? 'auth' : 'home'
  );
  const [showHomepage, setShowHomepage] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [marketingMenuOpen, setMarketingMenuOpen] = useState(false);
  const [showDesktopDownloadFallback, setShowDesktopDownloadFallback] = useState(false);
  const openDesktopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function navigatePublic(view: PublicView) {
    setPublicView(view);
    window.location.hash = view === 'auth' ? 'auth' : '';
  }

  useEffect(() => {
    function onHashChange() {
      setPublicView(window.location.hash === '#auth' ? 'auth' : 'home');
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (attorney) loadCases();
  }, [attorney]);

  useEffect(() => {
    return () => {
      if (openDesktopTimeoutRef.current) window.clearTimeout(openDesktopTimeoutRef.current);
    };
  }, []);

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
              <button className="app-logo" type="button" onClick={() => navigatePublic('home')}>
                <img src="/logo.jpg" alt="" style={{height: '26px', width: 'auto', mixBlendMode: 'multiply'}} /><span style={{fontSize: '15px', fontWeight: 700, color: '#476788', letterSpacing: '-0.03em'}}>LawTrack</span>
              </button>
              <button className="logout-btn" type="button" onClick={() => navigatePublic('home')}>
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
            <button type="button" className="btn-outline" onClick={() => navigatePublic('auth')}>
              Sign in
            </button>
            <button type="button" className="btn-primary" onClick={() => navigatePublic('auth')}>
              Get started
            </button>
          </div>
        }
        onLogoClick={() => navigatePublic('home')}
        onGetStarted={() => navigatePublic('auth')}
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
      <ConnectionBanner />
      <header className="app-header">
        <div className="header-content">
          <button className="app-logo" type="button" onClick={() => setShowHomepage(true)}>
            <img src="/logo.jpg" alt="" style={{height: '26px', width: 'auto', mixBlendMode: 'multiply'}} />
            <span style={{fontSize: '15px', fontWeight: 700, color: '#476788', letterSpacing: '-0.03em'}}>LawTrack</span>
          </button>

          <nav className="nav-tabs">
            <button
              className={`nav-tab ${currentView === 'timesheet' ? 'active' : ''}`}
              onClick={() => setCurrentView('timesheet')}
            >
              Timesheet
            </button>
            <button
              className={`nav-tab ${currentView === 'reports' ? 'active' : ''}`}
              onClick={() => setCurrentView('reports')}
            >
              Reports
            </button>
            <button
              className={`nav-tab ${currentView === 'rules' ? 'active' : ''}`}
              onClick={() => setCurrentView('rules')}
            >
              Rules
            </button>
            <button
              className={`nav-tab ${currentView === 'privacy' ? 'active' : ''}`}
              onClick={() => setCurrentView('privacy')}
            >
              Privacy
            </button>
          </nav>

          {attorney && (
            <AgentStatusBadge onClick={() => setCurrentView('profile')} />
          )}

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
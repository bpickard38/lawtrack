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

type View = 'timesheet' | 'reports' | 'rules' | 'profile';
type PublicView = 'home' | 'auth';

function App() {
  const { user, attorney, logout, isLoading: authLoading } = useAuth();
  
  const [cases, setCases] = useState<Case[]>([]);
  const [currentView, setCurrentView] = useState<View>('timesheet');
  const [loading, setLoading] = useState(true);
  const [publicView, setPublicView] = useState<PublicView>('home');
  const [showHomepage, setShowHomepage] = useState(false);

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

          <div className="attorney-info">
            <span
              className="attorney-name"
              onClick={() => setCurrentView('profile')}
            >
              {attorney.name}
            </span>
            <button onClick={logout} className="logout-btn">
              Sign Out
            </button>
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
            <CaseReports attorneyId={attorney.id} cases={cases} />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
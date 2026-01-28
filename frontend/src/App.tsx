import { useState, useEffect } from 'react';
import type { Case, Activity } from './types';
import { fetchCases, fetchActivities } from './api';
import { useAuth } from './AuthContext';
import AuthPage from './components/AuthPage';
import AdminDashboard from './components/AdminDashboard';
import AddCaseForm from './components/AddCaseForm';
import AddActivityForm from './components/AddActivityForm';
import ActivityTimeline from './components/ActivityTimeline';
import CaseReports from './components/CaseReports';
import CaseList from './components/CaseList';
import './styles.css';

type View = 'timeline' | 'cases' | 'reports';
type DateFilter = 'all' | 'today' | 'week' | 'month' | 'custom';

function App() {
  const { user, attorney, logout, isLoading: authLoading } = useAuth();
  
  const [cases, setCases] = useState<Case[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [currentView, setCurrentView] = useState<View>('timeline');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unassigned'>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  useEffect(() => {
    if (attorney) {
      loadData();
    }
  }, [attorney]);

  useEffect(() => {
    if (attorney) {
      loadActivities();
      loadCases();
    }
  }, [attorney, filter, dateFilter, customStartDate, customEndDate]);

  // Auto-refresh activities every 30 seconds
  useEffect(() => {
    if (!attorney) return;
    
    const interval = setInterval(() => {
      console.log('Auto-refreshing activities...');
      loadActivities();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [attorney, filter, dateFilter, customStartDate, customEndDate]);

  async function loadData() {
    if (!attorney) return;
    try {
      setLoading(true);
      await loadCases();
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadCases() {
    if (!attorney) return;
    try {
      const casesData = await fetchCases(attorney.id);
      console.log('Loaded cases:', casesData);
      setCases(casesData);
    } catch (error) {
      console.error('Error loading cases:', error);
    }
  }

  async function loadActivities() {
    if (!attorney) return;
    try {
      const params: any = { attorney_id: attorney.id };
      
      if (filter === 'unassigned') {
        params.unassigned = true;
      }

      // Apply date filtering
      if (dateFilter === 'today') {
        const today = new Date().toISOString().split('T')[0];
        params.start_date = today;
        params.end_date = today;
      } else if (dateFilter === 'week') {
        const today = new Date();
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        params.start_date = weekStart.toISOString().split('T')[0];
        params.end_date = today.toISOString().split('T')[0];
      } else if (dateFilter === 'month') {
        const today = new Date();
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        params.start_date = monthStart.toISOString().split('T')[0];
        params.end_date = today.toISOString().split('T')[0];
      } else if (dateFilter === 'custom' && customStartDate && customEndDate) {
        params.start_date = customStartDate;
        params.end_date = customEndDate;
      }
      
      const activitiesData = await fetchActivities(params);
      console.log('Loaded activities:', activitiesData);
      setActivities(activitiesData);
    } catch (error) {
      console.error('Error loading activities:', error);
    }
  }

  const handleCaseAdded = async () => {
    console.log('Case added, reloading...');
    await loadCases();
  };

  const handleActivityAdded = async () => {
    console.log('Activity added, reloading...');
    await loadActivities();
  };

  const handleActivityUpdated = async () => {
    console.log('Activity updated, reloading...');
    await loadActivities();
    await loadCases();
  };

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
    return <AuthPage />;
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

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>⚖️ LawTrack</h1>
          <div className="attorney-info">
            <span className="attorney-name">{attorney.name}</span>
            <button onClick={logout} className="logout-btn">
              Sign Out
            </button>
          </div>
        </div>

        <nav className="nav-tabs">
          <button 
            className={`nav-tab ${currentView === 'timeline' ? 'active' : ''}`}
            onClick={() => setCurrentView('timeline')}
          >
            📋 Timeline
          </button>
          <button 
            className={`nav-tab ${currentView === 'cases' ? 'active' : ''}`}
            onClick={() => setCurrentView('cases')}
          >
            📁 Cases
          </button>
          <button 
            className={`nav-tab ${currentView === 'reports' ? 'active' : ''}`}
            onClick={() => setCurrentView('reports')}
          >
            📊 Reports
          </button>
        </nav>
      </header>

      <main className="app-main">
        {currentView === 'timeline' ? (
          <div className="timeline-view">
            <div className="view-header">
              <h2>Activity Timeline</h2>
              <div className="header-actions">
                {cases.length > 0 && (
                  <AddActivityForm 
                    attorneyId={attorney.id} 
                    onActivityAdded={handleActivityAdded} 
                  />
                )}
                <AddCaseForm 
                  attorneys={[{ 
                    id: attorney.id,
                    name: attorney.name, 
                    email: attorney.email,
                    billable_rate: attorney.billable_rate,
                    created_at: new Date().toISOString(),
                    user_id: attorney.user_id
                  }]}
                  selectedAttorneyId={attorney.id}
                  onCaseAdded={handleCaseAdded}
                />
              </div>
            </div>

            {/* Date Range Filters */}
            <div className="filters-section">
              <div className="date-filters">
                <button
                  className={`date-filter-btn ${dateFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setDateFilter('all')}
                >
                  All Time
                </button>
                <button
                  className={`date-filter-btn ${dateFilter === 'today' ? 'active' : ''}`}
                  onClick={() => setDateFilter('today')}
                >
                  Today
                </button>
                <button
                  className={`date-filter-btn ${dateFilter === 'week' ? 'active' : ''}`}
                  onClick={() => setDateFilter('week')}
                >
                  This Week
                </button>
                <button
                  className={`date-filter-btn ${dateFilter === 'month' ? 'active' : ''}`}
                  onClick={() => setDateFilter('month')}
                >
                  This Month
                </button>
                <button
                  className={`date-filter-btn ${dateFilter === 'custom' ? 'active' : ''}`}
                  onClick={() => setDateFilter('custom')}
                >
                  Custom Range
                </button>
              </div>

              {dateFilter === 'custom' && (
                <div className="custom-date-range">
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    placeholder="Start date"
                  />
                  <span>to</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    placeholder="End date"
                  />
                </div>
              )}

              <div className="filter-group">
                <button
                  className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                  onClick={() => setFilter('all')}
                >
                  All Activities
                </button>
                <button
                  className={`filter-btn ${filter === 'unassigned' ? 'active' : ''}`}
                  onClick={() => setFilter('unassigned')}
                >
                  Unassigned
                </button>
              </div>
            </div>
            
            {cases.length === 0 ? (
              <div className="empty-state">
                <p>No cases yet. Add your first case to get started!</p>
                <div style={{ marginTop: '20px' }}>
                  <AddCaseForm 
                    attorneys={[{ 
                      id: attorney.id,
                      name: attorney.name, 
                      email: attorney.email,
                      billable_rate: attorney.billable_rate,
                      created_at: new Date().toISOString(),
                      user_id: attorney.user_id
                    }]}
                    selectedAttorneyId={attorney.id}
                    onCaseAdded={handleCaseAdded}
                  />
                </div>
              </div>
            ) : (
              <ActivityTimeline 
                activities={activities}
                cases={cases}
                onActivityUpdated={handleActivityUpdated}
              />
            )}
          </div>
        ) : currentView === 'cases' ? (
          <div className="cases-view">
            <div className="view-header">
              <h2>Cases</h2>
              <AddCaseForm 
                attorneys={[{ 
                  id: attorney.id,
                  name: attorney.name, 
                  email: attorney.email,
                  billable_rate: attorney.billable_rate,
                  created_at: new Date().toISOString(),
                  user_id: attorney.user_id
                }]}
                selectedAttorneyId={attorney.id}
                onCaseAdded={handleCaseAdded}
              />
            </div>
            <CaseList cases={cases} onCaseUpdated={handleCaseAdded} />
          </div>
        ) : (
          <div className="reports-view">
            <div className="view-header">
              <h2>Case Time Reports</h2>
              <AddCaseForm 
                attorneys={[{ 
                  id: attorney.id,
                  name: attorney.name, 
                  email: attorney.email,
                  billable_rate: attorney.billable_rate,
                  created_at: new Date().toISOString(),
                  user_id: attorney.user_id
                }]}
                selectedAttorneyId={attorney.id}
                onCaseAdded={handleCaseAdded}
              />
            </div>
            <CaseReports cases={cases} />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
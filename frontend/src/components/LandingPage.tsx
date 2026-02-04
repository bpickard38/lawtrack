import { useMemo, useState } from 'react';

type Tab = 'home' | 'pricing';

export default function LandingPage({
  initialTab = 'home',
  rightCta,
  onLogoClick,
}: {
  initialTab?: Tab;
  rightCta: React.ReactNode;
  onLogoClick?: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);

  const pricing = useMemo(
    () => [
      {
        name: 'Starter',
        price: '$39',
        per: 'per user / month',
        blurb: 'For solo attorneys getting set up.',
        items: [
          'Manual time entry',
          'Basic case assignment',
          'Weekly calendar timesheet',
          'Reports by case',
        ],
      },
      {
        name: 'Pro',
        price: '$49.99',
        per: 'per user / month',
        highlight: true,
        blurb: 'For small firms that want automation.',
        items: [
          'Auto-tracking agent (documents / email / calls)',
          'Case mapping rules',
          'Timesheet review workflow',
          'Export-ready reports',
        ],
      },
      {
        name: 'Firm',
        price: "Let’s talk",
        per: 'custom',
        blurb: 'For mid-size firms with rollout needs.',
        items: [
          'Firm onboarding + best practices',
          'Admin controls and reporting',
          'Priority support',
          'Custom integrations (optional)',
        ],
      },
    ],
    [],
  );

  return (
    <div className="lp">
      <header className="lp-topbar">
        <button className="lp-logo" type="button" onClick={onLogoClick}>
          ⚖️ <span>LawTrack</span>
        </button>

        <div className="lp-topbar-right">{rightCta}</div>
      </header>

      <div className="lp-tabs">
        <button
          type="button"
          className={`lp-tab ${tab === 'home' ? 'active' : ''}`}
          onClick={() => setTab('home')}
        >
          Home
        </button>
        <button
          type="button"
          className={`lp-tab ${tab === 'pricing' ? 'active' : ''}`}
          onClick={() => setTab('pricing')}
        >
          Pricing
        </button>
      </div>

      {tab === 'home' ? (
        <main className="lp-main">
          <section className="lp-hero">
            <div className="lp-hero-left">
              <h1>Automatic time tracking for lawyers.</h1>
              <p>
                LawTrack captures your work across documents, email, and calls — then helps you
                assign time to cases and keep timesheets clean, fast, and billable.
              </p>
              <div className="lp-hero-cta">
                <div className="lp-pill">Calendar timesheet</div>
                <div className="lp-pill">Case rules</div>
                <div className="lp-pill">Reports</div>
                <div className="lp-pill">Auto-tracking agent</div>
              </div>
            </div>
            <div className="lp-hero-right">
              <div className="lp-card">
                <div className="lp-card-title">What LawTrack does</div>
                <ul className="lp-list">
                  <li>Tracks work in the background (desktop first)</li>
                  <li>Turns activity into clean, editable time entries</li>
                  <li>Auto-assigns time to cases using mapping rules</li>
                  <li>Gives you a Google Calendar-style timesheet</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="lp-features">
            <div className="lp-feature">
              <div className="lp-feature-title">Less admin time</div>
              <div className="lp-feature-body">
                Capture work while it happens so you don’t reconstruct your day later.
              </div>
            </div>
            <div className="lp-feature">
              <div className="lp-feature-title">More billable time</div>
              <div className="lp-feature-body">
                Find and recover time that slips through the cracks.
              </div>
            </div>
            <div className="lp-feature">
              <div className="lp-feature-title">Cleaner narratives</div>
              <div className="lp-feature-body">
                Edit and approve entries quickly with consistent descriptions.
              </div>
            </div>
          </section>
        </main>
      ) : (
        <main className="lp-main">
          <section className="lp-pricing">
            <h2>Pricing</h2>
            <p className="lp-subtitle">Simple plans that scale from solo to firm.</p>
            <div className="lp-pricing-grid">
              {pricing.map(p => (
                <div key={p.name} className={`lp-price-card ${p.highlight ? 'highlight' : ''}`}>
                  <div className="lp-price-name">{p.name}</div>
                  <div className="lp-price">
                    <span className="lp-price-amount">{p.price}</span>
                    <span className="lp-price-per">{p.per}</span>
                  </div>
                  <div className="lp-price-blurb">{p.blurb}</div>
                  <ul className="lp-list">
                    {p.items.map(i => <li key={i}>{i}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </main>
      )}

      <footer className="lp-footer">
        <span>© {new Date().getFullYear()} LawTrack</span>
      </footer>
    </div>
  );
}


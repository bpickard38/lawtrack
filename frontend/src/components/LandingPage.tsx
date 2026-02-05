import { useMemo, useState } from 'react';

type Tab = 'home' | 'pricing';

export default function LandingPage({
  initialTab = 'home',
  rightCta,
  onLogoClick,
  onGetStarted,
}: {
  initialTab?: Tab;
  rightCta: React.ReactNode;
  onLogoClick?: () => void;
  onGetStarted?: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);

  const pricing = useMemo(
    () => [
      {
        name: 'Starter',
        price: '$39',
        per: 'per user / month',
        blurb: 'Spend less time on timesheets — one calendar, all your matters.',
        benefits: [
          'Capture time your way with a simple calendar',
          'Assign entries to cases and run reports by matter',
          'Stop chasing time in spreadsheets; get a single source of truth',
        ],
      },
      {
        name: 'Pro',
        price: '$49.99',
        per: 'per user / month',
        highlight: true,
        popular: true,
        blurb: 'Capture more billable hours without the admin headache.',
        benefits: [
          'Desktop agent tracks documents, email, and calls in the background',
          'Rules auto-assign time to the right matters so you bill accurately',
          'Review, edit, and export — reports ready for billing in one place',
        ],
      },
      {
        name: 'Firm',
        price: "Let's talk",
        per: 'custom',
        blurb: 'Get your whole firm tracking time the right way.',
        benefits: [
          'Dedicated onboarding so everyone adopts best practices',
          'Admin controls and firm-wide reporting',
          'Priority support and optional custom integrations',
        ],
      },
    ],
    [],
  );

  const faqs = useMemo(
    () => [
      {
        q: 'What data does LawTrack collect?',
        a: 'We only capture activity titles and duration (e.g. "Document – draft.docx", "Email – Re: Smith matter", "Zoom call"). We do not read, store, or transmit the content of your documents, emails, or calls.',
      },
      {
        q: 'Where is my data stored?',
        a: 'Your data is stored in secure cloud infrastructure. You can choose the region at signup. We do not sell or share your data with third parties for marketing.',
      },
      {
        q: 'Can I turn off automatic tracking?',
        a: 'Yes. You can quit the desktop agent anytime from the system tray. You can also use manual time entry only (Starter plan) or pause tracking when working on sensitive matters.',
      },
      {
        q: 'How do you handle client confidentiality?',
        a: 'We use titles-only tracking and template descriptions on exports (e.g. "Client correspondence") so invoices stay professional and never expose sensitive content. No email or document content is ever sent to our servers.',
      },
      {
        q: 'Is LawTrack compliant with bar rules?',
        a: 'LawTrack is designed to support accurate timekeeping and client communication. We recommend reviewing your jurisdiction’s rules on technology and confidentiality; we can provide a short security and privacy overview for your firm.',
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

      <nav className="lp-tabs" aria-label="Marketing">
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
      </nav>

      {tab === 'home' ? (
        <main className="lp-main">
          <section className="lp-hero" aria-labelledby="lp-hero-heading">
            <div className="lp-hero-left">
              <h1 id="lp-hero-heading" className="lp-hero-title">Automatic time tracking for lawyers.</h1>
              <p className="lp-hero-subhead">
                Capture work as it happens. Assign time to cases. Keep timesheets clean and billable — without the busywork.
              </p>
              <div className="lp-hero-cta">
                {onGetStarted && (
                  <button type="button" className="lp-cta-primary" onClick={onGetStarted}>
                    Get started
                  </button>
                )}
                <button type="button" className="lp-cta-secondary" onClick={() => setTab('pricing')}>
                  See pricing
                </button>
              </div>
            </div>
            <div className="lp-hero-right">
              <div className="lp-card">
                <div className="lp-card-title">What LawTrack does</div>
                <ul className="lp-list">
                  <li>Tracks work in the background (desktop first)</li>
                  <li>Turns activity into clean, editable time entries</li>
                  <li>Auto-assigns time to cases using mapping rules</li>
                  <li>Gives you a Google Calendar–style timesheet</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="lp-how" aria-labelledby="lp-how-heading">
            <h2 id="lp-how-heading" className="lp-section-title">How it works</h2>
            <ol className="lp-how-steps">
              <li>
                <span className="lp-how-num">1</span>
                <span className="lp-how-title">Install the agent</span>
                <span className="lp-how-desc">Run the desktop app and sign in. It runs in the background and records which apps you use and for how long.</span>
              </li>
              <li>
                <span className="lp-how-num">2</span>
                <span className="lp-how-title">Set rules & review</span>
                <span className="lp-how-desc">Define rules to auto-assign time to cases. Review and edit entries on your timesheet before they become billable.</span>
              </li>
              <li>
                <span className="lp-how-num">3</span>
                <span className="lp-how-title">Export & bill</span>
                <span className="lp-how-desc">Run reports by case and date. Export to PDF for invoices — clean descriptions, no sensitive content.</span>
              </li>
            </ol>
          </section>

          <section className="lp-features" aria-labelledby="lp-features-heading">
            <h2 id="lp-features-heading" className="lp-visually-hidden">Benefits</h2>
            <div className="lp-feature">
              <div className="lp-feature-title">Less admin time</div>
              <div className="lp-feature-body">Capture work while it happens so you don’t reconstruct your day later.</div>
            </div>
            <div className="lp-feature">
              <div className="lp-feature-title">More billable time</div>
              <div className="lp-feature-body">Find and recover time that slips through the cracks.</div>
            </div>
            <div className="lp-feature">
              <div className="lp-feature-title">Cleaner narratives</div>
              <div className="lp-feature-body">Edit and approve entries quickly with consistent descriptions.</div>
            </div>
          </section>

          <section className="lp-screenshot" aria-labelledby="lp-screenshot-heading">
            <h2 id="lp-screenshot-heading" className="lp-section-title">Your timesheet, one place</h2>
            <p className="lp-section-sub">Calendar view, case assignment, and export-ready reports.</p>
            <div className="lp-screenshot-placeholder">
              <div className="lp-screenshot-inner">
                <span className="lp-screenshot-label">App screenshot</span>
                <div className="lp-screenshot-mock">
                  <div className="lp-mock-bar" />
                  <div className="lp-mock-grid">
                    <div className="lp-mock-row" /><div className="lp-mock-row" /><div className="lp-mock-row" />
                    <div className="lp-mock-row" /><div className="lp-mock-row" /><div className="lp-mock-row" />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="lp-privacy" aria-labelledby="lp-privacy-heading">
            <h2 id="lp-privacy-heading" className="lp-section-title">Privacy-first</h2>
            <p className="lp-privacy-lead">We only capture titles and duration — never the body of emails, documents, or calls.</p>
            <ul className="lp-trust-list">
              <li><strong>Titles only.</strong> Activity names and how long you spent (e.g. "Email – Re: Smith matter", "draft.docx"). No content is read, stored, or sent to our servers.</li>
              <li><strong>You stay in control.</strong> Review, edit, or delete any entry. Exports use template descriptions (e.g. “Client correspondence”) so nothing sensitive appears on invoices.</li>
              <li><strong>Built for law.</strong> Designed so you can keep time accurately and stay within confidentiality and technology rules.</li>
            </ul>
          </section>

          <section className="lp-integrations" aria-labelledby="lp-integrations-heading">
            <h2 id="lp-integrations-heading" className="lp-section-title">Works with how you work</h2>
            <div className="lp-integrations-row">
              <span className="lp-integration-item"><span className="lp-integration-icon" aria-hidden>📧</span> Gmail</span>
              <span className="lp-integration-item"><span className="lp-integration-icon" aria-hidden>📬</span> Outlook</span>
              <span className="lp-integration-item"><span className="lp-integration-icon" aria-hidden>📄</span> Word</span>
              <span className="lp-integration-item"><span className="lp-integration-icon" aria-hidden>🎥</span> Zoom</span>
              <span className="lp-integration-item"><span className="lp-integration-icon" aria-hidden>📁</span> Dropbox</span>
            </div>
            <p className="lp-integrations-note">Desktop agent detects these and similar apps; we only record app/window title and duration.</p>
          </section>
        </main>
      ) : (
        <main className="lp-main">
          <section className="lp-pricing" aria-labelledby="lp-pricing-heading">
            <h2 id="lp-pricing-heading">Pricing</h2>
            <p className="lp-subtitle">Simple plans that scale from solo to firm.</p>
            <div className="lp-pricing-grid">
              {pricing.map((p) => (
                <div key={p.name} className={`lp-price-card ${p.highlight ? 'highlight' : ''}`}>
                  {p.popular && <div className="lp-price-badge">Most popular</div>}
                  <div className="lp-price-name">{p.name}</div>
                  <div className="lp-price">
                    <span className="lp-price-amount">{p.price}</span>
                    <span className="lp-price-per">{p.per}</span>
                  </div>
                  <div className="lp-price-blurb">{p.blurb}</div>
                  <ul className="lp-list">
                    {p.benefits.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                  {onGetStarted && (
                    <button type="button" className={p.highlight ? 'lp-cta-primary lp-price-cta' : 'lp-cta-secondary lp-price-cta'} onClick={onGetStarted}>
                      Get started
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="lp-faq" aria-labelledby="lp-faq-heading">
            <h2 id="lp-faq-heading" className="lp-section-title">Frequently asked questions</h2>
            <dl className="lp-faq-list">
              {faqs.map((faq) => (
                <div key={faq.q} className="lp-faq-item">
                  <dt className="lp-faq-q">{faq.q}</dt>
                  <dd className="lp-faq-a">{faq.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        </main>
      )}

      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <span>© {new Date().getFullYear()} LawTrack</span>
          <div className="lp-footer-links">
            <a href="#" className="lp-footer-link">Privacy</a>
            <a href="#" className="lp-footer-link">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

import { useMemo, useState } from 'react';

type Tab = 'home' | 'pricing' | 'contact';

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
        price: '$29',
        per: 'per user / month',
        blurb: 'Everything you need to keep timesheets clean and accurate.',
        cta: 'Get started',
        features: [
          'All Free features',
          'Unlimited cases',
          'PDF invoice export',
          'Date range reports',
          'Case time breakdowns',
          'Email support',
        ],
      },
      {
        name: 'Pro',
        price: '$49',
        per: 'per user / month',
        highlight: true,
        blurb: 'Capture every billable hour automatically in the background.',
        cta: 'Get started',
        features: [
          'All Starter features',
          'Desktop agent (auto-tracking)',
          'Auto-assignment rules',
          'Activity type breakdown',
          'Agent API key',
          'Priority email support',
        ],
      },
      {
        name: 'Firm',
        price: 'Custom',
        per: 'annual billing',
        blurb: 'Get your whole firm tracking time the right way.',
        cta: 'Contact us',
        features: [
          'All Pro features',
          'Admin dashboard',
          'Firm-wide reporting',
          'Dedicated onboarding',
          'Priority support + SLA',
          'Custom integrations',
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
        a: 'Yes. You can quit the desktop agent anytime from the system tray. You can also use manual time entry only (Free or Starter plan) or pause tracking when working on sensitive matters.',
      },
      {
        q: 'How do you handle client confidentiality?',
        a: 'We use titles-only tracking and template descriptions on exports (e.g. "Client correspondence") so invoices stay professional and never expose sensitive content. No email or document content is ever sent to our servers.',
      },
      {
        q: 'Is LawTrack compliant with bar rules?',
        a: "LawTrack is designed to support accurate timekeeping and client communication. We recommend reviewing your jurisdiction's rules on technology and confidentiality; we can provide a short security and privacy overview for your firm.",
      },
    ],
    [],
  );

  return (
    <div className="lp">
      <header className="lp-topbar">
        <button className="lp-logo" type="button" onClick={onLogoClick} aria-label="LawTrack home">
          <img src="/logo.jpg" alt="" className="lp-logo-symbol" />
          <span className="lp-logo-wordmark">LawTrack</span>
        </button>
        <nav className="lp-nav" aria-label="Marketing">
          <button
            type="button"
            className={`lp-nav-link ${tab === 'home' ? 'active' : ''}`}
            onClick={() => setTab('home')}
          >
            Product
          </button>
          <button
            type="button"
            className={`lp-nav-link ${tab === 'pricing' ? 'active' : ''}`}
            onClick={() => setTab('pricing')}
          >
            Pricing
          </button>
          <button
            type="button"
            className={`lp-nav-link ${tab === 'contact' ? 'active' : ''}`}
            onClick={() => setTab('contact')}
          >
            Contact
          </button>
        </nav>
        <div className="lp-topbar-right">{rightCta}</div>
      </header>

      {tab === 'home' ? (
        <main className="lp-main">
          <section className="lp-hero" aria-labelledby="lp-hero-heading">
            <div className="lp-hero-badge">Built for legal professionals</div>
            <h1 id="lp-hero-heading" className="lp-hero-title">
              Automatic time tracking<br />for lawyers.
            </h1>
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
                See pricing →
              </button>
            </div>
            <div className="lp-hero-features">
              <span>✓ Background activity tracking</span>
              <span>✓ Auto-assignment to cases</span>
              <span>✓ Export-ready billing reports</span>
            </div>
          </section>

          <section className="lp-how" aria-labelledby="lp-how-heading">
            <div className="lp-section-header">
              <div className="lp-section-label">How it works</div>
              <h2 id="lp-how-heading" className="lp-section-title">From install to invoice<br />in three steps.</h2>
            </div>
            <div className="lp-how-bento">
              {/* Step 1 — hero tile */}
              <div className="lp-bento-item lp-bento-hero">
                <div className="lp-mock-tray">
                  <div className="lp-mock-tray-bar">
                    <span>⚖</span>
                    <span>LawTrack</span>
                    <span className="lp-mock-tray-dot" />
                    <span className="lp-mock-tray-status">Tracking</span>
                  </div>
                  <div className="lp-mock-tray-items">
                    <div className="lp-mock-tray-item">
                      <span className="lp-mock-item-icon">📄</span>
                      <span>draft_agreement.docx</span>
                      <span className="lp-mock-item-time">0:42</span>
                    </div>
                    <div className="lp-mock-tray-item">
                      <span className="lp-mock-item-icon">📧</span>
                      <span>Re: Smith Matter</span>
                      <span className="lp-mock-item-time">0:18</span>
                    </div>
                  </div>
                </div>
                <div className="lp-bento-content">
                  <span className="lp-how-num">1</span>
                  <span className="lp-how-title">Install the agent</span>
                  <span className="lp-how-desc">Run the desktop app and sign in. It runs in the background and records which apps you use and for how long.</span>
                </div>
              </div>
              {/* Step 2 */}
              <div className="lp-bento-item">
                <div className="lp-mock-rules">
                  <div className="lp-mock-rule-item">
                    <span className="lp-mock-rule-label">IF</span>
                    <span className="lp-mock-rule-cond">"Smith" in filename</span>
                    <span className="lp-mock-rule-arrow">→</span>
                    <span className="lp-mock-rule-result">Smith v. Jones</span>
                    <div className="lp-mock-toggle lp-mock-toggle-on" />
                  </div>
                  <div className="lp-mock-rule-item">
                    <span className="lp-mock-rule-label">IF</span>
                    <span className="lp-mock-rule-cond">from @acme.com</span>
                    <span className="lp-mock-rule-arrow">→</span>
                    <span className="lp-mock-rule-result">Acme Corp</span>
                    <div className="lp-mock-toggle" />
                  </div>
                </div>
                <div className="lp-bento-content">
                  <span className="lp-how-num">2</span>
                  <span className="lp-how-title">Set rules & review</span>
                  <span className="lp-how-desc">Define rules to auto-assign time to cases. Review and edit entries on your timesheet before they become billable.</span>
                </div>
              </div>
              {/* Step 3 */}
              <div className="lp-bento-item">
                <div className="lp-mock-timeline">
                  <div className="lp-mock-tl-row">
                    <div className="lp-mock-tl-bar lp-tl-doc" style={{width: '62%'}} />
                    <span className="lp-mock-tl-label">Draft agreement</span>
                    <span className="lp-mock-tl-dur">1.2h</span>
                  </div>
                  <div className="lp-mock-tl-row">
                    <div className="lp-mock-tl-bar lp-tl-email" style={{width: '38%'}} />
                    <span className="lp-mock-tl-label">Client correspondence</span>
                    <span className="lp-mock-tl-dur">0.5h</span>
                  </div>
                  <div className="lp-mock-tl-row">
                    <div className="lp-mock-tl-bar lp-tl-call" style={{width: '22%'}} />
                    <span className="lp-mock-tl-label">Zoom call</span>
                    <span className="lp-mock-tl-dur">0.3h</span>
                  </div>
                  <button className="lp-mock-export-btn" type="button">Export PDF ↓</button>
                </div>
                <div className="lp-bento-content">
                  <span className="lp-how-num">3</span>
                  <span className="lp-how-title">Export & bill</span>
                  <span className="lp-how-desc">Run reports by case and date. Export to PDF for invoices — clean descriptions, no sensitive content.</span>
                </div>
              </div>
            </div>
          </section>

          <section className="lp-features-section" aria-labelledby="lp-features-heading">
            <div className="lp-section-header">
              <div className="lp-section-label">Benefits</div>
              <h2 id="lp-features-heading" className="lp-section-title">Everything you need,<br />nothing you don't.</h2>
            </div>
            <div className="lp-features-grid">
              <div className="lp-feature-card">
                <div className="lp-feature-icon">⏱</div>
                <div className="lp-feature-title">Less admin time</div>
                <div className="lp-feature-body">Capture work while it happens so you don't reconstruct your day at 5pm.</div>
              </div>
              <div className="lp-feature-card">
                <div className="lp-feature-icon">💰</div>
                <div className="lp-feature-title">More billable time</div>
                <div className="lp-feature-body">Find and recover time that slips through the cracks between meetings and documents.</div>
              </div>
              <div className="lp-feature-card">
                <div className="lp-feature-icon">📋</div>
                <div className="lp-feature-title">Cleaner narratives</div>
                <div className="lp-feature-body">Edit and approve entries quickly with consistent, professional descriptions.</div>
              </div>
              <div className="lp-feature-card">
                <div className="lp-feature-icon">🔒</div>
                <div className="lp-feature-title">Privacy-first</div>
                <div className="lp-feature-body">Only window titles and duration are captured. No document content ever leaves your machine.</div>
              </div>
              <div className="lp-feature-card">
                <div className="lp-feature-icon">⚡</div>
                <div className="lp-feature-title">Auto-assignment</div>
                <div className="lp-feature-body">Rules match activity to cases automatically, so your timesheet fills itself.</div>
              </div>
              <div className="lp-feature-card">
                <div className="lp-feature-icon">📊</div>
                <div className="lp-feature-title">Export-ready reports</div>
                <div className="lp-feature-body">One click to generate a clean PDF invoice — broken down by case and activity type.</div>
              </div>
            </div>
          </section>

          <section className="lp-screenshot" aria-labelledby="lp-screenshot-heading">
            <div className="lp-section-header lp-section-header-center">
              <div className="lp-section-label">The app</div>
              <h2 id="lp-screenshot-heading" className="lp-section-title">Your timesheet,<br />one place.</h2>
              <p className="lp-section-sub">Calendar view, case assignment, and export-ready reports — all in one clean interface.</p>
            </div>
            <div className="lp-screenshot-placeholder">
              <div className="lp-screenshot-inner">
                <div className="lp-screenshot-mock">
                  <div className="lp-mock-bar">
                    <div className="lp-mock-bar-tabs">
                      <span className="lp-mock-bar-tab active">Timesheet</span>
                      <span className="lp-mock-bar-tab">Reports</span>
                      <span className="lp-mock-bar-tab">Rules</span>
                    </div>
                  </div>
                  <div className="lp-mock-app-body">
                    <div className="lp-mock-sidebar">
                      <div className="lp-mock-sidebar-item active">Mon 24</div>
                      <div className="lp-mock-sidebar-item">Tue 25</div>
                      <div className="lp-mock-sidebar-item">Wed 26</div>
                      <div className="lp-mock-sidebar-item">Thu 27</div>
                      <div className="lp-mock-sidebar-item">Fri 28</div>
                    </div>
                    <div className="lp-mock-calendar">
                      <div className="lp-mock-cal-entry lp-tl-doc">Draft agreement — Smith v. Jones · 1.2h</div>
                      <div className="lp-mock-cal-entry lp-tl-email">Client correspondence — Acme Corp · 0.5h</div>
                      <div className="lp-mock-cal-entry lp-tl-call">Zoom call — Initial consultation · 0.3h</div>
                      <div className="lp-mock-cal-entry lp-tl-doc" style={{opacity: 0.5}}>Review contract — Johnson LLC · 0.8h</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="lp-privacy" aria-labelledby="lp-privacy-heading">
            <div className="lp-privacy-inner">
              <div className="lp-privacy-left">
                <div className="lp-section-label">Security & privacy</div>
                <h2 id="lp-privacy-heading" className="lp-section-title">Privacy-first,<br />by design.</h2>
                <p className="lp-privacy-lead">We only capture titles and duration — never the body of emails, documents, or calls.</p>
              </div>
              <ul className="lp-trust-list">
                <li>
                  <div className="lp-trust-icon">✓</div>
                  <div>
                    <strong>Titles only.</strong> Activity names and how long you spent (e.g. "Email – Re: Smith matter"). No content is read, stored, or sent to our servers.
                  </div>
                </li>
                <li>
                  <div className="lp-trust-icon">✓</div>
                  <div>
                    <strong>You stay in control.</strong> Review, edit, or delete any entry. Exports use template descriptions so nothing sensitive appears on invoices.
                  </div>
                </li>
                <li>
                  <div className="lp-trust-icon">✓</div>
                  <div>
                    <strong>Built for law.</strong> Designed so you can keep time accurately and stay within confidentiality and technology rules.
                  </div>
                </li>
              </ul>
            </div>
          </section>

          <section className="lp-integrations" aria-labelledby="lp-integrations-heading">
            <h2 id="lp-integrations-heading" className="lp-integrations-title">Works with how you work</h2>
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
      ) : tab === 'pricing' ? (
        <main className="lp-main">
          <section className="lp-pricing" aria-labelledby="lp-pricing-heading">
            <div className="lp-pricing-header">
              <h1 id="lp-pricing-heading" className="lp-pricing-title">Pricing</h1>
              <p className="lp-pricing-sub">Simple, transparent pricing. No hidden fees.</p>
            </div>

            <div className="lp-pricing-table">
              {pricing.map((p) => (
                <div key={p.name} className={`lp-pricing-col ${p.highlight ? 'highlight' : ''}`}>
                  <div className="lp-pricing-col-top">
                    <div className="lp-pricing-tier-name">{p.name}</div>
                    <div className="lp-pricing-tier-price">
                      <span className="lp-pricing-tier-amount">{p.price}</span>
                    </div>
                    {p.per && <div className="lp-pricing-tier-per">{p.per}</div>}
                    <button
                      type="button"
                      className={p.highlight ? 'lp-cta-primary lp-pricing-col-cta' : 'lp-cta-secondary lp-pricing-col-cta'}
                      onClick={p.name === 'Firm' ? () => setTab('contact') : onGetStarted}
                    >
                      {p.cta}
                    </button>
                  </div>
                  <div className="lp-pricing-col-divider" />
                  <ul className="lp-pricing-features">
                    {p.features.map((f) => (
                      <li key={f}>
                        <span className="lp-pricing-check">✓</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
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
      ) : (
        <main className="lp-main">
          <section className="lp-contact" aria-labelledby="lp-contact-heading">
            <div className="lp-contact-inner">
              <div className="lp-section-label">Contact</div>
              <h1 id="lp-contact-heading" className="lp-pricing-title">Get in touch</h1>
              <p className="lp-pricing-sub">Questions about pricing, firm plans, or integrations? We'd love to hear from you.</p>
              <div className="lp-contact-options">
                <a className="lp-contact-card" href="mailto:hello@lawtrack.io">
                  <div className="lp-contact-card-icon">✉</div>
                  <div className="lp-contact-card-label">Email us</div>
                  <div className="lp-contact-card-value">hello@lawtrack.io</div>
                </a>
                <div className="lp-contact-card" onClick={() => setTab('pricing')} style={{cursor: 'pointer'}}>
                  <div className="lp-contact-card-icon">💼</div>
                  <div className="lp-contact-card-label">Firm plans</div>
                  <div className="lp-contact-card-value">Custom pricing for teams →</div>
                </div>
              </div>
            </div>
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

export default function Privacy({ onOpenProfile }: { onOpenProfile: () => void }) {
  return (
    <div className="privacy-view">
      <div className="view-header">
        <h2>Privacy &amp; Controls</h2>
      </div>

      <section className="privacy-section">
        <h3 className="privacy-section-title">Privacy-first by design</h3>
        <p className="privacy-section-p">
          LawTrack is built so you can track time accurately without exposing client confidences.
          We capture only what’s needed for timesheets and billing—titles and duration—and never
          the content of documents, emails, or calls.
        </p>
      </section>

      <section className="privacy-section">
        <h3 className="privacy-section-title">What we capture</h3>
        <ul className="privacy-list">
          <li>Activity titles (e.g. document name, email subject, call or app name)</li>
          <li>Duration (how long you spent)</li>
          <li>Timestamps and assignment to cases (when you assign or rules match)</li>
        </ul>
      </section>

      <section className="privacy-section">
        <h3 className="privacy-section-title">What we never capture</h3>
        <ul className="privacy-list">
          <li>Body or content of emails</li>
          <li>Content of documents or files</li>
          <li>Call audio, transcripts, or content</li>
          <li>Anything you type or paste outside of LawTrack</li>
        </ul>
      </section>

      <section className="privacy-section">
        <h3 className="privacy-section-title">Data retention</h3>
        <p className="privacy-section-p">
          Your activity data is retained for as long as your account is active. If you delete your
          account, your data is removed in line with our data handling processes.
        </p>
      </section>

      <section className="privacy-section">
        <h3 className="privacy-section-title">Controls</h3>
        <p className="privacy-section-p">
          <button type="button" className="privacy-link-btn" onClick={onOpenProfile}>
            Manage desktop agent (create or revoke API key)
          </button>
          — available in Profile.
        </p>
        <p className="privacy-section-p privacy-coming-soon">
          Pause tracking from this app — Coming soon.
        </p>
      </section>
    </div>
  );
}

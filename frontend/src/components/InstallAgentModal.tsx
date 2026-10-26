import { useEffect } from 'react';
import { AGENT_INSTALLER_URL } from '../api';

interface InstallAgentModalProps {
  isDemo: boolean;
  onClose: () => void;
}

export default function InstallAgentModal({ isDemo, onClose }: InstallAgentModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="ts-modal-overlay" onClick={onClose}>
      <div
        className="ts-modal install-agent-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-agent-title"
        onClick={e => e.stopPropagation()}
      >
        <h3 id="install-agent-title">Install the LawTrack desktop app?</h3>
        <p>
          The desktop app runs quietly in your system tray and records the documents, emails and calls you work on,
          so your timesheet fills itself in.
        </p>
        <ol>
          <li>Download and run the installer (Windows 10 or 11).</li>
          <li>Sign in with your LawTrack email and password.</li>
          <li>Work as usual. Captured time appears on your Today page for review.</li>
        </ol>
        {isDemo && (
          <p className="install-agent-note">
            The desktop app can't connect to the shared demo account. Create your own free account to try it with live
            tracking.
          </p>
        )}
        <div className="ts-form-actions">
          <span />
          <div className="ts-form-actions-right">
            <button type="button" className="ts-btn-cancel" onClick={onClose}>
              Not now
            </button>
            <a className="ts-btn-save install-agent-download" href={AGENT_INSTALLER_URL} download onClick={onClose}>
              Download for Windows
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

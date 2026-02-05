import { useState, useEffect } from 'react';
import { fetchCaseRules } from '../api';

const STORAGE_KEYS = {
  dismissed: 'lawtrack_onboardingDismissed',
  hasFirstActivity: 'lawtrack_hasFirstActivity',
  hasExported: 'lawtrack_hasExported',
  hasClickedInstall: 'lawtrack_hasClickedInstall',
} as const;

function getStored(key: keyof typeof STORAGE_KEYS): boolean {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function setStored(key: keyof typeof STORAGE_KEYS, value: boolean) {
  try {
    if (value) localStorage.setItem(key, 'true');
    else localStorage.removeItem(key);
  } catch {}
}

export interface OnboardingStatus {
  installAgent: boolean;
  addCase: boolean;
  createRule: boolean;
  captureActivity: boolean;
  exportInvoice: boolean;
}

export function getOnboardingStatus(
  casesCount: number,
  rulesCount: number,
  hasFirstActivityStored: boolean,
  hasExportedStored: boolean,
  hasClickedInstallStored: boolean
): OnboardingStatus {
  return {
    installAgent: hasClickedInstallStored,
    addCase: casesCount >= 1,
    createRule: rulesCount >= 1,
    captureActivity: hasFirstActivityStored,
    exportInvoice: hasExportedStored,
  };
}

function isOnboardingComplete(status: OnboardingStatus): boolean {
  return (
    status.installAgent &&
    status.addCase &&
    status.createRule &&
    status.captureActivity &&
    status.exportInvoice
  );
}

export interface OnboardingChecklistProps {
  casesCount: number;
  /** When true, treat "capture first activity" as complete (so it updates without remount when user adds activity this week). */
  hasFirstActivity?: boolean;
  installAppUrl?: string;
  onNavigateToReports: () => void;
  onNavigateToRules: () => void;
  onDismiss: () => void;
}

export default function OnboardingChecklist({
  casesCount,
  hasFirstActivity: hasFirstActivityProp,
  installAppUrl,
  onNavigateToReports,
  onNavigateToRules,
  onDismiss,
}: OnboardingChecklistProps) {
  const [dismissed, setDismissed] = useState(() => getStored('dismissed'));
  const [rulesCount, setRulesCount] = useState(0);
  const [hasFirstActivityStored, setHasFirstActivityStored] = useState(() => getStored('hasFirstActivity'));
  const hasFirstActivity = hasFirstActivityProp === true || hasFirstActivityStored;
  const [hasExported, setHasExported] = useState(() => getStored('hasExported'));
  const [hasClickedInstall, setHasClickedInstall] = useState(() => getStored('hasClickedInstall'));

  useEffect(() => {
    if (dismissed) return;
    let cancelled = false;
    fetchCaseRules()
      .then((rules) => { if (!cancelled) setRulesCount(rules.length); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [dismissed]);

  const status = getOnboardingStatus(
    casesCount,
    rulesCount,
    hasFirstActivity,
    hasExported,
    hasClickedInstall
  );
  const complete = isOnboardingComplete(status);

  const handleDismiss = () => {
    setStored('dismissed', true);
    setDismissed(true);
    onDismiss();
  };

  const handleInstallClick = () => {
    setStored('hasClickedInstall', true);
    setHasClickedInstall(true);
  };

  if (dismissed || complete) return null;

  return (
    <div className="onboarding-checklist">
      <div className="onboarding-checklist-header">
        <h3 className="onboarding-checklist-title">Get started</h3>
        <button
          type="button"
          className="onboarding-checklist-dismiss"
          onClick={handleDismiss}
          aria-label="Dismiss checklist"
        >
          ×
        </button>
      </div>
      <ol className="onboarding-checklist-steps">
        <li className={status.installAgent ? 'onboarding-step done' : 'onboarding-step'}>
          {status.installAgent ? (
            <span className="onboarding-step-label">✓ Install desktop agent</span>
          ) : installAppUrl ? (
            <a
              href={installAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="onboarding-step-link"
              onClick={handleInstallClick}
            >
              Install desktop agent
            </a>
          ) : (
            <a href="/install" className="onboarding-step-link" onClick={handleInstallClick}>
              Install desktop agent
            </a>
          )}
        </li>
        <li className={status.addCase ? 'onboarding-step done' : 'onboarding-step'}>
          {status.addCase ? (
            <span className="onboarding-step-label">✓ Add first case</span>
          ) : (
            <button type="button" className="onboarding-step-btn" onClick={onNavigateToReports}>
              Add first case
            </button>
          )}
        </li>
        <li className={status.createRule ? 'onboarding-step done' : 'onboarding-step'}>
          {status.createRule ? (
            <span className="onboarding-step-label">✓ Create first rule</span>
          ) : (
            <button type="button" className="onboarding-step-btn" onClick={onNavigateToRules}>
              Create first rule
            </button>
          )}
        </li>
        <li className={status.captureActivity ? 'onboarding-step done' : 'onboarding-step'}>
          {status.captureActivity ? (
            <span className="onboarding-step-label">✓ Capture first activity</span>
          ) : (
            <span className="onboarding-step-label">
              Capture first activity — click a time slot below or use the desktop agent
            </span>
          )}
        </li>
        <li className={status.exportInvoice ? 'onboarding-step done' : 'onboarding-step'}>
          {status.exportInvoice ? (
            <span className="onboarding-step-label">✓ Export invoice</span>
          ) : (
            <button type="button" className="onboarding-step-btn" onClick={onNavigateToReports}>
              Export invoice — Reports → Export Invoice PDF
            </button>
          )}
        </li>
      </ol>
    </div>
  );
}

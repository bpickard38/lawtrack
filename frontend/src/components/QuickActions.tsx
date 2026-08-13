export interface QuickActionsProps {
  onNewCase: () => void;
  onNewRule: () => void;
  onLogActivity: () => void;
}

/** Persistent shortcuts for the three things attorneys actually do repeatedly -
 * not a one-time onboarding checklist. Always visible, no completion state. */
export default function QuickActions({ onNewCase, onNewRule, onLogActivity }: QuickActionsProps) {
  return (
    <div className="quick-actions">
      <button type="button" className="quick-action-btn" onClick={onNewCase}>
        + New case
      </button>
      <button type="button" className="quick-action-btn" onClick={onNewRule}>
        + New rule
      </button>
      <button type="button" className="quick-action-btn" onClick={onLogActivity}>
        + Log activity
      </button>
    </div>
  );
}

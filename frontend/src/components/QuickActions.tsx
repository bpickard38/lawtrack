export interface QuickActionsProps {
  onNewCase: () => void;
  onNewRule: () => void;
  onLogActivity: () => void;
}

/** Persistent shortcuts for the three things attorneys actually do repeatedly -
 * not a one-time onboarding checklist. Always visible, no completion state. */
export default function QuickActions({ onNewCase, onNewRule, onLogActivity }: QuickActionsProps) {
  // "New case" opens the add-case form on the Reports view (where cases are managed) -
  // it does not create a case itself, so onNewCase must actually land the user there
  // with the form open, not just navigate to Reports.
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

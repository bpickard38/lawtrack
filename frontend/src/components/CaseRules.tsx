import { useState, useEffect } from 'react';
import type { CaseRule, Case, RuleType } from '../types';
import { fetchCaseRules, createCaseRule, updateCaseRule, deleteCaseRule, testCaseRules } from '../api';

interface CaseRulesProps {
  cases: Case[];
  onRulesChanged?: () => void;
}

const RULE_TYPES: { value: RuleType; label: string; description: string }[] = [
  { value: 'document_contains', label: 'Document name contains', description: 'Match when document/file name contains this text' },
  { value: 'email_subject_contains', label: 'Email subject contains', description: 'Match when email subject contains this text' },
  { value: 'email_from_contains', label: 'Email from contains', description: 'Match when sender email contains this text' },
  { value: 'email_domain_equals', label: 'Email domain equals', description: 'Match when sender domain equals this exactly (e.g., "acme.com")' },
  { value: 'contact_name_contains', label: 'Contact name contains', description: 'Match when call contact name contains this text' },
  { value: 'description_contains', label: 'Description contains', description: 'Match when activity description contains this text' },
];

export default function CaseRules({ cases, onRulesChanged }: CaseRulesProps) {
  const [rules, setRules] = useState<CaseRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<CaseRule | null>(null);

  // Form state
  const [formCaseId, setFormCaseId] = useState<string>('');
  const [formRuleType, setFormRuleType] = useState<RuleType>('document_contains');
  const [formPattern, setFormPattern] = useState('');
  const [formPriority, setFormPriority] = useState(0);
  const [formEnabled, setFormEnabled] = useState(true);

  // Test state
  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState<{ matched: boolean; case_name: string | null } | null>(null);

  useEffect(() => {
    loadRules();
  }, []);

  async function loadRules() {
    try {
      const data = await fetchCaseRules();
      setRules(data);
    } catch (error) {
      console.error('Error loading rules:', error);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setFormCaseId('');
    setFormRuleType('document_contains');
    setFormPattern('');
    setFormPriority(0);
    setFormEnabled(true);
    setEditingRule(null);
  }

  function startEdit(rule: CaseRule) {
    setEditingRule(rule);
    setFormCaseId(rule.case_id.toString());
    setFormRuleType(rule.rule_type);
    setFormPattern(rule.pattern);
    setFormPriority(rule.priority);
    setFormEnabled(rule.enabled);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formCaseId || !formPattern.trim()) {
      alert('Please select a case and enter a pattern');
      return;
    }

    try {
      if (editingRule) {
        await updateCaseRule(editingRule.id, {
          case_id: parseInt(formCaseId),
          rule_type: formRuleType,
          pattern: formPattern.trim(),
          priority: formPriority,
          enabled: formEnabled,
        });
      } else {
        await createCaseRule({
          case_id: parseInt(formCaseId),
          rule_type: formRuleType,
          pattern: formPattern.trim(),
          priority: formPriority,
          enabled: formEnabled,
        });
      }
      resetForm();
      setShowForm(false);
      loadRules();
      onRulesChanged?.();
    } catch (error) {
      alert('Error saving rule: ' + (error as Error).message);
    }
  }

  async function handleDelete(ruleId: number) {
    if (!confirm('Delete this rule?')) return;
    try {
      await deleteCaseRule(ruleId);
      loadRules();
      onRulesChanged?.();
    } catch (error) {
      alert('Error deleting rule: ' + (error as Error).message);
    }
  }

  async function handleToggleEnabled(rule: CaseRule) {
    try {
      await updateCaseRule(rule.id, { enabled: !rule.enabled });
      loadRules();
    } catch (error) {
      alert('Error updating rule: ' + (error as Error).message);
    }
  }

  async function handleTest() {
    if (!testInput.trim()) return;
    try {
      // Test as document name by default
      const result = await testCaseRules({
        document_name: testInput,
        email_subject: testInput,
        email_from: testInput,
        contact_name: testInput,
        description: testInput,
      });
      setTestResult(result);
    } catch (error) {
      alert('Error testing rules: ' + (error as Error).message);
    }
  }

  function getCaseName(caseId: number) {
    return cases.find(c => c.id === caseId)?.name || 'Unknown';
  }

  function getRuleTypeLabel(type: RuleType) {
    return RULE_TYPES.find(t => t.value === type)?.label || type;
  }

  if (loading) {
    return <div className="loading">Loading rules...</div>;
  }

  return (
    <div className="case-rules">
      <div className="rules-header">
        <h3>Case Assignment Rules</h3>
        <p className="rules-description">
          Rules automatically assign new activities to cases based on patterns. Priority: higher number = checked first.
        </p>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="add-rule-btn">
          + Add Rule
        </button>
      </div>

      {/* Test section */}
      <div className="rules-test">
        <input
          type="text"
          placeholder="Test: enter text to see which case it matches..."
          value={testInput}
          onChange={e => { setTestInput(e.target.value); setTestResult(null); }}
          onKeyDown={e => e.key === 'Enter' && handleTest()}
        />
        <button onClick={handleTest}>Test</button>
        {testResult && (
          <span className={`test-result ${testResult.matched ? 'matched' : 'no-match'}`}>
            {testResult.matched ? `→ ${testResult.case_name}` : 'No match'}
          </span>
        )}
      </div>

      {/* Rules list */}
      {rules.length === 0 ? (
        <div className="no-rules">
          <p className="no-rules-message">No rules yet. Create a rule to auto-assign activities to cases.</p>
          <p className="no-rules-examples">Example patterns: client or matter name (e.g. <em>Smith</em>, <em>contract</em>), or email domain (e.g. <em>@client.com</em>).</p>
        </div>
      ) : (
        <div className="rules-list">
          {rules.map(rule => (
            <div key={rule.id} className={`rule-item ${rule.enabled ? '' : 'disabled'}`}>
              <div className="rule-main">
                <span className="rule-priority">#{rule.priority}</span>
                <span className="rule-type">{getRuleTypeLabel(rule.rule_type)}</span>
                <span className="rule-pattern">"{rule.pattern}"</span>
                <span className="rule-arrow">→</span>
                <span className="rule-case">{getCaseName(rule.case_id)}</span>
              </div>
              <div className="rule-actions">
                <button
                  onClick={() => handleToggleEnabled(rule)}
                  className={`toggle-btn ${rule.enabled ? 'on' : 'off'}`}
                >
                  {rule.enabled ? 'ON' : 'OFF'}
                </button>
                <button onClick={() => startEdit(rule)} className="edit-btn">Edit</button>
                <button onClick={() => handleDelete(rule.id)} className="delete-btn">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit form modal */}
      {showForm && (
        <div className="rule-form-overlay">
          <div className="rule-form">
            <h3>{editingRule ? 'Edit Rule' : 'Add Rule'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Assign to Case *</label>
                <select value={formCaseId} onChange={e => setFormCaseId(e.target.value)} required>
                  <option value="">Select case...</option>
                  {cases.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Rule Type *</label>
                <select value={formRuleType} onChange={e => setFormRuleType(e.target.value as RuleType)}>
                  {RULE_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <small>{RULE_TYPES.find(t => t.value === formRuleType)?.description}</small>
              </div>

              <div className="form-group">
                <label>Pattern * (case-insensitive)</label>
                <input
                  type="text"
                  value={formPattern}
                  onChange={e => setFormPattern(e.target.value)}
                  placeholder="e.g., acme, contract, @client.com"
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Priority</label>
                  <input
                    type="number"
                    value={formPriority}
                    onChange={e => setFormPriority(parseInt(e.target.value) || 0)}
                    min={0}
                    max={100}
                  />
                  <small>Higher number = checked first when multiple rules could match.</small>
                </div>

                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={formEnabled}
                      onChange={e => setFormEnabled(e.target.checked)}
                    />
                    {' '}Enabled
                  </label>
                </div>
              </div>

              <div className="form-actions">
                <button type="button" onClick={() => { resetForm(); setShowForm(false); }} className="cancel-btn">
                  Cancel
                </button>
                <button type="submit" className="submit-btn">
                  {editingRule ? 'Save Changes' : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

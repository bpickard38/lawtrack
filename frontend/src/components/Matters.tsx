import { useState, useRef } from 'react';
import type { Case } from '../types';
import { createCase, updateCase, deleteCase, importCases } from '../api';

interface MattersProps {
  attorneyId: number;
  cases: Case[];
  onCasesChanged: () => void;
  initialShowAdd?: boolean;
}

/** Minimal CSV parser: no quoted-comma support needed for a simple name,client_name import. */
function parseCsv(text: string): { name: string; client_name?: string }[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const first = lines[0].toLowerCase();
  const hasHeader = first.includes('name');
  const rows = hasHeader ? lines.slice(1) : lines;
  return rows.map(line => {
    const [name, client] = line.split(',').map(s => (s ?? '').trim());
    return { name, client_name: client || undefined };
  }).filter(r => r.name);
}

export default function Matters({ attorneyId, cases, onCasesChanged, initialShowAdd }: MattersProps) {
  const [showAdd, setShowAdd] = useState(!!initialShowAdd);
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editClient, setEditClient] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await createCase({ name: name.trim(), client_name: clientName.trim() || undefined, attorney_id: attorneyId });
      setName('');
      setClientName('');
      setShowAdd(false);
      onCasesChanged();
    } catch (err) {
      alert('Failed to create matter: ' + (err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  function startEdit(c: Case) {
    setEditingId(c.id);
    setEditName(c.name);
    setEditClient(c.client_name || '');
  }

  async function handleSaveEdit(caseId: number) {
    if (!editName.trim()) return;
    try {
      await updateCase(caseId, { name: editName.trim(), client_name: editClient.trim() || undefined });
      setEditingId(null);
      onCasesChanged();
    } catch (err) {
      alert('Failed to save matter: ' + (err as Error).message);
    }
  }

  async function handleDelete(c: Case) {
    if (!confirm(`Delete "${c.name}"? Any time entries assigned to it will become unassigned, not deleted.`)) return;
    try {
      await deleteCase(c.id);
      onCasesChanged();
    } catch (err) {
      alert('Failed to delete matter: ' + (err as Error).message);
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        alert('No rows found. Expected a CSV with columns: name, client_name');
        return;
      }
      const result = await importCases(rows);
      setImportResult({ created: result.created, skipped: result.skipped });
      onCasesChanged();
    } catch (err) {
      alert('Failed to import CSV: ' + (err as Error).message);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="matters-view">
      <div className="view-header">
        <h2>Matters</h2>
        <div className="matters-toolbar-actions">
          <button type="button" className="btn-outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" hidden onChange={handleFileSelected} />
          <button type="button" className="btn-primary" onClick={() => setShowAdd(v => !v)}>
            {showAdd ? 'Cancel' : '+ New matter'}
          </button>
        </div>
      </div>

      <p className="matters-hint">
        Clients and matters power auto-assignment: captured activity is matched against them in
        the daily review. CSV columns: <code>name, client_name</code>.
      </p>

      {importResult && (
        <div className="matters-import-result">
          Imported {importResult.created} {importResult.created === 1 ? 'matter' : 'matters'}
          {importResult.skipped > 0 ? ` · skipped ${importResult.skipped} duplicate or blank ${importResult.skipped === 1 ? 'row' : 'rows'}` : ''}.
        </div>
      )}

      {showAdd && (
        <form className="matters-add-form" onSubmit={handleCreate}>
          <input type="text" placeholder="Matter name *" value={name} onChange={e => setName(e.target.value)} required autoFocus />
          <input type="text" placeholder="Client name" value={clientName} onChange={e => setClientName(e.target.value)} />
          <button type="submit" className="btn-primary" disabled={creating}>{creating ? 'Creating…' : 'Create'}</button>
        </form>
      )}

      {cases.length === 0 ? (
        <div className="ts-empty-state">
          <h3 className="ts-empty-title">No matters yet</h3>
          <p className="ts-empty-desc">Add your first client and matter above, or import a CSV, to start assigning captured time.</p>
        </div>
      ) : (
        <div className="matters-table">
          <div className="matters-row matters-row-head">
            <span>Matter</span>
            <span>Client</span>
            <span>Status</span>
            <span></span>
          </div>
          {cases.map(c => (
            <div className="matters-row" key={c.id}>
              {editingId === c.id ? (
                <>
                  <input value={editName} onChange={e => setEditName(e.target.value)} />
                  <input value={editClient} onChange={e => setEditClient(e.target.value)} placeholder="Client name" />
                  <span className="matters-status">{c.status}</span>
                  <span className="matters-row-actions">
                    <button type="button" className="review-row-edit" onClick={() => handleSaveEdit(c.id)}>Save</button>
                    <button type="button" className="ts-btn-cancel" onClick={() => setEditingId(null)}>Cancel</button>
                  </span>
                </>
              ) : (
                <>
                  <span className="matters-name">{c.name}</span>
                  <span>{c.client_name || '—'}</span>
                  <span className="matters-status">{c.status}</span>
                  <span className="matters-row-actions">
                    <button type="button" className="review-row-edit" onClick={() => startEdit(c)}>Edit</button>
                    <button type="button" className="today-delete-btn" onClick={() => handleDelete(c)}>Delete</button>
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

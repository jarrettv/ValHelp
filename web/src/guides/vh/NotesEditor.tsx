import { useEffect, useRef, useState } from 'react';
import type { VhPageKey } from './vhRender';
import { invalidateItemDetails } from './vhRender.raw';

type Props = {
  page: VhPageKey;
  code: string;
  name: string;
  onSaved: () => void;
};

const PENCIL_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);

export default function NotesEditor({ page, code, name, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset whenever the selected item changes
  useEffect(() => { setEditing(false); setError(null); }, [page, code]);

  async function openEditor() {
    setError(null);
    setLoading(true);
    setEditing(true);
    try {
      const res = await fetch(`/api/admin/notes/${page}/${encodeURIComponent(code)}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`load ${res.status}`);
      const data = await res.json();
      setBody(data.body || '');
    } catch (err: any) {
      setError(err?.message || 'Failed to load');
      setBody('');
    } finally {
      setLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/notes/${page}/${encodeURIComponent(code)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ heading: name, body }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || `save ${res.status}`);
      }
      invalidateItemDetails(page);
      setEditing(false);
      onSaved();
    } catch (err: any) {
      setError(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="vh-notes-edit-bar">
        <button className="vh-notes-edit-btn" onClick={openEditor} title="Edit notes">
          {PENCIL_ICON}
          <span>Edit notes</span>
        </button>
      </div>
    );
  }

  return (
    <div className="vh-notes-editor">
      <div className="vh-notes-editor-head">
        Editing notes for <strong>{name}</strong> <code>{code}</code>
      </div>
      {loading ? (
        <div className="vh-notes-editor-loading">Loading…</div>
      ) : (
        <textarea
          ref={textareaRef}
          className="vh-notes-editor-text"
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Markdown notes…"
          spellCheck={false}
        />
      )}
      {error && <div className="vh-notes-editor-error">{error}</div>}
      <div className="vh-notes-editor-actions">
        <button className="vh-notes-editor-save" onClick={save} disabled={saving || loading}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button className="vh-notes-editor-cancel" onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </button>
      </div>
    </div>
  );
}

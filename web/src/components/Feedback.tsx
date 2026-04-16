import { useState } from 'react';
import { useLocation, Link } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import './Feedback.css';

const MAX_LEN = 2000;

export default function Feedback() {
  const { status } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loggedIn = !!status && status.id > 0;

  const kofi = (
    <a
      href="https://ko-fi.com/G2G81GIWPH"
      target="_blank"
      rel="noreferrer"
      className="kofi-link"
      title="Buy Me a Mead at ko-fi.com"
    >
      <span aria-hidden="true">☕</span>
      <span>Buy me a mead</span>
    </a>
  );

  if (!loggedIn) {
    return (
      <div className="feedback-row">
        <div className="feedback faded">
          <Link to="/auth/login">Login</Link> to provide feedback
        </div>
        {kofi}
      </div>
    );
  }

  if (sent) {
    return (
      <div className="feedback-row">
        <div className="feedback sent">Thanks for the feedback!</div>
        {kofi}
      </div>
    );
  }

  const submit = async () => {
    const trimmed = msg.trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/feedback', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          page: location.pathname + location.search,
          msg: trimmed,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      setSent(true);
      setMsg('');
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <div className="feedback-row">
        <div className="feedback">
          <button type="button" className="feedback-trigger" onClick={() => setOpen(true)}>
            Got feedback?
          </button>
        </div>
        {kofi}
      </div>
    );
  }

  return (
    <div className="feedback-row">
      <div className="feedback open">
        <textarea
        value={msg}
        onChange={e => setMsg(e.target.value.slice(0, MAX_LEN))}
        placeholder="What's on your mind? Corrections, suggestions, bugs…"
        rows={4}
        maxLength={MAX_LEN}
        disabled={sending}
        autoFocus
      />
      <div className="feedback-footer">
        <span className="feedback-count">{msg.length}/{MAX_LEN}</span>
        {error && <span className="feedback-error">{error}</span>}
        <button type="button" onClick={() => { setOpen(false); setError(null); }} disabled={sending}>
          Cancel
        </button>
        <button type="button" className="feedback-send" onClick={submit} disabled={sending || !msg.trim()}>
          {sending ? 'Sending…' : 'Send'}
        </button>
        </div>
      </div>
      {kofi}
    </div>
  );
}

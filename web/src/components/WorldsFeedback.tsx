import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { track } from '../lib/analytics';
import './WorldsFeedback.css';

// Feedback and feature requests from the world map, into the site's feedback
// inbox (POST api/auth/feedback, read on /auth/feedback). Sending needs a login.

const MAX_LEN = 2000;
type Kind = 'feedback' | 'feature';

const ChatIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 5h16v11H9l-5 4z" />
  </svg>
);

export default function WorldsFeedback({ seed, className }: { seed: string; className?: string }) {
  const { status } = useAuth();
  const location = useLocation();
  const loggedIn = !!status && status.id > 0;
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('feedback');
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  function toggle() {
    if (!open) { setSent(false); setError(null); track('feedback_open', seed, { loggedIn }); }
    setOpen(o => !o);
  }

  async function submit() {
    const text = msg.trim();
    if (!text) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/feedback', {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ page: location.pathname + location.search, msg: text, kind }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      track('feedback_sent', seed, { kind, chars: text.length });
      setSent(true);
      setMsg('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={`wfb ${className ?? ''}`} ref={root}>
      <button className="wfb-pill" onClick={toggle} aria-expanded={open} title="Send feedback or a feature request">
        <ChatIcon /><span className="wfb-pill-label">Feedback</span>
      </button>
      {open && (
        <div className="wfb-panel" role="dialog" aria-label="Feedback">
          {!loggedIn ? (
            <div className="wfb-login">
              <p>Ideas, bugs, a world that looks wrong? <Link to="/auth/login">Log in</Link> to send feedback or a feature request.</p>
            </div>
          ) : sent ? (
            <div className="wfb-sent">
              <p>Thanks! It&apos;s in the inbox.</p>
              <button className="wfb-btn" onClick={() => setSent(false)}>Send another</button>
            </div>
          ) : (
            <>
              <div className="wfb-kinds" role="radiogroup" aria-label="Kind">
                {(['feedback', 'feature'] as Kind[]).map(k => (
                  <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                    {k === 'feedback' ? 'Feedback' : 'Feature request'}
                  </button>
                ))}
              </div>
              <textarea value={msg} onChange={e => setMsg(e.target.value.slice(0, MAX_LEN))} rows={5} maxLength={MAX_LEN}
                autoFocus disabled={sending}
                placeholder={kind === 'feature' ? 'What would you like the map to do?' : `What's working, what isn't? (world ${seed})`} />
              <div className="wfb-foot">
                <span className="wfb-count">{msg.length}/{MAX_LEN}</span>
                {error && <span className="wfb-error">{error}</span>}
                <button className="wfb-btn" onClick={submit} disabled={sending || !msg.trim()}>{sending ? 'Sending…' : 'Send'}</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

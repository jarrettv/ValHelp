import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from './contexts/AuthContext';
import './Characters.css';

// /link?code=XXXX-XXXX: the tracker app opens this to be linked to the account
// (device code flow, api CharDevices). The code it shows must match.

export default function LinkDevice() {
  const [params] = useSearchParams();
  const { status } = useAuth();
  const [code, setCode] = useState(params.get('code') ?? '');
  const [state, setState] = useState<{ kind: 'idle' | 'busy' } | { kind: 'done'; device: string } | { kind: 'error'; message: string }>({ kind: 'idle' });

  async function approve(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: 'busy' });
    try {
      const r = await fetch('/api/char/device/approve', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userCode: code }),
      });
      if (!r.ok) {
        const text = (await r.text()).replace(/^"|"$/g, '');
        setState({ kind: 'error', message: text || `HTTP ${r.status}` });
        return;
      }
      const body = await r.json() as { deviceName: string };
      setState({ kind: 'done', device: body.deviceName });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Failed' });
    }
  }

  const back = '/link' + (params.get('code') ? `?code=${encodeURIComponent(params.get('code')!)}` : '');
  return (
    <div className="chars-page link-page">
      <h1>Link the tracker</h1>
      {status === null ? <p>Loading…</p> : !status.id ? (
        <>
          <p>Log in to link the ValHelp Tracker on your PC to your account.</p>
          <p><a className="chars-btn" href={`/api/auth/discord?returnUrl=${encodeURIComponent(back)}`}>Log in with Discord</a></p>
        </>
      ) : state.kind === 'done' ? (
        <>
          <p className="link-ok">Linked <strong>{state.device}</strong> to {status.username}.</p>
          <p>
            You can close this tab. Right-click the tracker&apos;s tray icon to choose which characters to track;
            they&apos;ll show up on <Link to="/characters">your characters</Link>.
          </p>
        </>
      ) : (
        <form onSubmit={approve} className="link-form">
          <p>Check that this is the code the tracker shows, then link it to <strong>{status.username}</strong>.</p>
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX"
            maxLength={9} autoFocus spellCheck={false} autoComplete="off" />
          <button className="chars-btn" disabled={state.kind === 'busy' || code.replace(/[^A-Z0-9]/gi, '').length !== 8}>
            Link
          </button>
          {state.kind === 'error' && <p className="ct-error">{state.message}</p>}
          <p className="link-hint">Didn&apos;t start this? Don&apos;t link it: whoever has the tracker could upload saves as you.</p>
        </form>
      )}
    </div>
  );
}

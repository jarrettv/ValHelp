import { useSyncExternalStore } from 'react';
import { dismissToast, getToasts, subscribeToasts } from './toast';
import './Toasts.css';

/// Renders the toast stack from ./toast; mount once per page.
export function Toaster() {
  const list = useSyncExternalStore(subscribeToasts, getToasts);
  return (
    <div className="toasts" aria-live="polite">
      {list.map(t => (
        <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          <span className="toast-msg">
            {t.message}
            {t.count > 1 && <span className="toast-count">×{t.count}</span>}
          </span>
          <button className="toast-close" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>×</button>
        </div>
      ))}
    </div>
  );
}

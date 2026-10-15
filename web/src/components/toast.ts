// Minimal toast notifications: call toast.error(...) from anywhere and render
// <Toaster /> once on the page. Errors stay until dismissed (so a failure is
// never missed); success/info fade on their own. A repeat of a message that's
// still showing bumps its count rather than stacking a duplicate.

export type ToastKind = 'error' | 'warn' | 'success' | 'info';

export interface Toast { id: number; kind: ToastKind; message: string; count: number }

const AUTO_DISMISS_MS: Record<ToastKind, number | null> = { error: null, warn: 8000, success: 2500, info: 4000 };

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const timers = new Map<number, number>();

function emit() { for (const l of listeners) l(); }

export function dismissToast(id: number) {
  window.clearTimeout(timers.get(id));
  timers.delete(id);
  toasts = toasts.filter(t => t.id !== id);
  emit();
}

function push(kind: ToastKind, message: string) {
  const dup = toasts.find(t => t.kind === kind && t.message === message);
  const id = dup?.id ?? nextId++;
  toasts = dup
    ? toasts.map(t => (t.id === id ? { ...t, count: t.count + 1 } : t))
    : [...toasts, { id, kind, message, count: 1 }];
  const ms = AUTO_DISMISS_MS[kind];
  if (ms != null) {
    window.clearTimeout(timers.get(id));
    timers.set(id, window.setTimeout(() => dismissToast(id), ms));
  }
  emit();
}

export const toast = {
  error: (message: string) => push('error', message),
  warn: (message: string) => push('warn', message),
  success: (message: string) => push('success', message),
  info: (message: string) => push('info', message),
};

export const subscribeToasts = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export const getToasts = () => toasts;

/// <reference types="vite/client" />

// The ported guide renderers emit inline `onclick="window.__vhNavigate(...)"`
// handlers, so the SPA nav helper has to live on window. Declared here rather
// than cast at each assignment.
declare global {
  interface Window {
    __vhNavigate?: (path: string) => void;
  }
}

export {};

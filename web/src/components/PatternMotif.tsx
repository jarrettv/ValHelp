import { useLayoutEffect, useRef, useState } from 'react';

// One motif from a pattern tile (its shared <defs> shape: #m, #r, #a, ...),
// fitted to a small box. Used by the hover card, where a corner of the tile
// would often be empty for sparse patterns. Pattern SVGs are our own static
// files, so their markup is inlined as-is.

const cache = new Map<string, Promise<string | null>>();

/// The inner markup of the first shape in the pattern's <defs>, wrapped in a
/// <g> carrying its own transform (e.g. the abomination's scale).
function loadMotif(pattern: string): Promise<string | null> {
  let p = cache.get(pattern);
  if (!p) {
    p = fetch(`/img/Patterns/${pattern}.svg`)
      .then(r => (r.ok ? r.text() : null))
      .then(text => {
        if (!text) return null;
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
        const g = doc.querySelector('defs > g');
        if (!g) return null;
        const t = g.getAttribute('transform');
        return `<g${t ? ` transform="${t}"` : ''}>${g.innerHTML}</g>`;
      })
      .catch(() => null);
    cache.set(pattern, p);
  }
  return p;
}

export default function PatternMotif({ pattern, size }: { pattern: string; size: number }) {
  const [markup, setMarkup] = useState<string | null>(null);
  const [viewBox, setViewBox] = useState<string | null>(null);
  const g = useRef<SVGGElement>(null);

  useLayoutEffect(() => {
    let alive = true;
    loadMotif(pattern).then(m => { if (alive) setMarkup(m); });
    return () => { alive = false; };
  }, [pattern]);

  // Fit the drawn shape once it's in the DOM (getBBox needs it rendered).
  useLayoutEffect(() => {
    if (!markup || !g.current) return;
    const b = g.current.getBBox();
    if (b.width && b.height) {
      const pad = Math.max(b.width, b.height) * 0.08;
      const side = Math.max(b.width, b.height) + pad * 2;
      setViewBox(`${b.x + b.width / 2 - side / 2} ${b.y + b.height / 2 - side / 2} ${side} ${side}`);
    }
  }, [markup]);

  return (
    <svg width={size} height={size} viewBox={viewBox ?? '0 0 1 1'} aria-hidden="true"
         style={{ visibility: viewBox ? 'visible' : 'hidden', display: 'block' }}>
      {markup && <g ref={g} dangerouslySetInnerHTML={{ __html: markup }} />}
    </svg>
  );
}

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useVhDoc, useVhItems, useVhDefaults } from './data';
import { renderMdToElement } from './vhRender.raw';
import { subscribe, getChangeCounter, initVhState } from './vhRender';

type Props = { name: string };

export default function TipsMarkdown({ name }: Props) {
  const { data, isLoading, error } = useVhDoc(name);
  // Items must be loaded so `[Code]@"Name"` chips can resolve to real
  // /guides/<page>/<subcat>/<code> URLs. Otherwise mdFindItem returns null
  // and chips render as plain text (no link).
  const { data: items } = useVhItems();
  const { data: defaults } = useVhDefaults();
  const ref = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const tick = useSyncExternalStore(subscribe, getChangeCounter);

  useEffect(() => {
    window.__vhNavigate = (path: string) => navigate(path);
  }, [navigate]);

  useEffect(() => {
    if (items && defaults !== undefined) initVhState(items, defaults);
  }, [items, defaults]);

  // `items` matters: the doc text (a few KB) always beats items.json (450KB),
  // so the first pass renders chips as raw codes. Re-render when they land.
  useEffect(() => {
    if (data && ref.current) renderMdToElement(data, ref.current);
  }, [data, tick, items]);

  // Deep links like /guides/articles/swamp#alternative-biomes: scroll once the
  // anchor exists. Waits for items (chips change the layout height) and for the
  // doc's images, which otherwise load in above the anchor and push it down.
  const { hash } = useLocation();
  const scrolledTo = useRef('');
  useEffect(() => {
    const id = decodeURIComponent(hash.slice(1));
    const root = ref.current;
    if (!id || !data || !items || !root || scrolledTo.current === name + hash) return;
    const find = () => root.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
    if (!find()) return;
    scrolledTo.current = name + hash;
    const pending = Array.from(root.querySelectorAll('img')).filter(img => !img.complete);
    const loaded = pending.map(img => new Promise(res => {
      img.addEventListener('load', res, { once: true });
      img.addEventListener('error', res, { once: true });
    }));
    const timeout = new Promise(res => setTimeout(res, 3000));
    // Re-query: a chip re-render may have replaced the heading while we waited.
    Promise.race([Promise.all(loaded), timeout]).then(() => find()?.scrollIntoView());
  }, [hash, name, data, items, tick]);

  if (isLoading) return <div className="vh-items-detail-empty">Loading…</div>;
  if (error) return <div className="vh-items-detail-empty">Failed to load {name}.md</div>;

  return <div className="vh-md" ref={ref} />;
}

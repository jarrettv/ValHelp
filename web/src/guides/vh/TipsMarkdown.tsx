import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router';
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

  if (isLoading) return <div className="vh-items-detail-empty">Loading…</div>;
  if (error) return <div className="vh-items-detail-empty">Failed to load {name}.md</div>;

  return <div className="vh-md" ref={ref} />;
}

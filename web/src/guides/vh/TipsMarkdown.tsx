import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router';
import { useVhDoc } from './data';
import { renderMdToElement } from './vhRender.raw';
import { subscribe, getChangeCounter } from './vhRender';

type Props = { name: string };

export default function TipsMarkdown({ name }: Props) {
  const { data, isLoading, error } = useVhDoc(name);
  const ref = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const tick = useSyncExternalStore(subscribe, getChangeCounter);

  useEffect(() => {
    (window as any).__vhNavigate = (path: string) => navigate(path);
  }, [navigate]);

  useEffect(() => {
    if (data && ref.current) renderMdToElement(data, ref.current);
  }, [data, tick]);

  if (isLoading) return <div className="vh-items-detail-empty">Loading…</div>;
  if (error) return <div className="vh-items-detail-empty">Failed to load {name}.md</div>;

  return <div className="vh-md" ref={ref} />;
}

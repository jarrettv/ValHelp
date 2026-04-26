import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router';
import { useVhItems, useVhDefaults } from './data';
import { useAuth } from '../../contexts/AuthContext';
import type { VhItem } from './types';
import TipsMarkdown from './TipsMarkdown';
import NotesEditor from './NotesEditor';
import Feedback from '../../components/Feedback';
import {
  initVhState,
  renderListItemHTML,
  renderDetailInto,
  setSelectedCode,
  getSelectedCode,
  getMaxStats,
  getChangeCounter,
  subscribe,
  syncWithServer,
  clearServerSync,
  bumpChange,
  type VhPageKey,
} from './vhRender';
import { state as vhState, pageToDetailsDoc } from './vhRender.raw';

export type CategoryTag = {
  id: string;
  label: string;
  icon: React.ReactNode;
  bgImg?: string;
  separatorAfter?: boolean;
};

export type ItemsPageConfig = {
  page: VhPageKey;
  pageSlug: string;
  tipsDoc: string | null;
  tipsLabel?: string;
  filter: (it: VhItem) => boolean;
  subField: keyof VhItem;
  tags: CategoryTag[];
  sort: (a: VhItem, b: VhItem) => number;
  allBgImg?: string;
};

const ICON_ALL = (
  <svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8.5v7M9 10l6 4m-6 0l6-4M3 12a9 9 0 1 0 18 0a9 9 0 0 0-18 0" /></svg>
);
const ICON_FAV = (
  <svg viewBox="0 0 24 24"><path fill="#ca0" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" /></svg>
);
const ICON_SPEED = (
  <svg viewBox="0 0 24 24"><path fill="#4af" d="M13.5 5.5c1.09 0 2-.92 2-2a2 2 0 0 0-2-2c-1.11 0-2 .88-2 2c0 1.08.89 2 2 2M9.89 19.38l1-4.38L13 17v6h2v-7.5l-2.11-2l.61-3A7.3 7.3 0 0 0 19 13v-2c-1.91 0-3.5-1-4.31-2.42l-1-1.58c-.4-.62-1-1-1.69-1c-.31 0-.5.08-.81.08L6 8.28V13h2V9.58l1.79-.7L8.19 17l-4.9-1l-.4 2z" /></svg>
);
const TIPS_ICON = (
  <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2m1 15h-2v-6h2zm0-8h-2V7h2z" /></svg>
);
const GRID_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
);
const BACK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
);

function tagToSlug(id: string): string {
  return id.toLowerCase().replace(/\s+/g, '-');
}

function slugToTag(slug: string, tags: CategoryTag[]): string | null {
  for (const t of tags) {
    if (tagToSlug(t.id) === slug) return t.id;
  }
  return null;
}

type View = { kind: 'categories' } | { kind: 'list'; tag: string } | { kind: 'tips' };

const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

function deriveView(
  categorySlug: string | undefined,
  config: ItemsPageConfig,
): View {
  if (!categorySlug) {
    if (isMobile() || !config.tipsDoc) return { kind: 'categories' };
    return { kind: 'tips' };
  }
  if (categorySlug === 'tips') return { kind: 'tips' };
  if (categorySlug === 'all') return { kind: 'list', tag: '_all' };
  if (categorySlug === 'favorites') return { kind: 'list', tag: '_fav' };
  if (categorySlug === 'speedrun') return { kind: 'list', tag: '_speed' };
  const tag = slugToTag(categorySlug, config.tags);
  if (tag) return { kind: 'list', tag };
  return config.tipsDoc ? { kind: 'tips' } : { kind: 'categories' };
}

function viewToSlug(view: View, config: ItemsPageConfig): string | null {
  if (view.kind === 'tips') return config.tipsDoc ? 'tips' : null;
  if (view.kind === 'categories') return null;
  const tag = view.tag;
  if (tag === '_all') return 'all';
  if (tag === '_fav') return 'favorites';
  if (tag === '_speed') return 'speedrun';
  return tagToSlug(tag);
}

export default function ItemsPage({ config }: { config: ItemsPageConfig }) {
  const { data: items } = useVhItems();
  const { data: defaults } = useVhDefaults();
  const { status } = useAuth();
  const { category: categorySlug, itemCode: urlItemCode } = useParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const view = deriveView(categorySlug, config);

  const tick = useSyncExternalStore(subscribe, getChangeCounter);
  useEffect(() => {
    if (items && defaults !== undefined) initVhState(items, defaults);
    setSelectedCode(urlItemCode ?? null);
  }, [items, defaults, urlItemCode, config]);

  useEffect(() => {
    if (!items) return;
    const id = status?.id;
    if (id && id > 0) { syncWithServer(id); }
    else { clearServerSync(); }
  }, [items, status?.id]);

  // Wire up item click to navigate
  useEffect(() => {
    const slug = viewToSlug(view, config);
    const handler = (code: string) => {
      const base = `/guides/${config.pageSlug}`;
      // 'tips' is the markdown reader view, not an item-list category — fall back to 'all' so the detail panel renders.
      const navSlug = slug && slug !== 'tips' ? slug : 'all';
      const target = `${base}/${navSlug}/${code}`;
      navigate(target, { replace: true });
    };
    (window as any).__vhItemClick = handler;
    (window as any).selectPageItem = handler;
    return () => {
      (window as any).__vhItemClick = undefined;
      (window as any).selectPageItem = undefined;
    };
  }, [navigate, config, view]);

  const navigateToView = (v: View) => {
    setSearch('');
    const base = `/guides/${config.pageSlug}`;
    const slug = viewToSlug(v, config);
    navigate(slug ? `${base}/${slug}` : base);
  };

  const pageItems = useMemo(
    () => (items ? items.filter(it => !it.hidden && config.filter(it)) : []),
    [items, config]
  );

  const filtered = useMemo(() => {
    let list = pageItems;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(it =>
        ((it.name || it.code).toLowerCase().includes(q)) ||
        it.code.toLowerCase().includes(q)
      );
    } else if (view.kind === 'list') {
      const tag = view.tag;
      if (tag === '_fav') {
        list = list.filter(it => !!vhState.craftFavorites[it.code]);
      } else if (tag === '_speed') {
        list = list.filter(it => !!vhState.craftSpeedrun[it.code]);
      } else if (tag !== '_all') {
        list = list.filter(it => (it[config.subField] as unknown) === tag);
      }
    } else {
      list = [];
    }
    const sorted = [...list];
    const alphaSort =
      !!search ||
      (view.kind === 'list' && (view.tag === '_all' || view.tag === '_fav' || view.tag === '_speed'));
    if (alphaSort) {
      sorted.sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code));
    } else {
      sorted.sort(config.sort);
    }
    return sorted;
  }, [pageItems, view, search, config, tick]);

  const selectedCode = getSelectedCode();
  void tick;

  const showList = !!search || view.kind === 'list';
  const showCategories = !showList;
  const tipsActive = view.kind === 'tips';

  const listHtml = useMemo(() => {
    if (!showList || !items) return '';
    const ms = getMaxStats() || {
      maxHp: 0, maxSta: 0, maxEitr: 0, maxRegen: 0, maxArmor: 0, maxBlock: 0,
      skillMaxDmg: {}, skillMaxBlock: {}, skillMaxArmor: {},
    };
    return filtered.map(it => renderListItemHTML(it, config.page, ms)).join('');
  }, [filtered, showList, items, config.page, tick]);

  const detailRef = useRef<HTMLDivElement>(null);
  const [editorAnchor, setEditorAnchor] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = detailRef.current;
    if (!el) return;
    if (view.kind === 'tips' || !selectedCode) { setEditorAnchor(null); return; }
    renderDetailInto(el, selectedCode, config.page);
    const notes = el.querySelector('.detail-item-md');
    const anchor = document.createElement('div');
    anchor.className = 'vh-notes-anchor';
    if (notes && notes.parentNode) {
      notes.parentNode.insertBefore(anchor, notes.nextSibling);
    } else {
      el.appendChild(anchor);
    }
    setEditorAnchor(anchor);
    return () => { anchor.remove(); };
  }, [selectedCode, view.kind, config.page, tick]);

  const containerClass = `vh-items-container${selectedCode ? ' has-selection' : ''}${tipsActive ? ' show-tips' : ''}`;

  return (
    <div className={containerClass}>
      <div className="vh-items-left">
        <div className="vh-items-search">
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => {
              const v = e.target.value;
              setSearch(v);
              if (v && view.kind !== 'list') navigateToView({ kind: 'list', tag: '_all' });
            }}
          />
          {search && (
            <button
              className="vh-items-search-clear"
              onClick={() => { setSearch(''); navigateToView({ kind: 'categories' }); }}
            >×</button>
          )}
          <button
            className={`vh-items-cat-btn ${showCategories ? 'active' : ''}`}
            title="Show categories"
            onClick={() => navigateToView({ kind: 'categories' })}
          >
            {GRID_ICON}
          </button>
        </div>

        {showCategories && (
          <div className="vh-items-categories">
            <div className="vh-cat-grid">
              {config.tipsDoc && (
                <div className="vh-tips-row">
                  <div
                    className={`vh-tips-card ${tipsActive ? 'active' : ''}`}
                    onClick={() => navigateToView({ kind: 'tips' })}
                  >
                    {TIPS_ICON}
                    <span className="vh-tips-label">{config.tipsLabel ?? 'Mechanics & tips'}</span>
                  </div>
                </div>
              )}
              <CatCard
                tag={{ id: '_all', label: 'All (A-Z)', icon: ICON_ALL, bgImg: config.allBgImg }}
                onClick={() => navigateToView({ kind: 'list', tag: '_all' })}
              />
              <CatCard
                tag={{ id: '_fav', label: 'Favorites', icon: ICON_FAV }}
                onClick={() => navigateToView({ kind: 'list', tag: '_fav' })}
              />
              <CatCard
                tag={{ id: '_speed', label: 'Speedrun', icon: ICON_SPEED }}
                onClick={() => navigateToView({ kind: 'list', tag: '_speed' })}
              />
              {config.tags.map((t, i) => (
                <span key={t.id} style={{ display: 'contents' }}>
                  {t.separatorAfter && i > 0 && <div className="vh-cat-sep" />}
                  <CatCard
                    tag={t}
                    onClick={() => navigateToView({ kind: 'list', tag: t.id })}
                  />
                </span>
              ))}
            </div>
          </div>
        )}

        {showList && (
          <div
            className="vh-items-list"
            dangerouslySetInnerHTML={{ __html: listHtml || '<div style="padding:16px;color:#555;text-align:center;font-size:13px">No items match.</div>' }}
          />
        )}
      </div>

      {view.kind === 'tips' && config.tipsDoc ? (
        <div className="vh-items-detail">
          <button className="vh-detail-back" onClick={() => navigateToView({ kind: 'categories' })}>
            {BACK_ICON} Back
          </button>
          <TipsMarkdown name={config.tipsDoc} />
          <Feedback />
        </div>
      ) : !selectedCode ? (
        <div className="vh-items-detail">
          <div className="vh-items-detail-empty">
            Select an item to view its details.
          </div>
        </div>
      ) : (
        <div className="vh-items-detail" key={selectedCode}>
          <div ref={detailRef} />
          {editorAnchor && status?.id === 1 && pageToDetailsDoc(config.page) && createPortal(
            <NotesEditor
              page={config.page}
              code={selectedCode}
              name={items?.find(x => x.code === selectedCode)?.name || selectedCode}
              onSaved={() => bumpChange()}
            />,
            editorAnchor
          )}
          <Feedback />
        </div>
      )}
    </div>
  );
}

function CatCard({ tag, onClick }: { tag: CategoryTag; onClick: () => void }) {
  return (
    <div className="vh-cat-card" onClick={onClick}>
      {tag.bgImg && <img className="vh-cat-bg" src={tag.bgImg} alt="" />}
      {tag.icon}
      <div className="vh-cat-card-label">{tag.label}</div>
    </div>
  );
}

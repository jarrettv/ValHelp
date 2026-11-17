import { TRACKER_STORE, TRACKER_STORE_BADGE } from '../trackerLinks';

/** Microsoft's Store badge, linking to the tracker's listing. */
export default function StoreBadge({ width = 180 }: { width?: number }) {
  return (
    <a className="store-badge" href={TRACKER_STORE} target="_blank" rel="noreferrer">
      <img src={TRACKER_STORE_BADGE} width={width} alt="Get ValHelp Tracker from the Microsoft Store" />
    </a>
  );
}

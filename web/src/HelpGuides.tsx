import { Link } from "react-router";
import "./HelpGuides.css";
import { getGuideSummaries, GuideSummary } from "./guides/loader";

const encodeGuideBanner = (title: string, accent: [string, string]) => {
  const [start, end] = accent;
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'>
      <defs>
        <linearGradient id='grad' x1='0%' y1='0%' x2='100%' y2='100%'>
          <stop offset='0%' stop-color='${start}' />
          <stop offset='100%' stop-color='${end}' />
        </linearGradient>
      </defs>
      <rect width='640' height='360' fill='url(#grad)' />
      <text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle'
            font-family='Segoe UI, sans-serif' font-size='52' font-weight='700'
            fill='rgba(17, 20, 26, 0.82)'>${title.replace(/&/g, '&amp;')}</text>
    </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const guides: GuideSummary[] = getGuideSummaries();

const HelpGuides = () => {
  return (
    <main className="guides-page">
      <section className="guides-grid" aria-label="Available help guides">
        {guides.map((guide) => {
          const banner = encodeGuideBanner(guide.title, guide.accent);
          return (
            <article key={guide.title} className="guide-card">
              <Link to={guide.href} className="guide-card__image" aria-label={`Read ${guide.title}`}>
                <img src={banner} alt="" loading="lazy" />
              </Link>
              <div className="guide-card__body">
                <h2>{guide.title}</h2>
                <p>{guide.description}</p>
                <div className="guide-card__meta">
                  <span className="guide-card__author">By {guide.author}</span>
                  <Link to={guide.href} className="guide-card__cta">
                    Read guide
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
};

export default HelpGuides;

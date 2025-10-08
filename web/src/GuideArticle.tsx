import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router";
import DOMPurify from "dompurify";
import { marked } from "marked";
import "./GuideArticle.css";
import { findGuideBySlug } from "./guides/loader";

const GuideArticle = () => {
  const { slug } = useParams<{ slug: string }>();

  if (!slug) {
    return <Navigate to="/guides" replace />;
  }

  const guide = findGuideBySlug(slug);

  if (!guide) {
    return (
      <main className="guide-article guide-article--missing">
        <div className="guide-article__missing-card">
          <h1>Guide not found</h1>
          <p>We couldn't find that guide. It might have been moved or unpublished.</p>
          <Link to="/guides" className="guide-article__back">
            ← Back to guides
          </Link>
        </div>
      </main>
    );
  }

  const renderedContent = useMemo(() => {
    const raw = marked.parse(guide.content) as string;
    return DOMPurify.sanitize(raw);
  }, [guide.content]);

  return (
    <div className="guide-article">
      <div
        className="guide-article__hero"
        style={{ backgroundImage: `linear-gradient(135deg, ${guide.accent[0]}, ${guide.accent[1]})` }}
      >
        <h1>{guide.title}</h1>
        <p>By {guide.author}</p>
      </div>
      <div className="guide-article__content" dangerouslySetInnerHTML={{ __html: renderedContent }} />
    </div>
  );
};

export default GuideArticle;

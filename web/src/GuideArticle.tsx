import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router";
import DOMPurify from "dompurify";
import "./GuideArticle.css";
import "./components/Material.css";
import { findGuideBySlug } from "./guides/loader";
import { createMaterialExtension } from "./utils/markedMaterials";
import { MatsProvider, useMats } from "./contexts/MatsContext";
import { Marked } from "marked";
import { gfmHeadingId } from "marked-gfm-heading-id";

type Guide = NonNullable<ReturnType<typeof findGuideBySlug>>;

function GuideArticleContent({ guide }: { guide: Guide }) {
  const { mats } = useMats();

  const renderedContent = useMemo(() => {
    const marked = new Marked();
    marked.use(gfmHeadingId());
    marked.use({ extensions: [createMaterialExtension(mats), ] });
    const raw = marked.parse(guide.content, { gfm: true }) as string;
    console.log(raw);
    return DOMPurify.sanitize(raw, {
      ADD_ATTR: ["id", "data-material", "data-level", "data-amount", "data-icon-only"],
    });
  }, [guide.content, mats]);

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
}

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

  return (
    <MatsProvider>
      <GuideArticleContent guide={guide} />
    </MatsProvider>
  );
};

export default GuideArticle;

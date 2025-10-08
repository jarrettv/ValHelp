import { parse as parseYaml } from "yaml";

export type GuideFrontMatter = {
  title?: string;
  author?: string;
  description?: string;
  href?: string;
  accent?: string[];
  order?: number;
};

export type GuideSummary = {
  title: string;
  author: string;
  description: string;
  href: string;
  accent: [string, string];
  slug: string;
};

export type GuideDetail = GuideSummary & {
  content: string;
};

const FALLBACK_ACCENT: [string, string] = ["#9ebdff", "#92a1ff"];
const FRONT_MATTER_REGEX = /^---\s*[\r\n]+([\s\S]*?)\r?\n---\s*/;

const guideModules = import.meta.glob("./*.md", { eager: true, query: "?raw", import: "default" }) as Record<string, string>;

type GuideRecord = GuideDetail & { order: number };

type ParsedGuide = {
  data: GuideFrontMatter;
  content: string;
};

const parseGuideFile = (raw: string): ParsedGuide => {
  const match = FRONT_MATTER_REGEX.exec(raw);

  if (!match) {
    return { data: {}, content: raw.trim() };
  }

  const [, frontMatter] = match;
  let data: GuideFrontMatter = {};

  try {
    const parsed = parseYaml(frontMatter);
    if (parsed && typeof parsed === "object") {
      data = parsed as GuideFrontMatter;
    }
  } catch {
    data = {};
  }

  const content = raw.slice(match[0].length).trim();
  return { data, content };
};

const toSlug = (href: string | undefined, path: string): string => {
  if (href) {
    return href.replace(/^\//, "").replace(/^guides\//, "").replace(/\/$/, "");
  }
  const fileName = path.split("/").pop() ?? "";
  return fileName.replace(/\.md$/i, "");
};

const toHref = (slug: string, href?: string): string => {
  if (href) {
    return href.startsWith("/") ? href : `/${href}`;
  }
  return `/guides/${slug}`;
};

const deriveDescription = (explicit: string | undefined, content: string): string => {
  if (explicit && explicit.trim().length > 0) {
    return explicit.trim();
  }
  const firstParagraph = content.split(/\n{2,}/)[0]?.trim();
  return firstParagraph ?? "";
};

const selectAccent = (accent?: string[]): [string, string] => {
  if (Array.isArray(accent) && accent.length >= 2) {
    return [accent[0], accent[1]] as [string, string];
  }
  return FALLBACK_ACCENT;
};

const guideRecords: GuideRecord[] = Object.entries(guideModules)
  .map(([path, raw]) => {
    const { data, content } = parseGuideFile(String(raw));
    const title = data.title?.trim();
    const author = data.author?.trim();

    if (!title || !author) {
      return undefined;
    }

    const slug = toSlug(data.href, path);
    const href = toHref(slug, data.href);
    const accent = selectAccent(data.accent);
    const description = deriveDescription(data.description, content);
    const order = typeof data.order === "number" ? data.order : Number.MAX_SAFE_INTEGER;

    return {
      title,
      author,
      description,
      href,
      accent,
      slug,
      content,
      order,
    } satisfies GuideRecord;
  })
  .filter((record): record is GuideRecord => Boolean(record))
  .sort((a, b) => a.order - b.order);

const guideSummaries: GuideSummary[] = guideRecords.map(({ content: _content, order: _order, ...summary }) => summary);

export const getGuideSummaries = (): GuideSummary[] => guideSummaries;

export const findGuideBySlug = (slug: string): GuideDetail | undefined => guideRecords.find((guide) => guide.slug === slug);
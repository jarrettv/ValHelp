import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import { parse as parseYaml } from "yaml";

const SITE_URL = "https://valheim.help";
const FRONT_MATTER_REGEX = /^---\s*[\r\n]+([\s\S]*?)\r?\n---\s*/;

type StaticRoute = {
  path: string;
  priority?: number;
  changefreq?: "daily" | "weekly" | "monthly";
};

const STATIC_ROUTES: StaticRoute[] = [
  { path: "/", priority: 1.0, changefreq: "daily" },
  { path: "/guides/weapons", priority: 0.9, changefreq: "weekly" },
  { path: "/guides/gear", priority: 0.9, changefreq: "weekly" },
  { path: "/guides/food", priority: 0.9, changefreq: "weekly" },
  { path: "/guides/comfort", priority: 0.8, changefreq: "weekly" },
  { path: "/guides/enemies", priority: 0.9, changefreq: "weekly" },
  { path: "/guides/weather", priority: 0.6, changefreq: "monthly" },
  { path: "/leaderboard", priority: 0.7, changefreq: "daily" },
  { path: "/runs", priority: 0.7, changefreq: "daily" },
  { path: "/speedruns", priority: 0.7, changefreq: "daily" },
  { path: "/events/all", priority: 0.7, changefreq: "daily" },
  { path: "/trophy/calc", priority: 0.6, changefreq: "monthly" },
];

const readGuidePaths = (guidesDir: string): string[] => {
  const paths: string[] = [];
  for (const file of readdirSync(guidesDir)) {
    if (!file.endsWith(".md")) continue;
    const raw = readFileSync(join(guidesDir, file), "utf8");
    const match = FRONT_MATTER_REGEX.exec(raw);
    if (!match) continue;
    try {
      const data = parseYaml(match[1]) as { title?: string; author?: string; href?: string };
      if (!data?.title || !data?.author) continue;
      const href = data.href
        ? (data.href.startsWith("/") ? data.href : `/${data.href}`)
        : `/guides/info/${file.replace(/\.md$/i, "")}`;
      paths.push(href.replace(/\/$/, ""));
    } catch {
      // ignore malformed frontmatter
    }
  }
  return paths;
};

const buildXml = (routes: Array<StaticRoute & { lastmod?: string }>): string => {
  const today = new Date().toISOString().slice(0, 10);
  const urls = routes
    .map((r) => {
      const loc = `${SITE_URL}${r.path}`;
      const parts = [`    <loc>${loc}</loc>`, `    <lastmod>${r.lastmod ?? today}</lastmod>`];
      if (r.changefreq) parts.push(`    <changefreq>${r.changefreq}</changefreq>`);
      if (r.priority !== undefined) parts.push(`    <priority>${r.priority.toFixed(1)}</priority>`);
      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap-0.9">\n${urls}\n</urlset>\n`;
};

export function sitemapPlugin(): Plugin {
  return {
    name: "valhelp-sitemap",
    apply: "build",
    writeBundle(options) {
      const outDir = options.dir ?? resolve(process.cwd(), "dist");
      const guidesDir = resolve(process.cwd(), "src/guides");
      const guidePaths = readGuidePaths(guidesDir);
      const guideRoutes: StaticRoute[] = guidePaths.map((path) => ({
        path,
        priority: 0.8,
        changefreq: "monthly",
      }));
      const xml = buildXml([...STATIC_ROUTES, ...guideRoutes]);
      writeFileSync(join(outDir, "sitemap.xml"), xml);
    },
  };
}

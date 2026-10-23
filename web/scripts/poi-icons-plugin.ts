import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { loadEnv, type Plugin, type ResolvedConfig } from "vite";
import { ICON_DIR, iconNames, optimizedIcon, pushConfig, watchAndPush } from "./poi-sync.mjs";

// Exposes `virtual:poi-icons`: the names of every SVG in public/img/Poi, so the
// POI icon list (poiIcons.ts BUILTIN_ICONS) never has to be kept by hand, and
// `version`, a hash of all their contents. poiIcons.ts puts it in each icon's
// URL, so a deploy that changes any icon is never hidden by a browser's cached
// copy (the server lets browsers keep static files for an hour).
//
// public/img/Poi holds the icons as saved in Inkscape. A build replaces the
// copies Vite puts in dist with optimized ones. In dev, an edited icon updates
// the open map without a reload (a new or deleted icon reloads the page, since
// the list changes), and with POI_SYNC_KEY set each save is also uploaded to
// production. The one write to public/img/Poi is the admin page's SVGO button
// (POST /__poi/svgo?name=…, dev only), which replaces that icon with its
// optimized copy after saving the original under node_modules/.cache/poi-svgo.

const VIRTUAL_ID = "virtual:poi-icons";
const RESOLVED_ID = "\0" + VIRTUAL_ID;

export function poiIconsPlugin(): Plugin {
  const dir = ICON_DIR;
  let config: ResolvedConfig;

  const listIcons = () =>
    readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".svg"))
      .map((f) => f.slice(0, -4))
      .sort();

  return {
    name: "poi-icons",
    configResolved(c) {
      config = c;
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      const names = listIcons();
      const hash = createHash("sha256");
      for (const n of names) hash.update(n).update(readFileSync(join(dir, `${n}.svg`)));
      return `export default ${JSON.stringify(names)};
export const version = ${JSON.stringify(hash.digest("hex").slice(0, 10))};`;
    },
    // Build only: optimize the copies in dist (the originals stay as saved).
    closeBundle() {
      if (config.command !== "build") return;
      const out = join(resolve(config.root, config.build.outDir), "img", "Poi");
      for (const name of iconNames(out)) {
        const svg = optimizedIcon(name, out);
        if (svg === null) this.warn(`[poi-icons] ${name}.svg isn't valid SVG; shipped as is`);
        else writeFileSync(join(out, `${name}.svg`), svg);
      }
    },
    configureServer(server) {
      const log = server.config.logger;
      const cfg = pushConfig({ ...loadEnv(server.config.mode, server.config.envDir || process.cwd(), "POI_SYNC_"), ...process.env });
      if (cfg) {
        log.info(`[poi-sync] uploading icon saves to ${cfg.url}`);
        const stop = watchAndPush(cfg, (msg) => log.info(msg, { timestamp: true }));
        server.httpServer?.on("close", stop);
      }

      // SVGO button on the admin page's complexity listing: optimize one icon in place.
      server.middlewares.use("/__poi/svgo", (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(body));
        };
        if (req.method !== "POST") return send(405, { error: "POST only" });
        const name = new URL(req.url ?? "", "http://x").searchParams.get("name") ?? "";
        if (!listIcons().includes(name)) return send(404, { error: `no icon ${name}` });
        const file = join(dir, `${name}.svg`);
        const source = readFileSync(file, "utf8");
        const svg = optimizedIcon(name, dir);
        if (svg === null) return send(422, { error: `${name}.svg isn't valid SVG` });
        if (svg === source) return send(200, { name, before: source.length, after: svg.length, changed: false });
        const backups = join(config.root, "node_modules", ".cache", "poi-svgo");
        mkdirSync(backups, { recursive: true });
        const backup = join(backups, `${name}.${new Date().toISOString().replace(/[:.]/g, "-")}.svg`);
        copyFileSync(file, backup);
        writeFileSync(file, svg);
        log.info(`[poi-icons] svgo ${name}.svg: ${source.length} -> ${svg.length} bytes (original: ${backup})`, { timestamp: true });
        send(200, { name, before: source.length, after: svg.length, changed: true, backup });
      });

      server.watcher.add(dir);
      const isIcon = (file: string) => file.startsWith(dir + sep) && file.toLowerCase().endsWith(".svg");
      // New or deleted icon: the icon list changed, reload.
      const onAddRemove = (file: string) => {
        if (!isIcon(file)) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("add", onAddRemove);
      server.watcher.on("unlink", onAddRemove);
      // Edited icon: poiIcons.ts drops its cached copy and redraws in place.
      server.watcher.on("change", (file) => {
        if (isIcon(file)) server.ws.send({ type: "custom", event: "poi-icons:update", data: { name: basename(file, ".svg") } });
      });
    },
  };
}

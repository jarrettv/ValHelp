import { readdirSync } from "node:fs";
import { sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

// Exposes `virtual:poi-icons`: the names of every SVG in public/img/Poi, so the
// POI icon list (poiIcons.ts BUILTIN_ICONS) never has to be kept by hand —
// drop an SVG in the folder and it's available. In dev the folder is watched
// and adding or removing an icon reloads the page.

const VIRTUAL_ID = "virtual:poi-icons";
const RESOLVED_ID = "\0" + VIRTUAL_ID;

export function poiIconsPlugin(): Plugin {
  const dir = fileURLToPath(new URL("../public/img/Poi", import.meta.url));

  const listIcons = () =>
    readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".svg"))
      .map((f) => f.slice(0, -4))
      .sort();

  return {
    name: "poi-icons",
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      return `export default ${JSON.stringify(listIcons())};`;
    },
    configureServer(server) {
      server.watcher.add(dir);
      const onChange = (file: string) => {
        if (!file.startsWith(dir + sep) || !file.toLowerCase().endsWith(".svg")) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("add", onChange);
      server.watcher.on("unlink", onChange);
    },
  };
}

import { TokenizerExtension, RendererExtension, Tokens } from "marked";
import { Mat } from "../domain/materials";

// Material token extends the base Token type
type MaterialQuantityKind = "amount" | "level" | "icon";

interface MaterialToken extends Tokens.Generic {
  type: "material";
  raw: string;
  name: string;
  kind: MaterialQuantityKind;
  value: string;
}

// Regex to match [MaterialName](value) or [MaterialName]* for icon-only usage
const materialPattern = /^\[([^\]]+)](?:(\(([^)]+)\))|\*)/;

// Escape HTML special characters to prevent XSS
function escapeHtml(text: string): string {
  const htmlEscapes: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
}

function findMaterial(mats: Mat[], name: string): Mat | undefined {
  const key = name.toLowerCase();
  const direct = mats.find((mat) => mat.name.toLowerCase() === key || mat.code.toLowerCase() === key);
  if (direct) {
    return direct;
  }


  const aliasMatch = mats.find((mat) => mat.aliases?.some((alias) => alias.toLowerCase() === key));
  if (aliasMatch) {
    return aliasMatch;
  }

  const fuzzyAlias = mats.find((mat) =>
    mat.aliases?.some((alias) => {
      const candidate = alias.toLowerCase();
      return candidate.includes(key) || key.includes(candidate);
    }),
  );
  if (fuzzyAlias) {
    return fuzzyAlias;
  }

  return mats.find((mat) => {
    const candidate = mat.name.toLowerCase();
    return candidate.includes(key) || key.includes(candidate);
  });
}

export function createMaterialExtension(mats: Mat[]): TokenizerExtension & RendererExtension {
  return {
    name: "material",
    level: "inline",
    start(src: string) {
      return src.indexOf("[");
    },
    tokenizer(src: string): MaterialToken | undefined {
      const match = materialPattern.exec(src);
      if (!match) {
        return undefined;
      }

      const [, name, wrapper, rawValue] = match;

      if (wrapper === undefined) {
        return {
          type: "material",
          raw: match[0],
          name,
          kind: "icon",
          value: "",
        };
      }

      if (!rawValue) {
        return undefined;
      }

      const levelMatch = /^lvl(\d+)$/i.exec(rawValue);
      if (levelMatch) {
        return {
          type: "material",
          raw: match[0],
          name,
          kind: "level",
          value: levelMatch[1],
        };
      }

      const amountMatch = /^\d+$/.exec(rawValue);
      if (amountMatch) {
        return {
          type: "material",
          raw: match[0],
          name,
          kind: "amount",
          value: rawValue,
        };
      }

      return undefined;
    },
    renderer(token: Tokens.Generic): string {
      const { name, value, kind } = token as MaterialToken;
      const material = findMaterial(mats, name);
      const displayName = escapeHtml(material?.name || name);
      const code = material?.code || name;
      const safeCode = escapeHtml(code);
      const quantity =
        kind === "level"
          ? `Lv. ${escapeHtml(value)}`
          : kind === "amount"
            ? value === "1"
              ? ""
              : `x${escapeHtml(value)}`
            : "";
      const iconUrl = escapeHtml(material?.image || "");
      const quantityAttr =
        kind === "level"
          ? ` data-level="${escapeHtml(value)}"`
          : kind === "amount"
            ? ` data-amount="${escapeHtml(value)}"`
            : " data-icon-only=true";

      return (
        `<span class="material" data-material="${safeCode}" title="${displayName}"${quantityAttr}>` +
        `<span class="material__icon"><img src="${iconUrl}" alt="${displayName}" /></span>` +
        (kind === "icon" ? "" : `<span class="material__name">${displayName}</span>`) +
  (kind === "icon" || !quantity ? "" : `<span class="material__amount">${quantity}</span>`) +
        `</span>`
      );
    },
  };
}

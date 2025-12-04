import { Marked, TokenizerExtension, RendererExtension, Tokens } from "marked";
import { Mat } from "../domain/materials";

// Material token extends the base Token type
interface MaterialToken extends Tokens.Generic {
  type: "material";
  raw: string;
  name: string;
  amount: string;
}

// Regex to match [MaterialName](amount) where amount is a number
// This is designed to not conflict with standard markdown links
// Standard links: [text](url) where url starts with http, /, # etc.
// Materials: [name](number) where number is purely digits
const materialPattern = /^\[([^\]]+)\]\((\d+)\)/;

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

function createMaterialExtension(mats: Mat[]): TokenizerExtension & RendererExtension {
  return {
    name: "material",
    level: "inline",
    start(src: string) {
      return src.indexOf("[");
    },
    tokenizer(src: string): MaterialToken | undefined {
      const match = materialPattern.exec(src);
      if (match) {
        return {
          type: "material",
          raw: match[0],
          name: match[1],
          amount: match[2],
        };
      }
      return undefined;
    },
    renderer(token: Tokens.Generic): string {
      const { name, amount } = token as MaterialToken;
      const material = findMaterial(mats, name);
      const displayName = escapeHtml(material?.name || name);
      const code = material?.code || name;
      const safeCode = escapeHtml(code);
      const safeAmount = escapeHtml(amount);
      const iconUrl = escapeHtml(material?.image || "");

      return (
        `<span class="material" data-material="${safeCode}" title="${displayName}">` +
        `<span class="material__icon"><img src="${iconUrl}" alt="${displayName}" /></span>` +
        `<span class="material__name">${displayName}</span>` +
        `<span class="material__amount">${safeAmount}</span>` +
        `</span>`
      );
    },
  };
}

// Create a configured marked instance with the material extension
export function createMaterialsMarked(mats: Mat[]): Marked {
  const instance = new Marked();
  instance.use({ extensions: [createMaterialExtension(mats)] });
  return instance;
}

import { Marked, TokenizerExtension, RendererExtension, Tokens } from "marked";
import { getMaterial, getMaterialDisplayName } from "../domain/materials";

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

// Placeholder icon SVG for materials
const MATERIAL_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`;

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

const materialExtension: TokenizerExtension & RendererExtension = {
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
    const material = getMaterial(name);
    const displayName = escapeHtml(getMaterialDisplayName(name));
    const code = escapeHtml(material?.code || name);
    const safeAmount = escapeHtml(amount);
    
    return `<span class="material" data-material="${code}" title="${displayName}">` +
      `<span class="material__icon">${MATERIAL_ICON_SVG}</span>` +
      `<span class="material__name">${displayName}</span>` +
      `<span class="material__amount">${safeAmount}</span>` +
      `</span>`;
  },
};

// Create a configured marked instance with the material extension
export function createMaterialsMarked(): Marked {
  const instance = new Marked();
  instance.use({ extensions: [materialExtension] });
  return instance;
}

export default materialExtension;

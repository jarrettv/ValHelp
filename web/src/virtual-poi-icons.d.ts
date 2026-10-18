// Names of every SVG in public/img/Poi, from scripts/poi-icons-plugin.ts, plus
// a hash of their contents for cache-busting icon URLs.
declare module 'virtual:poi-icons' {
  const icons: string[];
  export default icons;
  export const version: string;
}

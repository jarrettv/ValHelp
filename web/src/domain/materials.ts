/// An item a guide can mention as [Name](amount) — see utils/markedMaterials.ts.
export interface Mat {
  code: string;
  name: string;
  image: string;
  aliases?: string[];
}

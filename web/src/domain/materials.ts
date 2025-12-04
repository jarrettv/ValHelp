export interface Mat {
  code: string;
  type: string;
  name: string;
  desc: string;
  image: string;
  drop?: string;
  usage?: string;
  weight?: number;
  stack?: number;
  biome?: string;
  aliases?: string[];
}
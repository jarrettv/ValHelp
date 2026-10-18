// Types for poi-sync.mjs (plain JS so it runs straight from `node`).

export interface PushConfig { key: string; url: string }

export const ICON_DIR: string;
export function iconNames(dir?: string): string[];
export function optimizeSvg(source: string): string;
export function optimizedIcon(name: string, dir?: string): string | null;
export function pushConfig(env?: Record<string, string | undefined>): PushConfig | null;
export function pushIcon(cfg: PushConfig, name: string): Promise<boolean>;
export function pushAll(cfg: PushConfig): Promise<string[]>;
export function watchIcons(onSave: (name: string) => void): () => void;
export function watchAndPush(cfg: PushConfig, log?: (msg: string) => void): () => void;

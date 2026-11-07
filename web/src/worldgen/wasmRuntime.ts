/// <reference lib="webworker" />
// Loads the WebAssembly worldgen (seedgen/Vh.WorldGen.Wasm, copied to /worldgen/
// by scripts/build_worldgen_wasm.sh) in a Web Worker, once, and returns its
// [JSExport]s (seedgen/Vh.WorldGen.Wasm/Exports.cs). Each worker declares the
// exports it calls.

const FRAMEWORK = '/worldgen/_framework/dotnet.js';

// The runtime is a static file, not part of the bundle: an import Vite can't see,
// since its dev server rewrites dynamic imports (adds ?import), which public/ files fail.
const importStatic = new Function('url', 'return import(url)') as (url: string) => Promise<{ dotnet: DotnetHost }>;
interface DotnetHost { create(): Promise<{ getAssemblyExports(name: string): Promise<{ Vh: { WorldGen: { Wasm: { Exports: unknown } } } }> }> }

let exportsP: Promise<unknown> | null = null;

export function loadWorldgenExports<T>(): Promise<T> {
  exportsP ??= (async () => {
    // dotnet.js takes a worker that already has onmessage set for one of the
    // runtime's own threads and waits forever for its setup; this flag says
    // we're a plain worker hosting the runtime ("sidecar").
    (globalThis as { dotnetSidecar?: boolean }).dotnetSidecar = true;
    const { dotnet } = await importStatic(new URL(FRAMEWORK, self.location.origin).href);
    const runtime = await dotnet.create();
    const all = await runtime.getAssemblyExports('Vh.WorldGen.Wasm.dll');
    return all.Vh.WorldGen.Wasm.Exports;
  })();
  exportsP.catch(() => { exportsP = null; });
  return exportsP as Promise<T>;
}

import vue from "@vitejs/plugin-vue";
import sourcemaps from "rollup-plugin-sourcemaps2";
import type { ConfigEnv, Plugin, UserConfig } from "vite";
import commonjs from "vite-plugin-commonjs";

/*
 * ───────────────────────────────────────────────────────────────────────────
 *  TEMPORARY DEV-MODE SECURITY RELAXATIONS — TRACK AND REMOVE
 * ───────────────────────────────────────────────────────────────────────────
 *
 * This file contains two `vite dev`-only hacks that weaken the security
 * posture of the block UI runtime relative to production. They exist so the
 * dev-server sidecar workflow (block author runs `ts-builder serve` and the
 * desktop hot-loads the block from `http://localhost:<port>/`) functions at
 * all. Both are documented at their respective sites below.
 *
 *   1. `relaxCspForDevWasm` — rewrites the block's CSP meta tag to add
 *      `'wasm-unsafe-eval'` so in-page WebAssembly (PFrameSpec / SpecDriver)
 *      can compile.
 *   2. `define: { "process.env": "({})" }` — masks all `process.env.X`
 *      references (including `NODE_ENV`) to `undefined` so transitive Node
 *      imports don't blow up on `process is not defined`.
 *
 * Both are dev-only — production block UIs are served via the `block-ui://`
 * custom protocol, registered with `bypassCSP: true`, so the CSP is
 * effectively absent in production, and rolldown strips `process.env.X`
 * references at build time.
 *
 * FOLLOW-UP — DO NOT LEAVE THIS AS THE STEADY STATE:
 *   - Migrate the block template CSP (currently `script-src 'self' blob:`)
 *     to a canonical policy that lists every source the runtime legitimately
 *     uses (including `'wasm-unsafe-eval'`), so dev and prod share one CSP.
 *   - Once block-ui:// no longer needs `bypassCSP: true`, drop the bypass on
 *     the protocol registration in
 *     `core/platforma-desktop-app/packages/main/src/protocols/block-ui.ts`.
 *   - Re-enable strict CSP enforcement in dev by removing
 *     `relaxCspForDevWasm`.
 *   - Replace the blunt `process.env: ({})` substitution with a precise
 *     allowlist of vars the SDK genuinely reads (or eliminate the references
 *     entirely from browser-bound code paths — most are debug toggles like
 *     `MI_LOG_PFRAMES` and can move to a constructor option or a
 *     `globalThis` flag).
 *   - Run a security review of the block-ui runtime end-to-end: CSP, preload
 *     surface, IPC method allowlist, `webRequest` headers, WASM source set,
 *     `webSecurity` / `nodeIntegration` / `contextIsolation` settings on
 *     `webPreferencesForBlock`, and the dev-server sidecar trust gate
 *     (currently dev-v2 only — confirm sufficient for prod hardening).
 *
 * Tracking ticket: TODO — create one in MILAB before this lands.
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * Rewrite the block's index.html CSP meta tag during `vite dev` so WebAssembly
 * modules (e.g. `@milaboratories/pframes-rs-wasm`) can compile in the browser.
 *
 * Why this is necessary, and why no smaller fix works:
 *
 *  - In production the block UI is served via the `block-ui://` custom
 *    protocol, which Electron registers with `bypassCSP: true`. The strict
 *    CSP in `index.html` (`script-src 'self' blob:`) never applies and the
 *    in-page WASM driver (PFrameSpec / `pf-spec-driver`) loads fine.
 *
 *  - In `vite dev` the UI is served over `http://localhost:<port>`. We have
 *    no equivalent privilege escape for `http:` — Electron honors the
 *    standard browser CSP semantics for that scheme.
 *
 *  - The CSP that wins is the *intersection* of every source (meta tag +
 *    response header). Adding a permissive `Content-Security-Policy`
 *    response header via Vite middleware or
 *    `session.webRequest.onHeadersReceived` does not loosen the meta — it
 *    only tightens further. So a header-side fix cannot work.
 *
 *  - CSP is parse-time baked. DOM mutation of the meta tag after load is
 *    ignored. Preload-side intervention runs after parse — too late.
 *
 *  - That leaves rewriting the served HTML. Vite's `transformIndexHtml` hook
 *    is the canonical place. Scoped to `apply: "serve"` so production builds
 *    are unaffected.
 *
 *  - WASM is in-page by deliberate architectural choice (see
 *    `sdk/ui-vue/src/internal/service_factories.ts`: `PFrameSpec` is the
 *    synchronous spec driver used inside Vue computed props; moving it to
 *    IPC would break the sync reactive chain). So we cannot side-step the
 *    CSP by relocating the WASM to preload/main.
 *
 * Narrowest fix: add `'wasm-unsafe-eval'` (WASM only, NOT JS `eval`). Do not
 * use `'unsafe-eval'` here — that would also allow `eval()`. See the
 * top-of-file follow-up block for the migration plan to remove this entirely.
 */
function relaxCspForDevWasm(): Plugin {
  return {
    name: "ts-builder:relax-csp-for-dev-wasm",
    apply: "serve",
    transformIndexHtml(html) {
      // CSP source keywords (`'self'`, `'wasm-unsafe-eval'`, ...) are
      // single-quoted inside the double-quoted content attribute, so the
      // content character class must exclude only the delimiter.
      const cspMetaRegex =
        /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*\/?>/i;
      return html.replace(cspMetaRegex, (match, content: string) => {
        if (content.includes("'wasm-unsafe-eval'")) return match;
        const relaxed = content.replace(
          /script-src([^;]*)/,
          (m, srcs: string) => `script-src${srcs} 'wasm-unsafe-eval'`,
        );
        return `<meta http-equiv="Content-Security-Policy" content="${relaxed}" />`;
      });
    },
  };
}

export function createViteDevConfig({ mode, command }: ConfigEnv): UserConfig {
  const isProd = mode === "production";
  const isServe = command === "serve";
  const useSources = process.env.USE_SOURCES === "1" || isServe;

  return {
    base: "./",
    // With "sources" condition, workspace deps resolve to raw .ts/.vue source
    // files. Vue SFCs are loaded individually (the optimizer can't inline
    // them), so their CJS imports get served raw from /@fs/. The commonjs
    // plugin transforms those CJS modules to ESM at serve time.
    plugins: [
      vue(),
      ...(isServe ? [commonjs({ filter: (id) => id.includes("node_modules") })] : []),
      relaxCspForDevWasm(),
    ],
    build: {
      target: ["chrome140"],
      emptyOutDir: isProd,
      sourcemap: isProd,
      minify: isProd,
      rolldownOptions: {
        plugins: isProd ? [sourcemaps()] : [],
      },
    },
    resolve: {
      conditions: useSources ? ["sources"] : [],
    },
    define: {
      "import.meta.vitest": "undefined",
      // `vite dev` does not strip `process.env.X` references the way the
      // production rolldown build does. Transitive imports (e.g.
      // `pf-spec-driver/logging.ts`, `pf-driver/logging.ts`) hit top-level
      // `process.env.MI_LOG_PFRAMES` lookups and throw
      // `ReferenceError: process is not defined` in the browser at module
      // load, leaving the block view white.
      //
      // Inlining an empty object makes every `process.env.X` resolve to
      // `undefined`. Side effect: `process.env.NODE_ENV` is also `undefined`
      // in dev — fine for our current consumers, but flagged in the
      // top-of-file follow-up block as a thing to tighten later.
      "process.env": "({})",
    },
  };
}

/**
 * Whether builds emit JavaScript source maps. On by default; `NO_SOURCEMAPS=1` turns
 * them off.
 *
 * The maps embed the original TypeScript (`sourcesContent`), so a package published
 * with them ships its full source. Release builds set `NO_SOURCEMAPS=1`; local builds
 * keep the maps for debugging. Declaration maps (`.d.ts.map`) hold no source: Vite
 * builds keep them, rolldown builds drop them too, because rolldown-plugin-dts forces
 * JavaScript maps on whenever it emits declaration maps.
 *
 * Consumers list the variable in turbo `env`, so cached outputs with and without maps
 * never mix.
 */
export function sourcemapsEnabled(): boolean {
  return process.env.NO_SOURCEMAPS !== "1";
}

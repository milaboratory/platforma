/** Fixtures for the block status fold and panel tests: action contexts with the backend's key layout. */
import type { BlockStatusState } from "@milaboratories/pl-model-middle-layer";
import type { ActionContextNode } from "./block_status_fold";

/** One transition, written the way the reporters write it. */
export type TransitionFixture = {
  namespace: string;
  /** The resource that reported. Defaults to the context's own render. */
  reporter?: string;
  /** Milliseconds since the epoch; the key carries nanoseconds. */
  atMs: number;
  state: BlockStatusState | string;
  detail?: string;
  reason?: string;
};

export type ContextFixture = {
  id: string;
  data?: Record<string, unknown>;
  transitions?: TransitionFixture[];
  children?: ContextFixture[];
  /** Extra KV entries: readings, and malformed input. */
  kv?: Record<string, string>;
};

/** Builds an {@link ActionContextNode} over a fixture, with the backend's key layout. */
export function context(fixture: ContextFixture): ActionContextNode {
  const kv = new Map<string, string>(Object.entries(fixture.kv ?? {}));
  for (const t of fixture.transitions ?? []) {
    const reporter = t.reporter ?? fixture.id;
    const ns = String(BigInt(t.atMs) * 1_000_000n);
    kv.set(
      `transition/${t.namespace}/${reporter}/${ns}`,
      JSON.stringify({ state: t.state, detail: t.detail ?? "", reason: t.reason ?? "" }),
    );
  }

  const children = (fixture.children ?? []).map(context);
  const childFields = new Map(children.map((c) => [`child/${c.id}`, c]));

  return {
    id: fixture.id,
    getData: () => fixture.data,
    listKeyValuesAsString: (prefix: string) =>
      [...kv.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, value })),
    listFields: () => [...childFields.keys()],
    traverse: (field: string) => childFields.get(field),
  };
}

export const t0 = Date.UTC(2026, 9, 27, 12, 0, 0);
export const ms = (offset: number) => t0 + offset;

/** The render's own end, as the workflow controller records it. */
export const renderCompleted = (atMs: number, detail?: string): TransitionFixture => ({
  namespace: "render",
  atMs,
  state: "Completed",
  detail,
});

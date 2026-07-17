/**
 * Structural postfix derivation for linked columns (phase 2 of `deriveDistinctLabels`).
 *
 * A linked column is
 * reached by a CHAIN of linkers, and we distinguish two such columns by the same ideology the main
 * algorithm uses — "find the minimal difference, escalate until unique" — over two dimensions:
 *
 *   - root:    the single source axis of the chain, derived from `linkers[0]` (one of its axesSpec).
 *              This is "the source" — it's what we prefer to show ("difference of sources").
 *   - linkers: the linker chain itself (by `LinkLabel`), a per-step fallback used only where roots
 *              coincide.
 *
 * Nothing is stored redundantly: the caller passes the linker path (`linkers`) and the hit spec;
 * root and every token are computed on the fly. The caller also supplies the `stem` (label+trace+
 * quals from the existing single-entity machinery); this module only adds the path postfix, and
 * only where stems collide.
 */
import {
  Annotation,
  canonicalizeJson,
  getAxisId,
  readAnnotation,
  type AxisSpec,
  type PColumnSpec,
} from "@milaboratories/pl-model-common";
import { isNil } from "es-toolkit";

/**
 * One entry to label: its stem plus the linker path that reached it (`linkers[0]` source-most) and
 * the hit spec used to orient the chain. Plain columns pass neither.
 */
export type PostfixEntry = { stem: string; hit?: PColumnSpec; linkers?: PColumnSpec[] };

/**
 * One distinguishing piece of the postfix: the full source spec (axis or linker column — no info
 * lost) plus `text`, the minimal text that sets it apart from the siblings (a label, or only the
 * differing domain keys). Custom formatters may use `spec` freely; `text` is the default rendering.
 */
export type LinkerPart<Spec> = { spec: Spec; text: string };

/** The distinguishing source of one column: its root axis (when it differs) + the linker chain. */
export type LinkerParts = {
  root?: LinkerPart<AxisSpec>;
  linkers: LinkerPart<PColumnSpec>[];
};

/**
 * Renders the postfix zone from the distinguishing sources. Default:
 * `via ${[root, linkers.join(" > ")].filter(Boolean).join(" ")}` (using each piece's `text`).
 * Returning `undefined` suppresses the postfix entirely (the column keeps just its stem).
 */
export type LinkerFormatter = (
  parts: LinkerParts,
  hit: PColumnSpec | undefined,
  index: number,
) => string | undefined;

function defaultLinkerFormatter(parts: LinkerParts): string {
  const chain = parts.linkers.map((l) => l.text).join(" > ");
  const pieces = [parts.root?.text, chain || undefined].filter((p): p is string => !isNil(p));
  return pieces.length === 0 ? "" : `via ${pieces.join(" ")}`;
}

// --- Node identity & minimal token (level 2: WHAT differs) -------------------

type Identity = {
  label?: string;
  name: string;
  domain?: Record<string, string>;
  contextDomain?: Record<string, string>;
};

function axisIdentity(axis: AxisSpec): Identity {
  const id = getAxisId(axis);
  return {
    label: readAnnotation(axis, Annotation.Label)?.trim() || undefined,
    name: id.name,
    domain: id.domain,
    contextDomain: id.contextDomain,
  };
}

/**
 * A linker is named ONLY by its human label (`LinkLabel`/`Label`) — never by its technical column
 * name. Returns `undefined` for an unlabeled linker, which callers treat as "not renderable": such a
 * step is skipped, and disambiguation falls to another step or the root.
 */
function linkerIdentity(linker: PColumnSpec): Identity | undefined {
  const label = (
    readAnnotation(linker, Annotation.LinkLabel) ?? readAnnotation(linker, Annotation.Label)
  )?.trim();
  return label ? { label, name: label } : undefined;
}

/** Domain keys where `mine` differs from at least one competitor. */
function differingKeys(
  mine: Record<string, string> | undefined,
  others: (Record<string, string> | undefined)[],
): string[] {
  const my = mine ?? {};
  return [
    ...others.reduce<Set<string>>((keys, o) => {
      const od = o ?? {};
      return [...new Set([...Object.keys(my), ...Object.keys(od)])].reduce(
        (acc, k) => (my[k] !== od[k] ? acc.add(k) : acc),
        keys,
      );
    }, new Set<string>()),
  ];
}

function renderWithDomain(
  base: string,
  keys: string[],
  domain: Record<string, string> | undefined,
): string {
  if (keys.length === 0) return base;
  const d = domain ?? {};
  const pairs = keys.map((k) => `${k}=${d[k] ?? "∅"}`).join(", ");
  return `${base}[${pairs}]`;
}

/**
 * Minimal token distinguishing `mine` from `others`: label → name → only the differing domain keys.
 * Falls back to the bare label/name when indistinguishable at this dimension (another one covers it).
 */
function token(mine: Identity, others: Identity[]): string {
  const base = mine.label ?? mine.name;
  if (mine.label !== undefined && others.every((o) => o.label !== mine.label)) return mine.label;
  if (others.every((o) => o.name !== mine.name)) return base;
  const dk = differingKeys(
    mine.domain,
    others.map((o) => o.domain),
  );
  if (dk.length > 0) return renderWithDomain(base, dk, mine.domain);
  const ck = differingKeys(
    mine.contextDomain,
    others.map((o) => o.contextDomain),
  );
  if (ck.length > 0) return renderWithDomain(base, ck, mine.contextDomain);
  return base;
}

// --- Root extraction ---------------------------------------------------------

/**
 * The chain's single root: the source-side axis of `linkers[0]`. A linker bridges two axis groups;
 * the side facing the next hop (`linkers[1]`, or the hit for a single-linker chain) is the target,
 * the other side is the source → its axis is the root. `undefined` if `linkers[0]` is not a
 * well-formed two-group linker.
 */
export function extractRoot(hit: PColumnSpec, linkers: PColumnSpec[]): AxisSpec | undefined {
  const first = linkers[0];
  if (first === undefined) return undefined;
  const axes = first.axesSpec;
  if (axes.length !== 2) return undefined;
  const second = linkers[1] ?? hit;
  return axes.find((a) => !second.axesSpec.some((b) => b.name === a.name));
}

// --- Structural diff (level 1: WHERE it differs) -----------------------------

type Slot = { kind: "root" } | { kind: "linker"; i: number };

const ABSENT = "__ABSENT__"; // sentinel for "this row has no value at this slot"

/** A colliding group: entries + their derived roots + original indices + the postfix formatter. */
type Group = {
  entries: PostfixEntry[];
  roots: (AxisSpec | undefined)[];
  indices: number[];
  format: LinkerFormatter;
};

function slotKey(group: Group, slot: Slot, row: number): string {
  if (slot.kind === "root") {
    const r = group.roots[row];
    return r === undefined ? ABSENT : canonicalizeJson(getAxisId(r));
  } else {
    const l = group.entries[row].linkers?.[slot.i];
    const id = l && linkerIdentity(l);
    return isNil(id) ? ABSENT : canonicalizeJson(id);
  }
}

function slotToken(group: Group, slot: Slot, row: number): string | undefined {
  if (slot.kind === "root") {
    const r = group.roots[row];
    if (r === undefined) return undefined;
    const comp = group.roots.filter((o, j) => j !== row && !isNil(o)).map((o) => axisIdentity(o!));
    return token(axisIdentity(r), comp);
  }
  const l = group.entries[row].linkers?.[slot.i];
  const id = l && linkerIdentity(l);
  if (isNil(id)) return undefined; // unlabeled / absent linker → not renderable, skip
  const comp = group.entries
    .filter((_, j) => j !== row)
    .map((e) => e.linkers?.[slot.i])
    .map((x) => (x ? linkerIdentity(x) : undefined))
    .filter((x): x is Identity => !isNil(x));
  return token(id, comp);
}

function discriminates(group: Group, slot: Slot): boolean {
  return new Set(group.entries.map((_, r) => slotKey(group, slot, r))).size > 1;
}

/** Render one row against a chosen slot set: the distinguishing root + linker pieces, formatted. */
function renderRow(group: Group, slots: Slot[], row: number): string {
  const rootSpec = group.roots[row];
  const rootText = slots.some((s) => s.kind === "root")
    ? slotToken(group, { kind: "root" }, row)
    : undefined;
  const root: LinkerPart<AxisSpec> | undefined =
    rootSpec !== undefined && rootText !== undefined
      ? { spec: rootSpec, text: rootText }
      : undefined;

  const linkers = slots
    .filter((s): s is { kind: "linker"; i: number } => s.kind === "linker")
    .sort((a, b) => a.i - b.i)
    .map((s) => {
      const spec = group.entries[row].linkers?.[s.i];
      const text = slotToken(group, s, row);
      return spec !== undefined && text !== undefined ? { spec, text } : undefined;
    })
    .filter((l): l is LinkerPart<PColumnSpec> => !isNil(l));

  // No distinguishing pieces for this row → no postfix (don't invoke the formatter with empties).
  if (root === undefined && linkers.length === 0) return "";
  return group.format({ root, linkers }, group.entries[row].hit, group.indices[row]) ?? "";
}

function renderAll(group: Group, slots: Slot[]): string[] {
  return group.entries.map((_, r) => renderRow(group, slots, r));
}

function allUnique(rendered: string[]): boolean {
  return new Set(rendered).size === rendered.length;
}

/**
 * Minimal slot set that makes the group unique. Escalate by priority (root, then linkers by step),
 * then drop any redundant slot; render every row symmetrically against the result.
 *
 * KNOWN LIMITATION (review point): symmetric render can over-decorate a row in a mixed group (e.g.
 * `via Sample MapperA` where `via Sample` alone is already unique for that row). Per-row trimming is
 * a generalized `dropRedundantLinkerSuffix`; naive greedy trimming is unstable, so it's deferred.
 */
function resolveGroup(
  entries: PostfixEntry[],
  indices: number[],
  format: LinkerFormatter,
): string[] {
  const group: Group = {
    entries,
    roots: entries.map((e) =>
      e.hit && e.linkers?.length ? extractRoot(e.hit, e.linkers) : undefined,
    ),
    indices,
    format,
  };
  const maxLen = Math.max(0, ...entries.map((e) => e.linkers?.length ?? 0));

  const slots: Slot[] = [
    { kind: "root" },
    ...Array.from({ length: maxLen }, (_, i): Slot => ({ kind: "linker", i })),
  ];

  const escalated = slots.reduce<Slot[]>(
    (acc, slot) =>
      allUnique(renderAll(group, acc)) || !discriminates(group, slot) ? acc : (acc.push(slot), acc),
    [],
  );
  const chosen = escalated.reduce<Slot[]>((acc, slot) => {
    const trial = acc.filter((s) => s !== slot);
    return allUnique(renderAll(group, trial)) ? trial : acc;
  }, escalated);

  return renderAll(group, chosen);
}

/**
 * Full label per entry: `stem` plus, where stems collide, a minimal postfix distinguishing the
 * linked columns by the difference between their sources.
 */
export function derivePostfixes(
  entries: PostfixEntry[],
  format: LinkerFormatter = defaultLinkerFormatter,
): string[] {
  const groups = entries.reduce<Map<string, number[]>>(
    (acc, e, idx) => acc.set(e.stem, [...(acc.get(e.stem) ?? []), idx]),
    new Map(),
  );

  const postfix = [...groups.values()].reduce<Map<number, string>>((acc, idxs) => {
    if (idxs.length < 2) return acc; // stem already unique — no postfix
    const resolved = resolveGroup(
      idxs.map((i) => entries[i]),
      idxs,
      format,
    );
    return idxs.reduce((m, i, k) => m.set(i, resolved[k]), acc);
  }, new Map());

  return entries.map((e, i) => {
    const p = postfix.get(i);
    return p ? `${e.stem} ${p}` : e.stem;
  });
}

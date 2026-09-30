// Notification completeness, as a property: random legal update sequences on one resource,
// with the readers defined below attached before each update. Any reader whose answer (value
// or throw, plus stability for plain field reads) differs after the update must have been
// notified.
// MODEL_RUNS raises the number of sequences (default 200; hunted at 3000).
import { expect, test } from "vitest";
import type { Watcher } from "@milaboratories/computable";
import type { FieldData, FieldType } from "@milaboratories/pl-client";
import {
  createSignedResourceId,
  DefaultFinalResourceDataPredicate,
  NullSignedResourceId,
} from "@milaboratories/pl-client";
import type { ExtendedResourceData } from "./state";
import { PlTreeState } from "./state";
import {
  field,
  InitialStructuralResourceState,
  TestDynamicRootId1,
  TestDynamicRootState1,
  TestValueResourceState1,
  dField,
} from "./test_utils";

class W implements Watcher {
  isChanged = false;
  markChanged() {
    this.isChanged = true;
  }
}
const R = createSignedResourceId(10n);
const V = [createSignedResourceId(20n), createSignedResourceId(21n)];
const E = createSignedResourceId(30n);
const RUNS = Number(process.env.MODEL_RUNS ?? 200);
const STEPS = 25;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

type St = {
  typeName: string;
  il: boolean;
  ol: boolean;
  ready: boolean;
  err: boolean;
  final: boolean;
  fields: Map<string, { type: FieldType; v: number }>;
  kv: Map<string, string>;
  removed: Set<string>;
};

function body(st: St): ExtendedResourceData {
  const fields: FieldData[] = [...st.fields.entries()].map(([n, f]) =>
    field(f.type, n, f.v < 0 ? NullSignedResourceId : V[f.v]!, NullSignedResourceId, f.v >= 0),
  );
  return {
    ...InitialStructuralResourceState,
    id: R,
    type: { name: st.typeName, version: "1" },
    inputsLocked: st.il,
    outputsLocked: st.ol,
    resourceReady: st.ready,
    error: st.err ? E : NullSignedResourceId,
    final: st.final,
    fields,
    kv: [...st.kv.entries()].map(([key, v]) => ({ key, value: Buffer.from(v) })),
  };
}

const NAMES = ["a", "b", "c", "d"];
const TYPES: FieldType[] = ["Input", "Output", "Service", "Dynamic", "MTW"];

function mutate(st: St, r: () => number): void {
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
  const op = Math.floor(r() * 9);
  const name = pick(NAMES);
  const canAdd = (t: FieldType) =>
    t === "Input" || t === "Service" ? !st.il : t === "Output" ? !st.ol : true;
  switch (op) {
    case 0: {
      if (!st.fields.has(name)) {
        const t = pick(TYPES);
        if (canAdd(t)) st.fields.set(name, { type: t, v: -1 });
      }
      break;
    }
    case 1: {
      const f = st.fields.get(name);
      if (f && (f.type === "Dynamic" || f.type === "MTW")) {
        st.fields.delete(name);
        if (r() < 0.6) {
          const t = pick(TYPES);
          if (canAdd(t)) st.fields.set(name, { type: t, v: -1 });
        }
      }
      break;
    }
    case 2: {
      const f = st.fields.get(name);
      if (f && (f.v < 0 || f.type === "Dynamic" || f.type === "MTW")) f.v = Math.floor(r() * 2);
      break;
    }
    case 3:
      st.il = true;
      break;
    case 4:
      if (st.il) st.ol = true;
      break;
    case 5:
      if (st.il) st.ready = true;
      break;
    case 6:
      st.kv.set(pick(["k1", "k2"]), String(Math.floor(r() * 3)));
      break;
    case 7:
      if (r() < 0.3) st.err = true;
      break;
    case 8:
      if (r() < 0.3) st.final = true;
      break;
  }
}

type Reader = { name: string; read: (t: PlTreeState, w: W) => string };
const readers: Reader[] = [
  { name: "inputsLocked", read: (t, w) => String(t.get(new W(), R).getInputsLocked(w)) },
  { name: "outputsLocked", read: (t, w) => String(t.get(new W(), R).getOutputsLocked(w)) },
  { name: "readyOrError", read: (t, w) => String(t.get(new W(), R).getIsReadyOrError(w)) },
  { name: "error", read: (t, w) => String(t.get(new W(), R).getError(w)) },
  { name: "isFinal", read: (t, w) => String(t.get(new W(), R).getIsFinal(w)) },
  { name: "listInput", read: (t, w) => t.get(new W(), R).listInputFields(w).sort().join() },
  { name: "listOutput", read: (t, w) => t.get(new W(), R).listOutputFields(w).sort().join() },
  { name: "listDynamic", read: (t, w) => t.get(new W(), R).listDynamicFields(w).sort().join() },
  ...["k1", "k2"].map(
    (k): Reader => ({
      name: "kv:" + k,
      read: (t, w) => String(t.get(new W(), R).getKeyValueString(w, k)),
    }),
  ),
  ...NAMES.flatMap((n): Reader[] => [
    {
      name: "get:" + n,
      read: (t, w) => {
        const u: string[] = [];
        const v = t.get(new W(), R).getField(w, n, (m) => u.push(m));
        return JSON.stringify(v) + (u.length ? "|unstable" : "");
      },
    },
    {
      name: "req:" + n,
      read: (t, w) =>
        JSON.stringify(
          t.get(new W(), R).getField(w, { field: n, errorIfFieldNotFound: true }, () => {}),
        ),
    },
    ...(["Input", "Output", "Dynamic"] as const).map(
      (ty): Reader => ({
        name: `assert${ty}:${n}`,
        read: (t, w) =>
          JSON.stringify(
            t
              .get(new W(), R)
              .getField(
                w,
                { field: n, assertFieldType: ty, allowPermanentAbsence: true },
                () => {},
              ),
          ),
      }),
    ),
  ]),
];
function safeRead(rd: Reader, t: PlTreeState, w: W): string {
  try {
    return rd.read(t, w);
  } catch (e) {
    return "THROW:" + (e instanceof Error ? e.message.replace(/\d+/g, "#") : String(e));
  }
}

test("every modeled reader whose answer changes is notified", () => {
  const violations = new Map<string, number>();
  const example = new Map<string, string>();
  let invalidations = 0;
  for (let run = 0; run < RUNS; run++) {
    const r = rng(run + 1);
    const t = new PlTreeState(TestDynamicRootId1, DefaultFinalResourceDataPredicate);
    const st: St = {
      typeName: r() < 0.5 ? "StdMap" : "UserProject",
      il: false,
      ol: false,
      ready: false,
      err: false,
      final: false,
      fields: new Map(),
      kv: new Map(),
      removed: new Set(),
    };
    const rootB = {
      ...TestDynamicRootState1,
      fields: [dField("r", R), dField("v0", V[0]), dField("v1", V[1]), dField("e", E)],
    };
    const vals = [...V, E].map((id) => ({
      ...TestValueResourceState1,
      id,
      data: Buffer.from("x"),
    }));
    t.updateFromResourceData([rootB, ...vals, body(st)]);
    for (let step = 0; step < STEPS; step++) {
      const res = t.get(new W(), R);
      if (res.finalState) break;
      const before = readers.map((rd) => {
        const w = new W();
        return { rd, w, v: safeRead(rd, t, w) };
      });
      const prev = JSON.stringify(body(st));
      mutate(st, r);
      if (JSON.stringify(body(st)) === prev) continue;
      try {
        t.updateFromResourceData([body(st)]);
      } catch (e) {
        invalidations++;
        example.set("INVALIDATED", String(e).slice(0, 200));
        break;
      }
      for (const b of before) {
        const after = safeRead(b.rd, t, new W());
        // Oracle exclusion, per the contract at getField's locked branch ("stable absence of
        // field"): an asserted-type read (in practice Input/Output, whose lists lock) that
        // answered an absence stays right when a field of another type takes the name.
        const stableAbsence =
          b.rd.name.startsWith("assert") &&
          String(b.v) === "undefined" &&
          String(after).startsWith("THROW:Unexpected field type");
        if (String(after) !== String(b.v) && !b.w.isChanged && !stableAbsence) {
          const key = b.rd.name.replace(/:[a-d]$/, ":*");
          violations.set(key, (violations.get(key) ?? 0) + 1);
          if (!example.has(key)) example.set(key, `run ${run} step ${step}: ${b.v} -> ${after}`);
        }
      }
    }
  }
  expect({ invalidations, violations: [...violations], example: [...example] }).toEqual({
    invalidations: 0,
    violations: [],
    example: [],
  });
});

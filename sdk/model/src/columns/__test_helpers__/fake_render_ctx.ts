import type { UpstreamBlockCtx } from "@milaboratories/pl-model-common";
import type { AccessorHandle } from "../../render/internal";
import { GlobalCfgRenderCtxFeatureFlags } from "../../render/internal";
import type { CommonFieldTraverseOps, FieldTraversalStep } from "../../render/traversal_ops";
import { stubRenderCtx } from "./stub_render_ctx";

/** One resource of a fake tree: its type, input fields, JSON payload and own error. */
export type FakeResource = {
  readonly type: string;
  readonly fields?: Readonly<Record<string, FakeField>>;
  readonly data?: unknown;
  readonly error?: string;
};

/** One input field, or one block output field: a value, an error message, both, or neither. */
export type FakeField = { readonly value?: FakeResource; readonly error?: string };

export type FakeRenderCtxOptions = {
  readonly main?: FakeField;
  readonly staging?: FakeField;
  readonly pool?: ReadonlyArray<{ readonly blockId: string; readonly prod: FakeResource }>;
  /**
   * Model a desktop built before column errors: no `getAccessorErrorByName`,
   * no `getFieldError`, no `columnErrorsSupport` flag.
   */
  readonly olderHost?: boolean;
};

/**
 * Test-only render ctx over fake resource trees, answering the calls
 * `TreeNodeAccessor` and the column providers make. Like the host, looking up
 * a block output, or traversing a field, that has an error and no value
 * throws that error. `lookups` records every block output lookup.
 */
export function fakeRenderCtx(options: FakeRenderCtxOptions) {
  const resources = new Map<AccessorHandle, FakeResource>();
  const handles = new WeakMap<FakeResource, AccessorHandle>();
  const handleOf = (resource: FakeResource): AccessorHandle => {
    let handle = handles.get(resource);
    if (handle === undefined) {
      handle = newHandle();
      resources.set(handle, resource);
      handles.set(resource, handle);
    }
    return handle;
  };
  const resourceOf = (handle: AccessorHandle): FakeResource => {
    const resource = resources.get(handle);
    if (resource === undefined) throw new Error(`fakeRenderCtx: unknown handle ${handle}`);
    return resource;
  };
  /** A fresh error resource carrying `message`, as the backend serializes it. */
  const errorHandle = (message: string) => handleOf({ type: "json", data: { message } });

  const outputs: Record<string, FakeField | undefined> = {
    main: options.main,
    staging: options.staging,
  };
  const lookups: string[] = [];

  const ctx = stubRenderCtx({
    featureFlags: options.olderHost ? undefined : GlobalCfgRenderCtxFeatureFlags,
    getAccessorHandleByName: (name) => {
      lookups.push(name);
      const output = outputs[name];
      if (output?.value === undefined && output?.error !== undefined) {
        throw new Error(output.error);
      }
      return output?.value === undefined ? undefined : handleOf(output.value);
    },
    getAccessorErrorByName: options.olderHost
      ? undefined
      : (name) => {
          const error = outputs[name]?.error;
          return error === undefined ? undefined : errorHandle(error);
        },
    getUpstreamBlockCtx: () =>
      (options.pool ?? []).map(
        ({ blockId, prod }): UpstreamBlockCtx<AccessorHandle> => ({
          blockId,
          prodCtx: handleOf(prod),
        }),
      ),
    getResourceType: (handle) => ({ name: resourceOf(handle).type, version: "1" }),
    listInputFields: (handle) => Object.keys(resourceOf(handle).fields ?? {}),
    getInputsLocked: () => true,
    getError: (handle) => {
      const error = resourceOf(handle).error;
      return error === undefined ? undefined : errorHandle(error);
    },
    getFieldError: options.olderHost
      ? undefined
      : (handle, field) => {
          const error = resourceOf(handle).fields?.[field]?.error;
          return error === undefined ? undefined : errorHandle(error);
        },
    resolveWithCommon: (
      handle: AccessorHandle,
      common: CommonFieldTraverseOps,
      ...steps: (FieldTraversalStep | string)[]
    ) => {
      let current = resourceOf(handle);
      for (const step of steps) {
        const ops = typeof step === "string" ? { ...common, field: step } : { ...common, ...step };
        const field = current.fields?.[ops.field];
        if (field === undefined) return undefined;
        if (field.value === undefined) {
          if (field.error === undefined || ops.pureFieldErrorToUndefined) return undefined;
          throw new Error(field.error);
        }
        current = field.value;
      }
      return handleOf(current);
    },
    hasData: (handle) => resourceOf(handle).data !== undefined,
    getDataAsString: (handle) => {
      const { data } = resourceOf(handle);
      return data === undefined || typeof data === "string" ? data : JSON.stringify(data);
    },
  });
  return { ctx, lookups };
}

/** A PFrame whose columns get healthy `.spec` / `.data` fields unless overridden. */
export function fakePFrame(
  columns: Readonly<Record<string, { spec?: FakeField; data?: FakeField }>>,
  { error }: { error?: string } = {},
): FakeResource {
  const fields: Record<string, FakeField> = {};
  for (const [name, { spec, data }] of Object.entries(columns)) {
    fields[`${name}.spec`] = spec ?? {
      value: { type: "json", data: { kind: "PColumn", name, valueType: "Int", axesSpec: [] } },
    };
    fields[`${name}.data`] = data ?? { value: { type: "json", data: {} } };
  }
  return { type: "PFrame", fields, error };
}

//
// Internals
//

let handleSeq = 0;

/**
 * Mint a handle unique across ctxs: the SDK memoises providers and field
 * reads by handle, so a reused handle would serve a previous test's tree.
 */
function newHandle(): AccessorHandle {
  return `fake-resource-${++handleSeq}` as AccessorHandle;
}

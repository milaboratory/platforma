import type { GlobalCfgRenderCtx } from "../../render/internal";

/**
 * Test-only render ctx: the supplied members as given, every other member
 * throws on access, so a test fails loudly when the code under test reaches
 * for something it did not stub.
 */
export function stubRenderCtx(members: Partial<GlobalCfgRenderCtx>): GlobalCfgRenderCtx {
  return new Proxy(members, {
    get(target, prop, receiver) {
      if (prop in target) return Reflect.get(target, prop, receiver);
      throw new Error(`stubRenderCtx: "${String(prop)}" is not stubbed`);
    },
  }) as GlobalCfgRenderCtx;
}

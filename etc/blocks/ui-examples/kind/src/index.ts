import { assertDeclaredParams, defineBlockKind } from "@platforma-sdk/block-kind";
import { name, version } from "../package.json" with { type: "json" };

/**
 * Init-params contract for the ui-examples block — deliberately empty. This
 * block is a showcase of `ui-vue` components, not an analysis: every field of
 * its `BlockData` is either demo state a page mutates by gesture
 * (`dynamicSections`, `datasets`, `dataTableV2`) or a desktop-signed,
 * session-local `ImportFileHandle` no template could serialize (`handles`).
 * `numbers` does drive the workflow, but its value is a fixture for the
 * arg/error-state demos rather than something a creator would pre-wire. So this
 * block takes no init params and `init` always returns the showcase defaults.
 */
export type BlockParams = Record<string, never>;

/**
 * The same contract at runtime, for params that arrive from a template file rather
 * than from typed code.
 *
 * Refusing every key is the whole point for an empty contract: a file that sets any key at
 * all is rejected naming that key, instead of having it ignored and applying a block that
 * looks configured and is not.
 */
function parseInitializationParams(value: unknown): BlockParams {
  assertDeclaredParams(value, []);

  return {};
}

export const kind = defineBlockKind<BlockParams>({
  name,
  version,
  parseInitializationParams,
});

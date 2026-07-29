import { defineBlockKind } from "@platforma-sdk/block-kind";
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

export const kind = defineBlockKind<BlockParams>({ name, version });

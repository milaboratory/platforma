import type { BlockConfigV3Generic, BlockConfigV4Generic } from "./block_config";
import type { BlockKindReference } from "./block_kind_ref";
import type { Code } from "./code";
import type { BlockRenderingMode } from "./types";

/** Container simplifying maintenance of forward and backward compatibility */
export type BlockConfigContainer = {
  readonly v4?: Omit<BlockConfigV4Generic, "code">;
  /** Actual config */
  readonly v3?: Omit<BlockConfigV3Generic, "code">;

  /** Config code bundle. Actually is required, but we keep it optional for backward compatibility */
  readonly code?: Code;

  /**
   * Reference to the block kind this config implements, in `{name}@{version}`
   * form. Version-independent block identity — lives at the container level
   * beside {@link code}, orthogonal to which render envelope (`v3`/`v4`)
   * applies. Optional for backward compatibility with kind-less blocks.
   */
  readonly kind?: BlockKindReference;

  //
  // Fields below are used to read previous config versions
  //

  /**
   * For backward compatibility
   * @deprecated
   */
  readonly sdkVersion?: string;

  /**
   * For backward compatibility
   * @deprecated
   */
  readonly renderingMode?: BlockRenderingMode;

  /**
   * For backward compatibility
   * @deprecated
   */
  readonly initialArgs?: unknown;

  /**
   * For backward compatibility
   * @deprecated
   */
  readonly canRun?: unknown;

  /**
   * For backward compatibility
   * @deprecated
   */
  readonly inputsValid?: unknown;

  /**
   * For backward compatibility
   * @deprecated
   */
  readonly sections?: unknown;

  /**
   * For backward compatibility
   * @deprecated
   */
  readonly outputs?: Record<string, unknown>;
};

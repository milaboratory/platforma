import type { BlockConfigV3Generic, BlockConfigV4Generic } from './block_config';
import type { Code } from './code';
import type { BlockRenderingMode } from './types';

/** Container simplifying maintenance of forward and backward compatibility */
export type BlockConfigContainer = {
  readonly v4?: Omit<BlockConfigV4Generic, 'code'>;
  /** Actual config */
  readonly v3?: Omit<BlockConfigV3Generic, 'code'>;

  /** Config code bundle. Actually is required, but we keep it optional for backward compatibility */
  readonly code?: Code;

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

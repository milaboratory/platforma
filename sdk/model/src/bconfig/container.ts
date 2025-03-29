import type { BlockRenderingMode } from '@milaboratories/pl-model-common';
import type { Code, TypedConfigOrString } from './types';
import type { BlockConfigV3 } from './v3';

/** Container simplifying maintenance of forward and backward compatibility */
export type BlockConfigContainer = {
  /** Actual config */
  readonly v3: Omit<BlockConfigV3, 'code'>;

  /** Config code bundle */
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
  readonly canRun?: TypedConfigOrString;

  /**
   * For backward compatibility
   * @deprecated
   */
  readonly inputsValid?: TypedConfigOrString;

  /**
   * For backward compatibility
   * @deprecated
   */
  readonly sections?: TypedConfigOrString;

  /**
   * For backward compatibility
   * @deprecated
   */
  readonly outputs?: Record<string, TypedConfigOrString>;
};

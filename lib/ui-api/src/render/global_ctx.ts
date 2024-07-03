import { Branded } from '../branding';

export const StagingAccessorName = 'staging';
export const MainAccessorName = 'main';

export type AccessorHandle = Branded<string, 'AccessorHandle'>

export interface GlobalCfgRenderCtx {
  readonly args: string;
  readonly uiState?: string;
  readonly callbackRegistry: Record<string, Function>;

  getAccessorHandleByName(name: string): AccessorHandle | undefined;

  resolveField(accessor: AccessorHandle, field: string): AccessorHandle | undefined;

  getResourceValueAsString(accessor: AccessorHandle): string | undefined;
}

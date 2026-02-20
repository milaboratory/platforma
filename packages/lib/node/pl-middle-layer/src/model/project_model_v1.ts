/** Uses KV for uiState compared to V2 */
export const SchemaVersionV1 = "1";

export const BlockFrontendStateKeyPrefixV1 = "BlockFrontendState/";
export const BlockFrontendStateKeyPatternV1 = /^BlockFrontendState\/(?<blockid>.*)$/;

export function blockFrontendStateKeyV1(blockId: string): string {
  return `${BlockFrontendStateKeyPrefixV1}${blockId}`;
}

/** Returns block id, or undefined if key does not match the pattern. */
export function parseBlockFrontendStateKeyV1(key: string): string | undefined {
  const match = key.match(BlockFrontendStateKeyPatternV1);
  if (match === null) return undefined;
  return match.groups!["blockid"];
}

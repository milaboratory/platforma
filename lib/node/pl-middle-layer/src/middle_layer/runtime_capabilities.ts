import { RuntimeCapabilities } from '@platforma-sdk/model';

export function getRuntimeCapabilities(): RuntimeCapabilities {
  const capabilities = new RuntimeCapabilities();
  capabilities.addSupportedRequirement('requiresUIAPIVersion', 1);
  return capabilities;
}

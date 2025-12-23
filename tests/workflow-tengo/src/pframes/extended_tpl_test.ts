import type { ComputableStableDefined } from '@milaboratories/computable';
import { Computable } from '@milaboratories/computable';
import type { DownloadDriver } from '@milaboratories/pl-drivers';
import type { ResourceType } from '@milaboratories/pl-middle-layer';
import type { PlTreeEntry } from '@milaboratories/pl-tree';
import { notEmpty } from '@milaboratories/ts-helpers';
import { tplTest } from '@platforma-sdk/test';
import { expect } from 'vitest';

export type SimpleNodeResource = {
  type: 'Resource';
  resourceType: ResourceType;
  data?: string;
  inputs: Record<string, SimpleNode>;
};

export type SimpleNodeJson = {
  type: 'Json';
  content: unknown;
};

export type SimpleNodeBlob = {
  type: 'Blob';
  content: Uint8Array;
};

export type SimpleNode = SimpleNodeResource | SimpleNodeBlob | SimpleNodeJson;

export function simpleTree(downloadDriver: DownloadDriver, node: PlTreeEntry): ComputableStableDefined<SimpleNode> {
  return Computable.make((ctx) => {
    const acc = ctx.accessor(node).node();
    if (!acc.getIsReadyOrError()) {
      ctx.markUnstable('not_ready');
      return undefined;
    }
    if (acc.resourceType.name.startsWith('Blob')) {
      return {
        type: 'Blob' as const,
        content: downloadDriver.getComputableContent(acc.persist()),
      };
    } else if (acc.resourceType.name.toLowerCase().startsWith('json')) {
      return {
        type: 'Json' as const,
        content: acc.getDataAsJson(),
      };
    } else {
      return {
        type: 'Resource' as const,
        resourceType: acc.resourceType,
        data: acc.getDataAsString(),
        inputs: Object.fromEntries(acc.listInputFields().map((i) => [i, simpleTree(downloadDriver, notEmpty(acc.traverse(i)).persist())])),
      };
    }
  }) as ComputableStableDefined<SimpleNode>;
}

export function assertResource(node?: SimpleNode): asserts node is SimpleNodeResource {
  expect(node?.type).toEqual('Resource');
};

export function assertBlob(node?: SimpleNode): asserts node is SimpleNodeBlob {
  expect(node?.type).toEqual('Blob');
};

export function assertJson(node?: SimpleNode): asserts node is SimpleNodeJson {
  expect(node?.type).toEqual('Json');
};

export type SimpleTreeHelper = {
  tree(node: PlTreeEntry): ComputableStableDefined<SimpleNode>;
  // assertResource: (node?: SimpleNode) => asserts node is SimpleNodeResource;
  // assertBlob: (node?: SimpleNode) => asserts node is SimpleNodeBlob;
  // assertJson: (node?: SimpleNode) => asserts node is SimpleNodeJson;
};

export const eTplTest = tplTest.extend<{
  stHelper: SimpleTreeHelper;
}>({
  stHelper: async ({ driverKit }, use) => {
    const downloadDriver = driverKit.blobDriver;
    await use({
      tree: (node) => simpleTree(downloadDriver, node),
    });
  },
});

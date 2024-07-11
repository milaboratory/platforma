import {
  blockFrontendStateKey,
  parseBlockFrontendStateKey,
  parseProjectField,
  ProjectField,
  projectFieldName,
  ProjectStructureKey
} from './project_model';
import { randomUUID } from 'node:crypto';

test('project field parsing test', () => {
  const field: ProjectField = { fieldName: 'stagingCtx', blockId: randomUUID() };
  const fieldName = projectFieldName(field.blockId, field.fieldName);
  expect(parseProjectField(fieldName)).toStrictEqual(field);
});

test('frontend state key parsing success', () => {
  const frontendStateKey = blockFrontendStateKey('the-block-id');
  const blockId = parseBlockFrontendStateKey(frontendStateKey);
  expect(blockId).toEqual('the-block-id');
});

test('frontend state key parsing failure', () => {
  expect(parseBlockFrontendStateKey('some-random-key')).toBeUndefined();
  expect(parseBlockFrontendStateKey(ProjectStructureKey)).toBeUndefined();
});

import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import {
  parseProjectField,
  ProjectField,
  projectFieldName
} from './project_model';

test('project field parsing test', () => {
  const field: ProjectField = { fieldName: 'stagingCtx', blockId: randomUUID() };
  const fieldName = projectFieldName(field.blockId, field.fieldName);
  expect(parseProjectField(fieldName)).toStrictEqual(field);
});

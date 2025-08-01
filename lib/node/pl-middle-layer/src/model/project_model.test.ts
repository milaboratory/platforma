import {
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

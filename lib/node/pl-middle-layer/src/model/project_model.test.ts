import { parseProjectField, ProjectField, projectFieldName } from './project_model';
import { randomUUID } from 'node:crypto';

test('project field parsing test', () => {
  const field: ProjectField = { fieldName: 'stagingCtx', blockId: randomUUID() };
  const fieldName = projectFieldName(field);
  expect(parseProjectField(fieldName)).toStrictEqual(field);
});

import { test } from 'vitest';
import * as pl from './pl';
import { ConsoleLoggerAdapter, MiLogger } from '@milaboratories/ts-helpers';

test('simple repo test', async ({ expect }) => {
  const logger = new ConsoleLoggerAdapter();
  pl.runPl(logger, {
  })
});

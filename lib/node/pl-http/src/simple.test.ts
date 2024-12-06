import { test } from 'vitest';
import { defaultHttpDispatcher } from '.';
import { request } from 'undici';

test('simple http request', async ({ expect }) => {
  const dispatcher = defaultHttpDispatcher();
  const response = await request(
    'https://blocks.pl-open.science/v2/milaboratories/repertoire-diversity/overview.json',
    {
      dispatcher: dispatcher
    }
  );
  const responseBody = (await response.body.json()) as any;
  expect(responseBody?.versions?.length).toBeGreaterThan(1);
});

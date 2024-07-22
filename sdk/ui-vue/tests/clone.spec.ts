import { test } from 'vitest';
import { faker } from '@faker-js/faker';
import { deepClone, deepEqual } from '@milaboratory/helpers/objects';
import { range, toList, performanceTimer, call } from '@milaboratory/helpers/utils';

function createRandomUser(): unknown {
  return {
    userId: faker.string.uuid(),
    username: faker.internet.userName(),
    email: faker.internet.email(),
    avatar: faker.image.avatar(),
    password: faker.internet.password(),
  };
}

function createRandomObject(): unknown {
  return {
    label: faker.string.uuid(),
    users: toList(range(0, 15000)).map(() => createRandomUser()),
  };
}

const simpleClone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

test('Clone vs structured clone', async () => {
  const a = createRandomObject();
  console.log('a', a);

  call(() => {
    const dt = performanceTimer();

    const copy = simpleClone(a);

    console.log('copy simpleClone', dt(), 'ms', deepEqual(copy, a));
  });

  call(() => {
    const dt = performanceTimer();

    const copy = deepClone(a);

    console.log('copy deepClone', dt(), 'ms', deepEqual(copy, a));
  });

  call(() => {
    const dt = performanceTimer();

    const copy = structuredClone(a);

    console.log('copy structured', dt(), 'ms', deepEqual(copy, a));
  });
});

import { faker } from '@faker-js/faker';
import { range, toList } from '@milaboratories/helpers';

export type WEvent = {
  type: 'query';
  limit: number;
  offset: number;
};

export type Person = {
  id: number;
  name: string;
  age: number;
  bio: string;
  job: string;
};

const data = toList(range(0, 20000)).map((id) => ({
  id,
  name: faker.person.fullName(),
  age: faker.number.int(),
  bio: faker.person.bio(),
  job: faker.person.jobType(),
}));

onmessage = (e: { data: WEvent }) => {
  const { offset, limit } = e.data;
  const workerResult = data.slice(offset, offset + limit);
  postMessage(workerResult);
};

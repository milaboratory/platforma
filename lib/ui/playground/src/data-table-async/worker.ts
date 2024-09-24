import { faker } from '@faker-js/faker';
import { range, toList } from '@milaboratory/helpers/utils';

export type WEvent = {
  type: 'query';
  limit: number;
  offset: number;
};

export type Person = {
  id: number;
  name: string;
  age: number;
  gender: string;
  job: string;
};

const data = toList(range(0, 20000)).map((id) => ({
  id,
  name: faker.person.fullName(),
  age: faker.number.int(),
  gender: faker.person.gender(),
  job: faker.person.jobType(),
}));

onmessage = (e: { data: WEvent }) => {
  const { offset, limit } = e.data;
  const workerResult = data.slice(offset, offset + limit);
  postMessage(workerResult);
};

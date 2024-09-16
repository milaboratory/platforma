import {
  createGlobalResourceId,
  createLocalResourceId,
  NullResourceId,
  resourceIdFromString,
  resourceIdToString
} from './types';

test.each(
  [
    NullResourceId,
    createGlobalResourceId(true, 0x3457748574857n),
    createGlobalResourceId(false, 0x3457748574857n),
    createLocalResourceId(true, 1234, 34423),
    createLocalResourceId(false, 1234, 34423)
  ].map((rid) => ({
    name: resourceIdToString(rid),
    rid
  }))
)(`resource id to and from string: $name`, ({ rid }) => {
  expect(resourceIdFromString(resourceIdToString(rid))).toEqual(rid);
});

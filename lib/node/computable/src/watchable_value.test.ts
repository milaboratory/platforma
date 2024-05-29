import { WatchableValue } from './watchable_value';
import { computable } from './computable/computable_helpers';
import { combineProviders } from './computable/accessor_provider';

test('simple observable', async () => {
  const obs1 = new WatchableValue(1);
  const obs2 = new WatchableValue(2);

  const c = computable(combineProviders({ obs1, obs2 }), {},
    ({ obs1, obs2 }) => {
      if (obs1.getValue() % 2 === 0)
        return obs1.getValue();
      else
        return obs2.getValue();
    });

  expect(c.isChanged()).toEqual(true);
  expect(await c.getValue()).toEqual(2);

  obs2.setValue(3);
  expect(c.isChanged()).toEqual(true);
  expect(await c.getValue()).toEqual(3);

  obs1.setValue(2);
  expect(c.isChanged()).toEqual(true);
  const fullValue = await c.getValueOrError();
  if (fullValue.type !== 'ok')
    fail();
  expect(fullValue.value).toEqual(2);

  obs2.setValue(1);
  expect(c.isChanged()).toEqual(false);
  expect(c.isChanged(fullValue.uTag)).toEqual(false);
  expect(c.isChanged('someTag')).toEqual(true);
});

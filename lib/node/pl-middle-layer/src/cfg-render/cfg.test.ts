import { BlockConfigBuilder, ConfigResult, getJsonField, Inputs } from '@milaboratory/sdk-block-config';
import { computableFromCfg } from './ctx';

test('simple cfg test', async () => {
  const input = {
    theC: 'c',
    a: { c: 'hi' }
  };
  const theCValue = getJsonField(Inputs, 'theC');
  const cfg = BlockConfigBuilder.create<typeof input>()
    .output('out1', getJsonField(getJsonField(Inputs, 'a'), theCValue))
    .build();
  const ctx = { $inputs: input };
  const computable = computableFromCfg(ctx, cfg.outputs['out1']);
  const r = (await computable.getValue()) as ConfigResult<typeof cfg.outputs['out1'], typeof ctx>;
  expect(r).toEqual('hi');
});

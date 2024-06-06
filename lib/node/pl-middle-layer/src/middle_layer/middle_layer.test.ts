import { TestHelpers } from '@milaboratory/pl-client-v2';
import { MiddleLayer } from './middle_layer';

test('project list manipulations test', async () => {
  await TestHelpers.withTempRoot(async pl => {
    const ml = await MiddleLayer.init(pl);
    const projectList = ml.projectList;

    expect(await projectList.awaitStableValue()).toEqual([]);

    const pRid1 = await ml.addProject('id1', { name: 'Project 1' });

    await projectList.refreshState();

    expect(await projectList.getValue()).toStrictEqual([{ id: 'id1', rid: pRid1, meta: { name: 'Project 1' } }]);

    await ml.removeProject('id1');

    await projectList.refreshState();

    expect(await projectList.awaitStableValue()).toEqual([]);
  });
});

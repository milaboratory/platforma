import { testIntegration, withTestClient } from '../tests/common';
import { computable } from '../../../ts-computable/src/simple_computable';
import { PlTreeState, loadResourcesClosure } from './tree_state';
import {
    $Resource,
    Client,
    FieldType,
    Transaction
} from '@milaboratory/pl-ts-client';
import type { PlGrpc } from '@milaboratory/pl-ts-client';
import { mapValueAndErrorIfDefined } from './test_utils';

function rType(name: string, version: string) {
    return { name: name, version: version } as PlGrpc.ResourceType;
}

async function setField(
    tx: Transaction,
    fromRes: $Resource,
    fName: string,
    fType: FieldType,
    target: $Resource
) {
    return tx.createFieldAndSet({
        field: fromRes.FieldID(fName),
        fieldType: fType,
        target: target
    });
}

async function createProject(c: Client): Promise<bigint[]> {
    return c.writableTx(async (tx: Transaction) => {
        const user = tx.createRoot(rType('User', '1'), { clean: true });
        const project = tx.createResourceStruct(rType('Project', '1'), {});
        const block = tx.createResourceStruct(rType('Block', '1'), {});
        const snapshot = tx.createResourceStruct(rType('Snapshot', '1'), {});
        const results = tx.createValue({
            name: 'json/number',
            version: '1',
            value: 42
        });

        await setField(tx, user, 'project1', FieldType.DYNAMIC, project);
        await setField(tx, project, 'block1', FieldType.DYNAMIC, block);
        await setField(tx, block, 'staging', FieldType.DYNAMIC, snapshot);
        await setField(
            tx,
            snapshot,
            'block1',
            FieldType.ONE_TIME_WRITABLE,
            results
        );

        return [
            await user.ID(),
            await project.ID(),
            await block.ID(),
            await snapshot.ID(),
            await results.ID()
        ];
    }, 'TreeDriverCreateTestProject');
}

testIntegration('load resources', async () => {
    await withTestClient(async (client) => {
        const rIds = await createProject(client);
        await client.readableTx(async (tx: Transaction) => {
            const resources = await loadResourcesClosure(tx, [rIds[0]]);
            expect(resources).toHaveLength(5);
            expect(resources.map((r) => r.id)).toStrictEqual(rIds);
        }, 'TreeDriverLoadResourcesTest');
    });
});

testIntegration('load and update a tree', async () => {
    await withTestClient(async (client) => {
        const rIds = await createProject(client);
        const tree = new PlTreeState(rIds[0], client);
        const c1 = computable(tree, (b) => {
            const res = b.traverseFromRoot(
                {},
                'project1',
                'block1',
                'staging',
                'block1'
            );
            return mapValueAndErrorIfDefined(res, (r) => r.getDataAsJson());
        });
        expect(c1.changed).toBeTruthy();
        expect(c1.get()).toBeUndefined();
        expect(c1.changed).toBeFalsy();

        await tree.loadAndUpdate();
        expect(c1.changed).toBeTruthy();
        expect(c1.get()).toStrictEqual({ value: 42 });
    });
});

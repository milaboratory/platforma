import { describe, it, expect } from 'vitest'
import { reactive } from 'vue'
import { createModel } from '@platforma-sdk/ui-vue';
import { delay } from '@milaboratories/helpers'

describe('createModel', async () => {
  it('link source', async () => {
    const data = reactive({
      user: {
        age: 0,
      }
    });

    let saveCount = 0;

    const $user = createModel({
      get() {
        return data.user;
      },
      autoSave: true,
      onSave(v) {
        console.log('perform save');
        saveCount++;
        data.user = v as {age: number};
      },
    });

    data.user = {
      age: 1
    }; // source change @TODO add deep watch for source

    await delay(1);

    expect(saveCount).toEqual(0);

    expect(data.user.age === $user.model.age).toEqual(true);

    await delay(1);

    $user.model.age = 2; // model change

    await delay(1);

    expect(saveCount).toEqual(1);

    expect(data.user.age === $user.model.age).toEqual(true);
  });

  it('primitive source', async () => {
    const data = reactive({
      user: {
        age: 0,
      }
    });

    let saveCount = 0;

    const $age = createModel({
      get() {
        return data.user.age;
      },
      autoSave: true,
      onSave(v) {
        console.log('perform save');
        saveCount++;
        data.user.age = v as number;
      },
    });

    data.user.age = 1; // source change

    await delay(1);

    expect(saveCount).toEqual(0);

    expect(data.user.age === $age.model).toEqual(true);

    await delay(1);

    $age.model = 2; // model change

    await delay(1);

    expect(saveCount).toEqual(1);

    expect(data.user.age === $age.model).toEqual(true);
  });
})

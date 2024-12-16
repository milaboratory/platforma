import { describe, it, expect } from 'vitest';

import { mount } from '@vue/test-utils';
import { defineApp } from '@platforma-sdk/ui-vue';
import { platforma } from '../blocks/sum/model';
import { createApp, defineComponent, isReactive, watch } from 'vue';
import { Deferred, delay } from '@milaboratories/helpers';

const Page = defineComponent({
  // type inference enabled
  template: `<div id="app"></div>`,
});

export const sdkPlugin = defineApp(platforma, () => {
  return {
    routes: {
      '/': Page,
    },
  };
}, {
  debounceSpan: 0,
});

describe('BlockSum', () => {
  it('simple sum', async () => {
    const wrapper = mount({ template: `<div><div id="app">🔌 Plugin</div></div>` }, {});

    createApp(wrapper).use(sdkPlugin);

    await delay(1);

    const app = sdkPlugin.useApp();

    expect(isReactive(app)).toBeTruthy();

    let settled = new Deferred<void>();

    watch(() => app.snapshot.outputs, () => {
      settled.resolve();
    });

    app.model.args.x = 3;

    app.model.args.y = 3;

    await delay(1);

    expect(app.model.outputs.sum).toEqual(6);

    app.model.args.x = 6;

    app.model.args.y = 6;

    settled = new Deferred<void>();

    await settled.promise;

    expect(app.model.outputs.sum).toEqual(12);

    app.model.args.x = 1;

    app.model.args.y = 1;

    settled = new Deferred<void>();

    await settled.promise;

    expect(app.model.outputs.sum).toEqual(2);
  });
});

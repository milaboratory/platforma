import { describe, it, expect } from 'vitest';

import { mount } from '@vue/test-utils';
import { defineApp } from '@platforma-sdk/ui-vue';
import { platforma } from '../blocks/sum/model';
import { createApp, defineComponent, isReactive } from 'vue';
import { delay } from '@milaboratories/helpers';

const Page = defineComponent({
  // type inference enabled
  template: `<div id="app"></div>`
})

export const sdkPlugin = defineApp(platforma, () => {
  return {
    routes: {
      '/': Page,
    },
  };
});

describe('BlockSum', () => {
  it('simple sum', async () => {
    const wrapper = mount({ template: `<div><div id="app">🔌 Plugin</div></div>` }, {});

    createApp(wrapper).use(sdkPlugin);

    await delay(1);

    const app = sdkPlugin.useApp();

    expect(isReactive(app)).toBeTruthy();

    app.model.args.x = 3;

    app.model.args.y = 3;

    await delay(1);

    expect(app.outputs.sum).toEqual({
      ok: true,
      value: 6
    });

    app.model.args.x = 6;

    app.model.args.y = 6;

    await delay(1);

    expect(app.outputs.sum).toEqual({
      ok: true,
      value: 6
    });
  });
});

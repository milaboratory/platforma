import { describe, it, expect } from 'vitest';

import { mount } from '@vue/test-utils';
import PlAutocomplete from '../PlAutocomplete.vue';
import { delay } from '@milaboratories/helpers';

describe('PlAutocomplete', () => {
  it('modelValue', async () => {
    const options = [
      { text: 'Option 1', value: 1 },
      { text: 'Option 2', value: 2 },
    ];
    const wrapper = mount(PlAutocomplete, {
      props: {
        'modelValue': 1,
        'onUpdate:modelValue': (e: unknown) => wrapper.setProps({ modelValue: e }),
        'optionsSearch': (_str: string) => {
          return Promise.resolve(options);
        },
      },
    });

    await delay(10);
    await wrapper.find('.pl-autocomplete__envelope').trigger('click');
    await wrapper.find('input').trigger('focus');
    await wrapper.find('input').setValue('option');
    await delay(600);

    const optionsRendered = [...document.body.querySelectorAll('.dropdown-list-item')] as HTMLElement[];

    expect(optionsRendered.length).toBe(2);

    optionsRendered[1].click();

    await delay(20);

    expect(wrapper.props('modelValue')).toBe(2);

    expect(await wrapper.findAll('.dropdown-list-item').length).toBe(0); // options are closed after click
  });
});

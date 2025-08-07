import { describe, it, expect } from 'vitest';

import { mount } from '@vue/test-utils';
import PlAutocompleteMulti from '../PlAutocompleteMulti.vue';
import { delay } from '@milaboratories/helpers';

describe('PlAutocompleteMulti', () => {
  it('modelValue', async () => {
    const wrapper = mount(PlAutocompleteMulti, {
      props: {
        'modelValue': [1],
        'onUpdate:modelValue': (e) => wrapper.setProps({ modelValue: e }),
        'debounce': 0,
        'modelSearch': async (values) => {
          return [
            { label: 'Option 1', value: 1 },
            { label: 'Option 2', value: 2 },
          ].filter((v) => values.includes(v.value));
        },
        'optionsSearch': async () => {
          return [
            { label: 'Option 1', value: 1 },
            { label: 'Option 2', value: 2 },
          ];
        },
      },
    });

    await delay(10);
    await wrapper.find('.pl-autocomplete-multi__envelope').trigger('click');
    await wrapper.find('input').trigger('focus');

    const getOptions = () => [...document.body.querySelectorAll('.dropdown-list-item')] as HTMLElement[];

    await delay(1);

    const options = getOptions();

    expect(options.length).toBe(2);

    options[1].click();

    await delay(20);

    expect(wrapper.props('modelValue')).toEqual([1, 2]);

    expect(getOptions().length).toBe(2); // options are not closed after click
  });
});

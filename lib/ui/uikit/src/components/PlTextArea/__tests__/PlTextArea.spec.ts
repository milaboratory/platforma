import { describe, it, expect } from 'vitest';

import { mount } from '@vue/test-utils';
import PlTextArea from '../PlTextArea.vue';

describe('TextArea', () => {
  it('renders properly', () => {
    const wrapper = mount(PlTextArea, {
      props: {
        label: 'Label',
      },
    });
    expect(wrapper.text()).toContain('Label');
  });

  it('modelValue', async () => {
    const wrapper = mount(PlTextArea, {
      props: {
        'modelValue': 'initialText',
        'onUpdate:modelValue': (e) => wrapper.setProps({ modelValue: e }),
      },
    });

    await wrapper.find('textarea').setValue('test');
    expect(wrapper.props('modelValue')).toBe('test');
  });
});

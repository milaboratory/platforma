import { describe, it, expect } from 'vitest';

import { mount } from '@vue/test-utils';
import BtnPrimary from '../PlBtnPrimary.vue';

describe('BtnPrimary', () => {
  it('renders properly', () => {
    const wrapper = mount(BtnPrimary, {
      slots: {
        default: 'Button text',
      },
    });
    expect(wrapper.text()).toContain('Button text');
  });
});

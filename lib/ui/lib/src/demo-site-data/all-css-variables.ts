export function allCssVariables(): Record<
  string,
  {
    title: string;
    data: Record<
      string,
      {
        light: [boolean, boolean];
        value: [string, string];
        description: string;
      }
    >;
  }
> {
  return {
    txtSec: {
      title: 'Text',
      data: {
        '--txt-00': {
          light: [false, false],
          value: ['#FFFFFF', '#FFFFFF'],
          description: 'Text on the colored elements',
        },
        '--txt-01': {
          light: [true, false],
          value: ['#110529', '#FFFFFF'],
          description: 'Primary text layer',
        },
        '--txt-02': {
          light: [true, false],
          value: ['#231842', '#ADAEB8'],
          description: 'Secondary text layer - large arrays of text',
        },
        '--txt-03': {
          light: [true, true],
          value: ['#9D9EAE', '#60616B'],
          description: 'Tetritary text layer - hints and descriptions',
        },
        '--txt-mask': {
          light: [false, true],
          value: ['#CFD1DB', '#3D3D42'],
          description: 'Text mask in inputs, icons, etc.',
        },
        '--txt-focus': {
          light: [true, true],
          value: ['#07AD3E', '#87E087'],
          description: 'Colored text in active/focus elements',
        },
        '--txt-error': {
          light: [true, true],
          value: ['#F1222F', '#FF5C5C'],
          description: 'Colored text in error elements',
        },
        '--txt-link': {
          light: [true, true],
          value: ['#5F31CC', '#9470FF'],
          description: 'Colored text in links',
        },
      },
    },
    iconSec: {
      title: 'Icon',
      data: {
        '--ic-00': {
          light: [false, false],
          value: ['#FFFFFF', '#FFFFFF'],
          description: 'Icons on colored elements',
        },
        '--ic-01': {
          light: [true, false],
          value: ['#110529', '#FFFFFF'],
          description: 'Primary elements',
        },
        '--ic-02': {
          light: [false, true],
          value: ['#CFD1DB', '#60616B'],
          description: 'Secondary & tetritary elements',
        },
        '--ic-accent': {
          light: [true, false],
          value: ['#07AD3E', '#87E087'],
          description: 'Focus/active elements',
        },
      },
    },
    borderSec: {
      title: 'Border',
      data: {
        '--border-color-default': {
          light: [true, true],
          value: ['#110529', '#60616B'],
          description: 'Main border for components',
        },
        '--border-color-hover': {
          light: [true, true],
          value: ['#231842', '#ADAEB8'],
          description: 'Hover on main border',
        },
        '--border-color-focus': {
          light: [false, false],
          value: ['#49CC49', '#49CC49'],
          description: 'Active border for components',
        },
        '--border-color-error': {
          light: [false, false],
          value: ['#FF5C5C', '#FF5C5C'],
          description: 'Error border for components',
        },
        '--border-color-div-grey': {
          light: [false, true],
          value: ['#E1E3EB', '#232329'],
          description: 'Divider lines low contrast',
        },
        '--border-color-div-bw': {
          light: [false, true],
          value: ['#FFFFFF', '#000000'],
          description: 'Divider lines hight contrast',
        },
      },
    },
    btnSec: {
      title: 'Button',
      data: {
        '--btn-accent-default': {
          light: [true, true],
          value: ['#845CFF', ' #5F31CC'],
          description: 'Accent coloured button',
        },
        '--btn-accent-hover': {
          light: [true, true],
          value: ['#9470FF', ' #5F31CC'],
          description: 'Hover on accent coloured button',
        },
        '--btn-accent-press': {
          light: [true, true],
          value: ['#6F4DD6', '#5F31CC'],
          description: 'Pressed on accent coloured button',
        },
        '--btn-primary-default': {
          light: [true, true],
          value: ['#110529', '#5F31CC'],
          description: 'Primary button',
        },
        '--btn-primary-hover': {
          light: [true, true],
          value: ['#231842', '#6D3DDB'],
          description: 'Hover on primary button',
        },
        '--btn-primary-press': {
          light: [true, true],
          value: ['#080214', '#5328B8'],
          description: 'Hover on primary button',
        },
        '--btn-sec-hover-white': {
          light: [false, true],
          value: ['rgba(255, 255, 255, 0.50)', 'rgba(131, 131, 163, 0.16)'],
          description: 'Hover background on transparent button',
        },
        '--btn-sec-hover-grey': {
          light: [false, true],
          value: ['rgba(155, 171, 204, 0.16)', 'rgba(131, 131, 163, 0.16)'],
          description: 'Hover background on ghost button & icons',
        },
        '--btn-sec-press-grey': {
          light: [false, true],
          value: ['rgba(155, 171, 204, 0.24)', 'rgba(131, 131, 163, 0.24)'],
          description: 'Hover background on ghost button & icons',
        },
        '--btn-active-select': {
          light: [false, true],
          value: ['rgba(99, 224, 36, 0.24)', 'rgba(99, 224, 36, 0.24)'],
          description: 'Fill on selected elements',
        },
        '--btn-switcher': {
          light: [false, true],
          value: ['linear-gradient(180deg, #A1E59C 0%, #D0F5B0 100%)', '#5E5E70'],
          description: 'Gradient on active controll/switcher element',
        },
      },
    },
    disSec: {
      title: 'Disable',
      data: {
        '--dis-00': {
          light: [false, true],
          value: ['#FFFFFF', '#65656B'],
          description: 'Elements on dis-01, labels, texts, icons',
        },
        '--dis-01': {
          light: [false, true],
          value: ['#CFD1DB', '#3D3D42'],
          description: 'Buttons, borders, labels, texts, icons',
        },
      },
    },
    bgSec: {
      title: 'Background',
      data: {
        '--bg-base-dark': {
          light: [true, true],
          value: ['#110529', '#0D0D0F'],
          description: 'Default dark block background',
        },
        '--bg-base-light': {
          light: [false, true],
          value: ['#F7F8FA', '#0D0D0F'],
          description: 'Default light block background',
        },
        '--bg-elevated-01': {
          light: [false, true],
          value: ['#FFFFFF', '#1B1B1F'],
          description: 'Default block background',
        },
        '--bg-elevated-02': {
          light: [false, true],
          value: ['#E1E3EB', '#2D2D33'],
          description: 'Secondary block background',
        },
      },
    },
    filledSec: {
      title: 'Filled',
      data: {
        '--filled-V-BG': {
          light: [false, true],
          value: ['#D0F0C0', 'rgba(66, 184, 66, 0.40)'],
          description: 'Text background selection on V-read',
        },
        '--filled-D-BG': {
          light: [false, true],
          value: ['#FFCECC', 'rgba(229, 83, 229, 0.40)'],
          description: 'Text background selection on D-read',
        },
        '--filled-N-BG': {
          light: [false, true],
          value: ['#FAF5AA', 'rgba(83, 82, 102, 0.40)'],
          description: 'Text background selection on C/N-read',
        },
        '--filled-J-BG': {
          light: [false, true],
          value: ['#DEDBFF', 'rgba(132, 92, 255, 0.40)'],
          description: 'Text background selection on J-read',
        },
      },
    },
    notificationSec: {
      title: 'Notification',
      data: {
        '--notification-neutral': {
          light: [false, true],
          value: ['linear-gradient(90deg, #D6D9FF 0%, #FFF 100%)', 'linear-gradient(90deg, #4D4D8F 0%, #292933 100%)'],
          description: 'Background on neutral blocks',
        },
        '--notification-success': {
          light: [false, true],
          value: ['linear-gradient(90deg, #C9F0B6 0%, #FFF 100%)', 'linear-gradient(90deg, #305C3E 0%, #292933 100%)'],
          description: 'Background on success blocks',
        },
        '--notification-warning': {
          light: [false, true],
          value: ['linear-gradient(90deg, #FEE0A3 0%, #FFF 100%)', 'linear-gradient(90deg, #754F2D 0%, #292933 100%)'],
          description: 'Background on warning blocks',
        },
        '--notification-error': {
          light: [false, true],
          value: ['linear-gradient(90deg, #FFB8B8 0%, #FFF 100%)', 'linear-gradient(90deg, #8F3343 0%, #292933 100%)'],
          description: 'Background on error blocks',
        },
      },
    },
    gradientSec: {
      title: 'Gradient',
      data: {
        '--gradient-blue-green': {
          light: [true, true],
          value: [
            'linear-gradient(0deg, #478063 0%, #2E4652 45.93%, #24223D 91.63%)',
            'linear-gradient(0deg, #478063 0%, #2E4652 45.93%, #24223D 91.63%)',
          ],
          description: 'Main brand dark gradient',
        },
        '--gradient-green-lime': {
          light: [false, true],
          value: ['linear-gradient(180deg, #A1E59C 0%, #D0F5B0 100%)', 'linear-gradient(0deg, #478063 0%, #2E4652 45.93%, #24223D 91.63%)'],
          description: 'Main brand light gradient',
        },
        '--gradient-blue-violet': {
          light: [false, true],
          value: ['linear-gradient(180deg, #ADB8FF 0%, #D6E9FF 100%)', 'linear-gradient(0deg, #478063 0%, #2E4652 45.93%, #24223D 91.63%)'],
          description: 'Main brand light gradient',
        },
        '--gradient-blue-clear': {
          light: [false, true],
          value: ['linear-gradient(180deg, #85BEFF 0%, #CEF 100%)', 'linear-gradient(0deg, #478063 0%, #2E4652 45.93%, #24223D 91.63%)'],
          description: 'Additional brand gradient',
        },
        '--gradient-orange': {
          light: [false, true],
          value: ['linear-gradient(180deg, #FFB766 0%, #FFEAA3 100%)', 'linear-gradient(0deg, #478063 0%, #2E4652 45.93%, #24223D 91.63%)'],
          description: 'Additional brand gradient',
        },
        '--gradient-mint': {
          light: [false, true],
          value: ['linear-gradient(180deg, #7DD1D1 0%, #C8FAE9 100%)', 'linear-gradient(0deg, #478063 0%, #2E4652 45.93%, #24223D 91.63%)'],
          description: 'Additional brand gradient',
        },
        '--gradient-lime': {
          light: [false, true],
          value: ['linear-gradient(180deg, #BFE062 0%, #E4FFAD 100%)', 'linear-gradient(0deg, #478063 0%, #2E4652 45.93%, #24223D 91.63%)'],
          description: 'Additional brand gradient',
        },
        '--gradient-rose': {
          light: [false, true],
          value: ['linear-gradient(0deg, #FFDDD6 0%, #FF99C9 100%)', 'linear-gradient(0deg, #478063 0%, #2E4652 45.93%, #24223D 91.63%)'],
          description: 'Additional brand gradient',
        },
        '--gradient-red': {
          light: [false, true],
          value: ['linear-gradient(0deg, #FFD5CC 0%, #FF9494 100%)', 'linear-gradient(0deg, #478063 0%, #2E4652 45.93%, #24223D 91.63%)'],
          description: 'Additional brand gradient',
        },
        '--gradient-violet': {
          light: [false, true],
          value: ['linear-gradient(180deg, #BCA3FF 0%, #E5E5FF 100%)', 'linear-gradient(0deg, #478063 0%, #2E4652 45.93%, #24223D 91.63%)'],
          description: 'Additional brand gradient',
        },
      },
    },
  };
}

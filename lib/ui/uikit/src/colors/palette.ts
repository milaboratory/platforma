/**
 * good for age range // from newborn → to old
 */
export const viridis = [
  '#FFF680',
  '#E8F66C',
  '#C4F16B',
  '#9AEB71',
  '#70E084',
  '#43D18A',
  '#2DBD96',
  '#28A8A0',
  '#2793A3',
  '#337B9E',
  '#3B6399',
  '#424C8F',
  '#4A3584',
  '#481B70',
  '#4A005C',
];

/**
 * from light → to hard (errors)
 */
export const magma = [
  '#FFF680',
  '#FFE871',
  '#FDCD6F',
  '#FEAD66',
  '#FA935F',
  '#F57258',
  '#EB555E',
  '#D64470',
  '#B83778',
  '#982D82',
  '#7E2584',
  '#611B84',
  '#49187A',
  '#38116B',
  '#2B125C',
];

/**
 * From light to hard
 */
const density = [
  '#DFFADC',
  '#C9F5D3',
  '#B3F2CF',
  '#9AEBCD',
  '#80DCCC',
  '#6DC8D2',
  '#61B7DB',
  '#5C97DB',
  '#5A7CD6',
  '#6060C7',
  '#674BB3',
  '#693799',
  '#6A277B',
  '#671D60',
  '#611347',
];

/**
 * From light to hard
 */
const salinity = [
  '#FAFAB4',
  '#ECFBA1',
  '#D6F598',
  '#BEEB91',
  '#A2E082',
  '#82D67C',
  '#67C77E',
  '#4FB281',
  '#429E8C',
  '#36898F',
  '#2B668F',
  '#254B85',
  '#213475',
  '#1E1E6B',
  '#1C0F5C',
];

/**
 * temperature // recommended for 5+ points
 */
const sunset = [
  '#FFEA80',
  '#FFD971',
  '#FFC171',
  '#FFA76C',
  '#FB8B6F',
  '#EB7179',
  '#D75F7F',
  '#C2518D',
  '#A64392',
  '#8038A4',
  '#6135A4',
  '#4735A3',
  '#283A8F',
  '#013C70',
  '#003752',
];

/**
 * hight contrast range // recommended for 5+ points
 */
const rainbow = [
  '#FFF780',
  '#E7FA6F',
  '#C1FA6A',
  '#9BF56C',
  '#79F080',
  '#66E698',
  '#56D7AC',
  '#50C7C7',
  '#56B4D7',
  '#6898EB',
  '#7481FA',
  '#8769FA',
  '#9450EB',
  '#9634D6',
  '#942AAE',
];

/**
 * from good to bad
 */
const spectrum = [
  '#43317B',
  '#3B57A3',
  '#3390B3',
  '#5DC2B1',
  '#95DBA5',
  '#B9EBA0',
  '#DBF5A6',
  '#F5F5B7',
  '#FEEA9D',
  '#FFD285',
  '#FA9B78',
  '#E55C72',
  '#C23665',
  '#8F1150',
  '#5C1243',
];

/**
 * from good to bad
 */
const teal_red = [
  '#122B5C',
  '#1A496B',
  '#1D7C8F',
  '#21A3A3',
  '#5FC7AB',
  '#99E0B1',
  '#CEF0CE',
  '#F0F0F0',
  '#FAE6D2',
  '#FAC5AA',
  '#FA9282',
  '#E55C72',
  '#C23665',
  '#8F1150',
  '#5C1243',
];

/**
 * Temperature // From cold → to warm
 */
const blue_red = [
  '#0E0E8F',
  '#1D23B8',
  '#3748E5',
  '#647DFA',
  '#96A7FA',
  '#C3CCFA',
  '#E1E5FA',
  '#F0F0F0',
  '#F9DBDB',
  '#F9BDBD',
  '#F59393',
  '#E55C72',
  '#C23665',
  '#8F1150',
  '#5C1243',
];

/**
 * Neutral range // from A → to B
 */
const lime_rose = [
  '#2E5C00',
  '#49850D',
  '#3748E5',
  '#8FC758',
  '#ABDB7B',
  '#C5EBA0',
  '#DCF5C4',
  '#F0F0F0',
  '#FADCF5',
  '#F5C4ED',
  '#F0A3E3',
  '#E573D2',
  '#CC49B6',
  '#991884',
  '#701260',
];

/**
 * bars only big range 7+ points // cutting
 */
const viridis_magma = [
  '#4A005C',
  '#4A2F7F',
  '#3F5895',
  '#3181A0',
  '#28A8A0',
  '#3ECD8D',
  '#86E67B',
  '#CEF36C',
  '#FFF680',
  '#FED470',
  '#FDA163',
  '#F36C5A',
  '#D64470',
  '#A03080',
  '#702084',
  '#451777',
  '#2B125C',
];

export const palettes = {
  viridis,
  magma,
  density,
  salinity,
  sunset,
  rainbow,
  spectrum,
  teal_red,
  blue_red,
  lime_rose,
  viridis_magma,
};

export type Palette = keyof typeof palettes;

/**
 * Just named colors
 */
export const categoricalColors = {
  green_light: '#99E099',
  green_bright: '#198020',
  green_dark: '#42B842',
  violet_light: '#C1ADFF',
  violet_bright: '#845CFF',
  violet_dark: '#5F31CC',
  orange_light: '#FFCB8F',
  orange_bright: '#FF9429',
  orange_dark: '#C26A27',
  teal_light: '#90E0E0',
  teal_bright: '#27C2C2',
  teal_dark: '#068A94',
  rose_light: '#FAAAFA',
  rose_bright: '#E553E5',
  rose_dark: '#A324B2',
  lime_light: '#CBEB67',
  lime_bright: '#95C700',
  lime_dark: '#659406',
  blue_light: '#99CCFF',
  blue_bright: '#2D93FA',
  blue_dark: '#105BCC',
  red_light: '#FFADBA',
  red_bright: '#F05670',
  red_dark: '#AD3757',
  grey_light: '#D3D7E0',
  grey_bright: '#929BAD',
  grey_dark: '#5E5E70',
};

export type CategoricalColor = keyof typeof categoricalColors;

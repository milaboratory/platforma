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

export const divergingSpectrum = [
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

export const palettes = {
  viridis,
  magma,
  divergingSpectrum,
};

export type Palette = keyof typeof palettes;

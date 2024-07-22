export type FirstSpec = {
  type: 'first';
  value: boolean;
};

export type SecondSpec = {
  type: 'second';
  age: number;
  label: string;
  title: string;
};

export type ThirdSpec = {
  type: 'third';
  check: boolean;
  title1: string;
  title2: string;
  title3: string;
  title4: string;
  title5: string;
  title6: string;
  title7: string;
  title8: string;
};

export type MySpec = FirstSpec | SecondSpec | ThirdSpec;

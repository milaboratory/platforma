export type FirstSpec = {
  type: 'first';
  value: boolean;
};

export type SecondSpec = {
  type: 'second';
  age: number;
  title: string;
};

export type MySpec = FirstSpec | SecondSpec;

// type TestType1 = string;
// type TestType2 = string | number | { a: number };
//
// const RichType1 = richResourceType('RichType1', '1');
//
// type WithAnyRichType<T> = WithRichType<T, string>
//
// function withRichType<RT extends PlResourceType>(t2: TestType2, type: RT): WithRichType<TestType1, RT> {
//   return '' as WithRichType<TestType1, RT>;
// }
//
// function something<RT extends PlResourceType, TT extends  WithRichType<TestType1, RT>>(t2: TT): TT
// // function something(t2: TestType1): TestType1
// function something(t2: TestType1): TestType1 {
//   return t2;
// }

test('simple test', () => {
  // const t2 = '';
  // const t2a = withRichType(t2, RichType1);
  // const t2c = something(t2a);
});

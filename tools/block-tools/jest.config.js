module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  verbose: true,
};

// module.exports = {
//   preset: 'ts-jest',
//   testEnvironment: 'node',
//   verbose: true,
//   extensionsToTreatAsEsm: ['.ts'],
//   transform: {
//     '^.+[tj]s$': ['ts-jest', {
//       'tsconfig': {
//         'allowJs': true
//       }
//     }]
//   },
//   transformIgnorePatterns: [
//     '<rootDir>/node_modules/(?!semver-parser)'
//   ]
// };
//
// // (() => {
// //   throw new Error();
// // })();

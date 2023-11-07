import {test, beforeEach, expect} from '@jest/globals';
import {Arrange} from '@milaboratory/pl-tools';

beforeEach(() => {
  global.console = require('console');
});

test('Pl Arrange 1', async () => {
  const pattern = '{{*}}_{{Sample}}_{{R}}.fastq.gz';

  const filePaths = [
    "/test_YYY1_R1.fastq.gz",
    "/test_YYY1_R2.fastq.gz",
    "/test_YYY2_R1.fastq.gz",
    "/test_YYY2_R2.fastq.gz",
    "/test_YYY3_R1.fastq.gz",
    "/test_YYY3_R2.fastq.gz",
    "/test_YYY4_R1.fastq.gz",
    "/test_YYY4_R2.fastq.gz"
  ];

  const arranged = Arrange.arrangeFiles(filePaths, pattern);

  console.log('arranged', JSON.stringify(arranged, null, 2));
}, 10000);

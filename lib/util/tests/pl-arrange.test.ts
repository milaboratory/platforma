import {test, expect} from '@jest/globals';
import {SamplePatterns} from '@milaboratory/pl-tools';

const cases = [
  {
    files: `test_YYY1_R1.fastq.gz
            test_YYY1_R2.fastq.gz
            test_YYY2_R1.fastq.gz
            test_YYY2_R2.fastq.gz
            test_YYY3_R1.fastq.gz
            test_YYY3_R2.fastq.gz
            test_YYY4_R1.fastq.gz
            test_YYY4_R2.fastq.gz`,
    pattern: '{{*}}_{{Sample}}_{{R}}.fastq.gz',
    samples: ['YYY1', 'YYY2', 'YYY3', 'YYY4']
  },
  // Есть дорожки (lane) и R1/R2 - 4 файла в сумме на sample
  {
    files: `
d241_BM_Bmem_tp01_S1_**L001**_R1_001.fastq.gz
d241_BM_Bmem_tp01_S1_**L001**_R2_001.fastq.gz 
d241_BM_Bmem_tp01_S1_**L002**_R1_001.fastq.gz
d241_BM_Bmem_tp01_S1_**L002**_R1_001.fastq.gz

d241_BM_Bmem_tp02_S2_**L001**_R1_001.fastq.gz
d241_BM_Bmem_tp02_S2_**L001**_R2_001.fastq.gz
d241_BM_Bmem_tp02_S2_**L002**_R1_001.fastq.gz
d241_BM_Bmem_tp02_S2_**L002**_R2_001.fastq.gz
`,
    samples: ['d241_BM_Bmem_tp01', 'd241_BM_Bmem_tp02'],
    pattern: '{{Sample}}_{{*}}_{{L}}_{{R}}_{{*}}.fastq.gz'
  },
  //
  {
    files: `
    UP3_BCR_S12_L001_R1_001.fastq.gz
    UP3_BCR_S12_L001_R2_001.fastq.gz
    UP3_BCR_S12_L002_R1_001.fastq.gz
    UP3_BCR_S12_L002_R2_001.fastq.gz
    
    UP3_BCR_S3_L001_R1_001.fastq.gz
    UP3_BCR_S3_L001_R2_001.fastq.gz
    UP3_BCR_S3_L002_R1_001.fastq.gz
    UP3_BCR_S3_L002_R2_001.fastq.gz`,
    samples: ['UP3_BCR_S12', 'UP3_BCR_S3'],
    pattern: '{{Sample}}_{{L}}_{{R}}_{{*}}.fastq.gz'
  },
];

function extractPaths(str: string) {
  return str.split('\n').map(s => s.trim()).filter(v => !!v);
}

test('Pl Arrange', async () => {
  for (const c of cases) {
    const arranged = SamplePatterns.arrangeFiles(extractPaths(c.files), c.pattern);

    const samples = arranged.map(a => a.Sample);

    expect(new Set(samples)).toEqual(new Set(c.samples));
  }
}, 10000);

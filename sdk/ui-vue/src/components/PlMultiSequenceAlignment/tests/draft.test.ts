import { test } from 'vitest';
import { parseBiowasmAlignment } from '../utils/alignment';

test.for([
  {
    label: 'simple',
    output: `>1aab_
GKGDPKKPRG-KMSSYAFFVQTSREEHKKKHPDASVNFSEFSKKCSERWKTMSAKEKGKF
EDMAKADKARYEREMKTY-IPPKGE---------
>1j46_A
-----MQDRV-KRPMNAFIVWSRDQRRKMALENPRMRNSEISKQLGYQWKMLTEAEKWPF
FQEAQKLQAMHREKYPNYKYRPRRKAKMLPK---
>1k99_A
MKKLKKHPDFPKKPLTPYFRFFMEKRAKYAKLHPEMSNLDLTKILSKKYKELPEKKKMKY
IQDFQREKQ-EFERNLARFREDHPDLIQNAKK--
>2lef_A
-----MHI---KKPLNAFMLYMKEMRANVVAESTLKESAAINQILGRRWHALSREEQAKY
YELARKERQLHMQLYPGWSARDNYGKKKKRKREK`,
  },
])(
  'test $label',
  ({ output }, { expect }) => {
    const sequences = parseBiowasmAlignment(output);
    console.log(sequences);
    expect(sequences.length).toBe(4);
  },
);

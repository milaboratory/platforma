import Aioli from '@biowasm/aioli';
import type {
  SequenceRow,
} from './types';

// Example data
// const data = `>1aab_
// GKGDPKKPRGKMSSYAFFVQTSREEHKKKHPDASVNFSEFSKKCSERWKT
// MSAKEKGKFEDMAKADKARYEREMKTYIPPKGE
// >1j46_A
// MQDRVKRPMNAFIVWSRDQRRKMALENPRMRNSEISKQLGYQWKMLTEAE
// KWPFFQEAQKLQAMHREKYPNYKYRPRRKAKMLPK
// >1k99_A
// MKKLKKHPDFPKKPLTPYFRFFMEKRAKYAKLHPEMSNLDLTKILSKKYK
// ELPEKKKMKYIQDFQREKQEFERNLARFREDHPDLIQNAKK
// >2lef_A
// MHIKKPLNAFMLYMKEMRANVVAESTLKESAAINQILGRRWHALSREEQA
// KYYELARKERQLHMQLYPGWSARDNYGKKKKRKREK`;

export const exec = async (sequenceRows: SequenceRow[] | undefined) => {
  if (!sequenceRows) {
    return '';
  }

  if (sequenceRows.length === 0) {
    return '';
  }

  const data = sequenceRows.map(({ sequence, header }) => `>${header}\n${sequence}`).join('\n') + '\n';

  const CLI = await new Aioli(['kalign/3.3.1']);
  // Create sample data (source: https://github.com/TimoLassmann/kalign/blob/master/dev/data/BB11001.tfa)
  await CLI.mount({
    name: 'input.fa',
    data,
  });

  await CLI.exec('kalign input.fa -f fasta -o result.fasta');
  return await CLI.cat('result.fasta');
};

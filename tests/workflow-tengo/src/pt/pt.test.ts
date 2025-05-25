import { Pl } from '@milaboratories/pl-middle-layer';
import { awaitStableState, tplTest } from '@platforma-sdk/test';

tplTest(
  'pt simple test',
  { timeout: 20000 }, // Added a timeout for ptabler initialization and execution
  async ({ helper, expect, driverKit }) => {
    const inputTsvData = 'a\tb\n1\tX\n4\tY\n9\tZ';
    // PTabler typically outputs floating point numbers with a decimal.
    const expectedOutputTsvData = 'a\ta_sqrt\n1\t1.0\n4\t2.0\n9\t3.0';

    const result = await helper.renderTemplate(
      false,
      'pt.simple',
      ['out'],
      (tx) => ({
        inputTsv: tx.createValue(Pl.JsonObject, JSON.stringify(inputTsvData)),
      }),
    );

    const outputFileHandle = await awaitStableState(
      result.computeOutput('out', (fileHandle, ctx) => {
        if (!fileHandle) {
          return undefined;
        }
        // The 'out' is expected to be a Pl.Blob type resource from ptablerResult.getFile()
        return driverKit.blobDriver.getOnDemandBlob(fileHandle.persist(), ctx).handle;
      }),
      15000, // Timeout for the output to become stable
    );

    expect(outputFileHandle).toBeDefined();

    // Get the content of the output file
    const outputTsvContent = (await driverKit.blobDriver.getContent(outputFileHandle!)).toString();

    // Normalize both expected and actual content for robust comparison
    // (e.g., handle potential trailing newlines or different line ending styles)
    const normalizeTsv = (str: string) => str.replace(/\r\n/g, '\n').trim();

    expect(normalizeTsv(outputTsvContent)).toEqual(normalizeTsv(expectedOutputTsvData));
  },
);

const blockTools = require('@platforma-sdk/block-tools');

async function loadBlockDescription() {
  return await blockTools.loadPackDescriptionFromSource(__dirname);
}

const blockSpec = {
  type: 'dev-v2',
  folder: __dirname
};

module.exports = {
  blockSpec,
  loadBlockDescription
};

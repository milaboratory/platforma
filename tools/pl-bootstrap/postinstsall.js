const pl = require('./dist/platforma');
const util = require('./dist/util');

const logger = util.createLogger();
pl.getBinary(logger);

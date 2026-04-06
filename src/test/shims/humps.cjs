// CJS shim — jest maps 'humps' here in the integration (ESM) project
const humps = require("humps");
module.exports = humps;
module.exports.camelizeKeys = humps.camelizeKeys;
module.exports.decamelizeKeys = humps.decamelizeKeys;
module.exports.camelize = humps.camelize;
module.exports.decamelize = humps.decamelize;
module.exports.pascalize = humps.pascalize;
module.exports.depascalize = humps.depascalize;

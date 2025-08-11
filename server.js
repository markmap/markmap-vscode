// Root entrypoint: delegate to webapp/server.js so `node server.js` works.
'use strict';
const path = require('path');
const webappServerPath = path.join(__dirname, 'webapp', 'server.js');
console.log(`Starting webapp server via ${webappServerPath}`);
require(webappServerPath);
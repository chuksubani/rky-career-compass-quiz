// Loads the example knowledge config for tests that need a non-pathway quiz.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'examples', 'knowledge-config.js'), 'utf8'), sandbox);
module.exports = JSON.parse(JSON.stringify(sandbox.window.QUIZ_CONFIG));

'use strict';

const sharedStandards = require('@silvermine/standardization/.markdownlint-cli2.shared.cjs');

module.exports = {
   ...sharedStandards,
   globs: [ '**/*.md' ],
   ignores: [ 'node_modules/**', 'specs/**', '**/fixtures/**', 'packages/**' ],
   config: {
      ...sharedStandards.config,
      'indent-alignment': false, // Disabled due to bug in rule
   },
};

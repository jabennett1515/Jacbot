#!/usr/bin/env node

/**
 * Jacbot CLI entrypoint
 */

import { run } from './cli.js';

run(process.argv.slice(2)).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

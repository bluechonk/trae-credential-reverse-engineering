#!/usr/bin/env node
/**
 * TRAE Credential Reverse Engineering
 * 
 * Systematic methodology for reverse engineering TraeWork CN desktop client
 * local credential storage on Windows.
 * 
 * Usage:
 *   npm run phase1    # Reconnaissance
 *   npm run phase2    # Data Collection
 *   npm run phase3    # Format Analysis
 *   npm run phase4    # Encryption Identification
 *   npm run phase5    # Key Extraction
 *   npm run phase6    # Decryption & Validation
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { phase1 } from './phase1-reconnaissance/index.js';
import { phase2 } from './phase2-data-collection/index.js';
import { phase3 } from './phase3-format-analysis/index.js';
import { phase4 } from './phase4-encryption-id/index.js';
import { phase5 } from './phase5-key-extraction/index.js';
import { phase6 } from './phase6-decryption/index.js';
import { validateToken } from './phase6-decryption/validate.js';
import { runCheckin, runRefresh } from './phase6-decryption/flows.js';

const program = new Command();

console.log(chalk.cyan.bold(`
╔══════════════════════════════════════════════════════════╗
║   TRAE Credential Reverse Engineering                   ║
║   TraeWork CN Desktop Client — Credential Storage RE    ║
╚══════════════════════════════════════════════════════════╝
`));

program
  .name('trae-re')
  .description('TraeWork CN credential reverse engineering toolkit')
  .version('0.1.0');

program
  .command('phase1')
  .description('Phase 1: Reconnaissance — identify framework & surface area')
  .action(async () => {
    console.log(chalk.yellow('\n▶ Phase 1: Reconnaissance\n'));
    await phase1();
  });

program
  .command('phase2')
  .description('Phase 2: Data Collection — locate credential storage')
  .action(async () => {
    console.log(chalk.yellow('\n▶ Phase 2: Data Collection\n'));
    await phase2();
  });

program
  .command('phase3')
  .description('Phase 3: Format Analysis — entropy & magic bytes')
  .action(async () => {
    console.log(chalk.yellow('\n▶ Phase 3: Format Analysis\n'));
    await phase3();
  });

program
  .command('phase4')
  .description('Phase 4: Encryption Identification — static & dynamic analysis')
  .action(async () => {
    console.log(chalk.yellow('\n▶ Phase 4: Encryption Identification\n'));
    await phase4();
  });

program
  .command('phase5')
  .description('Phase 5: Key Extraction — hardcoded / derived / runtime')
  .action(async () => {
    console.log(chalk.yellow('\n▶ Phase 5: Key Extraction\n'));
    await phase5();
  });

program
  .command('phase6')
  .description('Phase 6: Decryption & Validation — decrypt and verify')
  .action(async () => {
    console.log(chalk.yellow('\n▶ Phase 6: Decryption & Validation\n'));
    await phase6();
  });

program
  .command('validate')
  .description('Validate decrypted credential against the live API')
  .action(async () => {
    console.log(chalk.yellow('\n▶ Functional Validation\n'));
    await validateToken();
  });

program
  .command('checkin')
  .description('Daily check-in: status → claim → verify (uses current token)')
  .action(async () => {
    console.log(chalk.yellow('\n▶ Daily Check-in\n'));
    await runCheckin();
  });

program
  .command('refresh')
  .description('Rotate token via refreshToken (ExchangeToken) and write back')
  .action(async () => {
    console.log(chalk.yellow('\n▶ Token Refresh (ExchangeToken)\n'));
    await runRefresh();
  });

program.parse();

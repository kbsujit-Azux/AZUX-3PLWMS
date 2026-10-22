#!/usr/bin/env tsx
/**
 * EDI Sandbox - Main Entry Point
 * 
 * Watches inbound directory for EDI files, processes them through the pipeline,
 * and generates outbound files (997 acknowledgments, 944/945 responses).
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { watchInboundDirectory } from './file-watcher.js';
import { processEdiFile } from './edi-parser.js';
import { translateEdiToWms, translateWmsToEdi } from './edi-translator.js';
import { MockApiClient } from './mock-api-client.js';
import { generate997Acknowledgment } from './ack-generator.js';
import { ResponseGenerator } from './response-generator.js';
import { Logger } from './logger.js';

config({ path: resolve(process.cwd(), '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

const logger = new Logger('EDI-Sandbox');
const apiClient = new MockApiClient();
const responseGenerator = new ResponseGenerator(apiClient);

interface CliOptions {
  file?: string;
  batch?: boolean;
  help?: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {};
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--file':
      case '-f':
        options.file = args[++i];
        break;
      case '--batch':
      case '-b':
        options.batch = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }
  return options;
}

async function processSingleFile(filePath: string): Promise<void> {
  logger.info(`Processing file: ${filePath}`);
  
  try {
    const result = await processEdiFile(filePath);
    
    // Generate 997 acknowledgment
    const ack = await generate997Acknowledgment(result.envelope, result.transactionSets[0]);
    await ack.writeToFile();
    logger.info(`Generated 997 acknowledgment: ${ack.filePath}`);
    
    // For inbound transactions, process through WMS
    if (result.direction === 'inbound') {
      for (const ts of result.transactionSets) {
        const wmsModel = await translateEdiToWms(ts);
        const apiResult = await apiClient.processInboundTransaction(wmsModel);
        logger.info(`WMS API result: ${JSON.stringify(apiResult, null, 2)}`);
      }
    }
    
    // For outbound transactions, generate EDI response
    if (result.direction === 'outbound') {
      for (const ts of result.transactionSets) {
        const ediContent = await responseGenerator.generate(ts);
        const outPath = resolve(process.env.OUTBOUND_DIR || './outbound', 
          `${ts.type}-${ts.controlNumber}.edi`);
        await Bun.write(outPath, ediContent);
        logger.info(`Generated outbound ${ts.type}: ${outPath}`);
      }
    }
    
  } catch (error) {
    logger.error(`Failed to process ${filePath}: ${error}`);
    throw error;
  }
}

async function main(): Promise<void> {
  const options = parseArgs();
  
  if (options.help) {
    console.log(`
EDI Sandbox - Local EDI Integration Test Environment

Usage:
  npm start                    # Start file watcher
  npm run test:single -- -f <file>  # Process single file
  npm run test:all             # Process all test files

Options:
  -f, --file <path>   Process a single EDI file
  -b, --batch         Process all files in test-data/
  -h, --help          Show this help
`);
    return;
  }
  
  if (options.file) {
    await processSingleFile(options.file);
    return;
  }
  
  if (options.batch) {
    const testDir = resolve(__dirname, 'test-data');
    // Implementation for batch processing
    logger.info('Batch processing not yet implemented');
    return;
  }
  
  // Default: start file watcher
  logger.info('Starting EDI Sandbox file watcher...');
  await watchInboundDirectory(
    process.env.INBOUND_DIR || './inbound',
    processSingleFile
  );
}

main().catch(err => {
  logger.error(`Fatal error: ${err}`);
  process.exit(1);
});
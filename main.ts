// gta6-meme-x-01 hand-in program.
//
// The judged entry is the X post itself; this program has exactly one job:
// take the POST.json sitting in the repository root and place a copy of it
// in the output directory, where the grader looks for it. Nothing more.
//
// Where things live:
//   - source:      POST.json in the bot directory (the repo root when graded)
//   - destination: POST.json in the output directory
// The MAKEFUN_BOT_DIR / MAKEFUN_OUTPUT_DIR environment variables can point
// both at other folders, which is handy for a local dry run, e.g.
//   MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const sourceDir = process.env.MAKEFUN_BOT_DIR || '/bot';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const sourceFile = join(sourceDir, 'POST.json');
const targetFile = join(outputDir, 'POST.json');

if (!existsSync(sourceFile)) {
  console.error('No POST.json found at ' + sourceFile + ' - nothing to hand in.');
  process.exit(1);
}

// The output directory may not exist yet on a fresh run, so create it first.
mkdirSync(outputDir, { recursive: true });
copyFileSync(sourceFile, targetFile);

console.log('POST.json copied to ' + targetFile);

// Serves the claim circuit's proving artifacts as static files.
//
// The browser fetches keys/claim.prover, keys/claim.verifier and zkir/claim.bzkir to have
// the proof server build a claim proof. They come from the Compact build when it is present
// (local dev), and are otherwise the copies committed for hosts without the compiler.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const managed = path.resolve(here, '..', '..', 'contract', 'src', 'managed', 'proof-relief');
const publicDir = path.resolve(here, '..', 'public');

const assets = [
  ['keys', 'claim.prover'],
  ['keys', 'claim.verifier'],
  ['zkir', 'claim.bzkir'],
];

let copied = 0;
for (const [dir, file] of assets) {
  const from = path.join(managed, dir, file);
  const to = path.join(publicDir, dir, file);
  if (existsSync(from)) {
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(from, to);
    copied++;
  } else if (!existsSync(to)) {
    console.error(`Missing ${dir}/${file}. Run "bun run compact" to build the contract first.`);
    process.exit(1);
  }
}
console.log(copied > 0 ? `Copied ${copied} ZK asset(s) from the Compact build` : 'Using committed ZK assets');

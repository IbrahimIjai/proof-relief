import { webcrypto } from 'node:crypto';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Credential } from '../managed/proof-relief/contract/index.js';
import { pureCircuits } from '../managed/proof-relief/contract/index.js';
import { BORNO, beneficiary, commitmentOf, deployWorld, floodRelief, issue, issuerId, nullifierOf, schoolMeals } from './fixtures.js';
import type { ProofReliefSimulator } from './simulator.js';

setNetworkId('undeployed');

const random32 = (): Uint8Array => webcrypto.getRandomValues(new Uint8Array(32));

// The state dump prints bytes as hex with trailing zero bytes trimmed, and unsigned
// integers as minimal little-endian hex. Normalize our values the same way.
const bytesToken = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex').replace(/(00)+$/, '');
const uintToken = (value: bigint): string => {
  let hex = value.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  return Buffer.from(hex, 'hex').reverse().toString('hex');
};

/** Every atomic value that appears in the public state dump. */
const publicTokens = (sim: ProofReliefSimulator): Set<string> => {
  const dump = sim.publicStateDump();
  const tokens = new Set<string>();
  for (const [, cell] of dump.matchAll(/<\[([^\]]*)\]/g)) {
    for (const part of cell.split(',')) tokens.add(part.trim());
  }
  for (const [, leaf] of dump.matchAll(/\d+: ([0-9a-f]+),/g)) tokens.add(leaf);
  return tokens;
};

describe('privacy of public state', () => {
  // Distinctive values so an accidental match cannot be a coincidence.
  const credential: Credential = {
    holderSecret: random32(),
    nonce: random32(),
    issuerId,
    region: BORNO,
    income: 73_219n,
    householdSize: 11n,
  };
  let sim: ProofReliefSimulator;
  let tokens: Set<string>;

  beforeAll(() => {
    sim = deployWorld();
    issue(sim, credential);
    sim.as(beneficiary(credential)).claim(floodRelief);
    sim.claim(schoolMeals);
    tokens = publicTokens(sim);
  });

  it('does contain the expected public values (control for the checks below)', () => {
    expect(tokens).toContain(bytesToken(sim.ledger().admin));
    expect(tokens).toContain(bytesToken(nullifierOf(sim, floodRelief, credential)));
    expect(tokens).toContain(uintToken(100_000n));
  });

  it('does not expose the exact income', () => {
    expect(tokens).not.toContain(uintToken(credential.income));
  });

  it('does not expose the household size', () => {
    expect(tokens).not.toContain(uintToken(credential.householdSize));
  });

  it('does not expose the holder secret', () => {
    expect(tokens).not.toContain(bytesToken(credential.holderSecret));
    expect(sim.publicStateDump()).not.toContain(bytesToken(credential.holderSecret));
  });

  it('does not expose the raw credential commitment or nonce', () => {
    expect(tokens).not.toContain(bytesToken(commitmentOf(credential)));
    expect(tokens).not.toContain(bytesToken(credential.nonce));
  });

  it('does not expose a reusable holder identifier', () => {
    expect(tokens).not.toContain(bytesToken(pureCircuits.holderPublicKey(credential.holderSecret)));
    expect(tokens).not.toContain(bytesToken(pureCircuits.holderBinding(credential.holderSecret, commitmentOf(credential))));
  });

  it('records unlinkable nullifiers for the same beneficiary across campaigns', () => {
    const flood = nullifierOf(sim, floodRelief, credential);
    const meals = nullifierOf(sim, schoolMeals, credential);

    expect(flood).not.toEqual(meals);
    expect(tokens).toContain(bytesToken(flood));
    expect(tokens).toContain(bytesToken(meals));
  });
});

import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, expect, it } from 'vitest';
import {
  BORNO,
  MAX_INCOME,
  MIN_HOUSEHOLD,
  YOBE,
  beneficiary,
  deployWorld,
  floodRelief,
  issue,
  makeCredential,
} from './fixtures.js';

setNetworkId('undeployed');

const claimWith = (attributes: { region?: Uint8Array; income?: bigint; householdSize?: bigint }) => {
  const sim = deployWorld();
  const credential = issue(
    sim,
    makeCredential({ region: BORNO, income: 50_000n, householdSize: 5n, ...attributes }),
  );
  return { sim, run: () => sim.as(beneficiary(credential)).claim(floodRelief) };
};

describe('eligibility boundaries', () => {
  describe('region', () => {
    it('accepts the required region', () => {
      expect(claimWith({ region: BORNO }).run().campaigns.lookup(floodRelief).claimCount).toBe(1n);
    });

    it('rejects a different region', () => {
      const { sim, run } = claimWith({ region: YOBE });
      expect(run).toThrow(/Region requirement not met/);
      expect(sim.ledger().campaigns.lookup(floodRelief).claimCount).toBe(0n);
    });
  });

  describe('income (must be <= limit)', () => {
    it('accepts income below the limit', () => {
      expect(claimWith({ income: MAX_INCOME - 30_000n }).run().campaigns.lookup(floodRelief).claimCount).toBe(1n);
    });

    it('accepts income exactly at the limit', () => {
      expect(claimWith({ income: MAX_INCOME }).run().campaigns.lookup(floodRelief).claimCount).toBe(1n);
    });

    it('rejects income one unit above the limit', () => {
      const { sim, run } = claimWith({ income: MAX_INCOME + 1n });
      expect(run).toThrow(/Income above campaign limit/);
      expect(sim.ledger().campaigns.lookup(floodRelief).claimCount).toBe(0n);
    });
  });

  describe('household size (must be >= minimum)', () => {
    it('accepts a household above the minimum', () => {
      expect(claimWith({ householdSize: MIN_HOUSEHOLD + 3n }).run().campaigns.lookup(floodRelief).claimCount).toBe(1n);
    });

    it('accepts a household exactly at the minimum', () => {
      expect(claimWith({ householdSize: MIN_HOUSEHOLD }).run().campaigns.lookup(floodRelief).claimCount).toBe(1n);
    });

    it('rejects a household one below the minimum', () => {
      const { sim, run } = claimWith({ householdSize: MIN_HOUSEHOLD - 1n });
      expect(run).toThrow(/Household below campaign minimum/);
      expect(sim.ledger().campaigns.lookup(floodRelief).claimCount).toBe(0n);
    });
  });
});

import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, expect, it } from 'vitest';
import {
  alice,
  beneficiary,
  carol,
  deployWorld,
  floodRelief,
  issue,
  nullifierOf,
  schoolMeals,
} from './fixtures.js';
import { bytes32 } from './simulator.js';

setNetworkId('undeployed');

describe('replay protection', () => {
  it('accepts the first claim', () => {
    const sim = deployWorld();
    const credential = issue(sim, alice());

    expect(sim.as(beneficiary(credential)).claim(floodRelief).campaigns.lookup(floodRelief).claimCount).toBe(1n);
  });

  it('rejects an identical second claim and keeps the count at one', () => {
    const sim = deployWorld();
    const credential = issue(sim, alice());
    sim.as(beneficiary(credential)).claim(floodRelief);

    expect(() => sim.claim(floodRelief)).toThrow(/already claimed for this campaign/);
    expect(sim.ledger().campaigns.lookup(floodRelief).claimCount).toBe(1n);
  });

  it('rejects a replay from a fresh session holding a copied credential', () => {
    const sim = deployWorld();
    const credential = issue(sim, alice());
    sim.as(beneficiary(credential)).claim(floodRelief);

    const freshSession = beneficiary(structuredClone(credential));
    expect(() => sim.as(freshSession).claim(floodRelief)).toThrow(/already claimed for this campaign/);
  });

  it('rejects a replay after the issuer re-issues the identical credential', () => {
    const sim = deployWorld();
    const credential = issue(sim, alice());
    sim.as(beneficiary(credential)).claim(floodRelief);
    issue(sim, credential);

    expect(() => sim.as(beneficiary(credential)).claim(floodRelief)).toThrow(/already claimed for this campaign/);
    expect(sim.ledger().credentials.firstFree()).toBe(2n);
  });

  it('gives the same credential an independent claim in a different campaign', () => {
    const sim = deployWorld();
    const credential = issue(sim, alice());
    sim.as(beneficiary(credential)).claim(floodRelief);

    const state = sim.claim(schoolMeals);
    expect(state.campaigns.lookup(schoolMeals).claimCount).toBe(1n);
    expect(nullifierOf(sim, floodRelief, credential)).not.toEqual(nullifierOf(sim, schoolMeals, credential));
  });

  it('lets a different beneficiary claim the same campaign', () => {
    const sim = deployWorld();
    const first = issue(sim, alice());
    const second = issue(sim, carol());
    sim.as(beneficiary(first)).claim(floodRelief);

    expect(sim.as(beneficiary(second)).claim(floodRelief).campaigns.lookup(floodRelief).claimCount).toBe(2n);
  });

  it('refuses a caller-supplied nullifier: claim accepts only the campaign id', () => {
    const sim = deployWorld();
    const credential = issue(sim, alice());
    const forgedNullifier = bytes32(99);
    const claimWithExtraArgument = sim.contract.impureCircuits.claim as unknown as (...args: unknown[]) => unknown;

    expect(() => claimWithExtraArgument(sim.as(beneficiary(credential)).context, floodRelief, forgedNullifier)).toThrow(
      /claim: expected 2 arguments/,
    );
    expect(sim.ledger().consumedNullifiers.isEmpty()).toBe(true);
    expect(nullifierOf(sim, floodRelief, credential)).not.toEqual(forgedNullifier);
  });

  it('separates nullifiers across deployments of the contract', () => {
    const credential = alice();
    const first = deployWorld({ salt: bytes32(7) });
    const second = deployWorld({ salt: bytes32(8) });

    expect(nullifierOf(first, floodRelief, credential)).not.toEqual(nullifierOf(second, floodRelief, credential));
  });
});

import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, expect, it } from 'vitest';
import { admin, alice, beneficiary, bob, deployWorld, floodRelief, issue, nullifierOf } from './fixtures.js';

setNetworkId('undeployed');

describe('claim: demo path', () => {
  it('accepts an eligible beneficiary, consumes the nullifier and increments the count', () => {
    const sim = deployWorld();
    const credential = issue(sim, alice());

    const state = sim.as(beneficiary(credential)).claim(floodRelief);

    expect(state.campaigns.lookup(floodRelief).claimCount).toBe(1n);
    expect(state.consumedNullifiers.size()).toBe(1n);
    expect(state.consumedNullifiers.member(nullifierOf(sim, floodRelief, credential))).toBe(true);
  });

  it('rejects a beneficiary above the income limit and leaves state unchanged', () => {
    const sim = deployWorld();
    const credential = issue(sim, bob());

    expect(() => sim.as(beneficiary(credential)).claim(floodRelief)).toThrow(/Income above campaign limit/);
    expect(sim.ledger().campaigns.lookup(floodRelief).claimCount).toBe(0n);
    expect(sim.ledger().consumedNullifiers.isEmpty()).toBe(true);
  });

  it('rejects claims against an unknown campaign', () => {
    const sim = deployWorld();
    const credential = issue(sim, alice());

    expect(() => sim.as(beneficiary(credential)).claim(new Uint8Array(32))).toThrow(/Unknown campaign/);
  });

  it('rejects claims against a closed campaign', () => {
    const sim = deployWorld();
    const credential = issue(sim, alice());
    sim.as(admin).closeCampaign(floodRelief);

    expect(() => sim.as(beneficiary(credential)).claim(floodRelief)).toThrow(/Campaign is not active/);
    expect(sim.ledger().consumedNullifiers.isEmpty()).toBe(true);
  });
});

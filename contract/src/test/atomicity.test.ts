import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, expect, it } from 'vitest';
import {
  YOBE,
  admin,
  alice,
  beneficiary,
  bob,
  deployWorld,
  floodRelief,
  issue,
  makeCredential,
  schoolMeals,
} from './fixtures.js';

setNetworkId('undeployed');

describe('atomic claim state transition', () => {
  it('on success, inserts exactly one nullifier and increments only the claimed campaign by one', () => {
    const sim = deployWorld();
    const credential = issue(sim, alice());

    const state = sim.as(beneficiary(credential)).claim(floodRelief);

    expect(state.consumedNullifiers.size()).toBe(1n);
    expect(state.campaigns.lookup(floodRelief).claimCount).toBe(1n);
    expect(state.campaigns.lookup(schoolMeals).claimCount).toBe(0n);
  });

  const failures = {
    'policy failure': (sim: ReturnType<typeof deployWorld>) => sim.as(beneficiary(issue(sim, bob()))),
    'wrong region': (sim: ReturnType<typeof deployWorld>) =>
      sim.as(beneficiary(issue(sim, makeCredential({ ...alice(), region: YOBE })))),
    'unissued credential': (sim: ReturnType<typeof deployWorld>) => sim.as(beneficiary(alice())),
    'replay': (sim: ReturnType<typeof deployWorld>) => {
      const credential = issue(sim, alice());
      return sim.as(beneficiary(credential)).claim(floodRelief) && sim.as(beneficiary(credential));
    },
  };

  for (const [name, arrange] of Object.entries(failures)) {
    it(`on ${name}, leaves the entire public state byte-for-byte unchanged`, () => {
      const sim = deployWorld();
      arrange(sim);
      const before = sim.publicStateDump();

      expect(() => sim.claim(floodRelief)).toThrow();
      expect(sim.publicStateDump()).toBe(before);
    });
  }

  it('keeps claim counts and nullifiers when a campaign is closed', () => {
    const sim = deployWorld();
    const credential = issue(sim, alice());
    sim.as(beneficiary(credential)).claim(floodRelief);

    const state = sim.as(admin).closeCampaign(floodRelief);
    expect(state.campaigns.lookup(floodRelief)).toMatchObject({ active: false, claimCount: 1n });
    expect(state.consumedNullifiers.size()).toBe(1n);
  });
});

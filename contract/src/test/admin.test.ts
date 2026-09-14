import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProofReliefSimulator, bytes32, label } from './simulator.js';

setNetworkId('undeployed');

const admin = { adminSecretKey: bytes32(1) };
const stranger = { adminSecretKey: bytes32(2) };
const borno = label('Borno');
const floodRelief = label('borno-flood-relief');
const issuerId = bytes32(40);

describe('campaign administration', () => {
  let sim: ProofReliefSimulator;

  beforeEach(() => {
    sim = new ProofReliefSimulator(admin);
  });

  it('lets the admin create an active campaign with public rules and zero claims', () => {
    const campaign = sim.as(admin).createCampaign(floodRelief, borno, 100_000n, 4n).campaigns.lookup(floodRelief);

    expect(campaign).toEqual({
      active: true,
      requiredRegion: borno,
      maxIncome: 100_000n,
      minHouseholdSize: 4n,
      claimCount: 0n,
    });
  });

  it('rejects campaign creation by a non-admin', () => {
    expect(() => sim.as(stranger).createCampaign(floodRelief, borno, 100_000n, 4n)).toThrow(/not the admin/);
    expect(sim.ledger().campaigns.isEmpty()).toBe(true);
  });

  it('rejects recreating an existing campaign, so claim counts cannot be reset', () => {
    sim.as(admin).createCampaign(floodRelief, borno, 100_000n, 4n);

    expect(() => sim.createCampaign(floodRelief, borno, 999_999n, 1n)).toThrow(/already exists/);
    expect(sim.ledger().campaigns.lookup(floodRelief).maxIncome).toBe(100_000n);
  });

  it('rejects a campaign with a zero minimum household size', () => {
    expect(() => sim.as(admin).createCampaign(floodRelief, borno, 100_000n, 0n)).toThrow(/must be positive/);
  });

  it('lets the admin close a campaign and rejects closing by a non-admin', () => {
    sim.as(admin).createCampaign(floodRelief, borno, 100_000n, 4n);

    expect(() => sim.as(stranger).closeCampaign(floodRelief)).toThrow(/not the admin/);
    expect(sim.as(admin).closeCampaign(floodRelief).campaigns.lookup(floodRelief).active).toBe(false);
  });

  it('rejects closing an unknown campaign', () => {
    expect(() => sim.as(admin).closeCampaign(floodRelief)).toThrow(/Unknown campaign/);
  });
});

describe('issuer administration', () => {
  let sim: ProofReliefSimulator;

  beforeEach(() => {
    sim = new ProofReliefSimulator(admin);
  });

  it('lets the admin approve and then revoke an issuer', () => {
    expect(sim.as(admin).setIssuerStatus(issuerId, true).approvedIssuers.lookup(issuerId)).toBe(true);
    expect(sim.setIssuerStatus(issuerId, false).approvedIssuers.lookup(issuerId)).toBe(false);
  });

  it('rejects issuer changes by a non-admin', () => {
    expect(() => sim.as(stranger).setIssuerStatus(issuerId, true)).toThrow(/not the admin/);
    expect(sim.ledger().approvedIssuers.member(issuerId)).toBe(false);
  });
});

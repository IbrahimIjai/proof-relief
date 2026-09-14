import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, expect, it } from 'vitest';
import { pureCircuits } from '../managed/proof-relief/contract/index.js';
import { ProofReliefSimulator, bytes32 } from './simulator.js';

setNetworkId('undeployed');

const adminSecretKey = bytes32(1);

describe('ProofRelief deployment', () => {
  it('stores the admin commitment, not the admin secret', () => {
    const state = new ProofReliefSimulator({ adminSecretKey }).ledger();

    expect(state.admin).toEqual(pureCircuits.adminPublicKey(adminSecretKey));
    expect(state.admin).not.toEqual(adminSecretKey);
  });

  it('stores the deployment salt', () => {
    const state = new ProofReliefSimulator({ adminSecretKey }, bytes32(9)).ledger();

    expect(state.deploymentSalt).toEqual(bytes32(9));
  });

  it('starts with no campaigns, issuers or consumed nullifiers', () => {
    const state = new ProofReliefSimulator({ adminSecretKey }).ledger();

    expect(state.campaigns.isEmpty()).toBe(true);
    expect(state.approvedIssuers.isEmpty()).toBe(true);
    expect(state.consumedNullifiers.isEmpty()).toBe(true);
  });

  it('refuses to deploy without an admin secret in private state', () => {
    expect(() => new ProofReliefSimulator({})).toThrow(/adminSecretKey/);
  });
});

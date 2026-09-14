import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { beforeEach, describe, expect, it } from 'vitest';
import { pureCircuits } from '../managed/proof-relief/contract/index.js';
import { ProofReliefSimulator, bytes32, label } from './simulator.js';

setNetworkId('undeployed');

const admin = { adminSecretKey: bytes32(1) };
const issuer = { issuerSecretKey: bytes32(30) };
const issuerId = pureCircuits.issuerPublicKey(issuer.issuerSecretKey);

const commitment = pureCircuits.credentialCommitment(
  label('Borno'),
  70_000n,
  5n,
  bytes32(50),
  pureCircuits.holderPublicKey(bytes32(60)),
);

describe('credential issuance', () => {
  let sim: ProofReliefSimulator;

  beforeEach(() => {
    sim = new ProofReliefSimulator(admin);
  });

  it('lets an approved issuer add a credential leaf bound to its issuer id', () => {
    sim.as(admin).setIssuerStatus(issuerId, true);
    const state = sim.as(issuer).issueCredential(commitment);

    const leaf = pureCircuits.credentialLeaf(issuerId, commitment);
    expect(state.credentials.findPathForLeaf(leaf)).toBeDefined();
    expect(state.credentials.firstFree()).toBe(1n);
  });

  it('rejects issuance by an issuer that was never approved', () => {
    expect(() => sim.as(issuer).issueCredential(commitment)).toThrow(/Issuer is not approved/);
    expect(sim.ledger().credentials.firstFree()).toBe(0n);
  });

  it('rejects issuance by a revoked issuer', () => {
    sim.as(admin).setIssuerStatus(issuerId, true);
    sim.setIssuerStatus(issuerId, false);

    expect(() => sim.as(issuer).issueCredential(commitment)).toThrow(/Issuer is not approved/);
  });

  it('binds the leaf to the real issuer, so a rogue issuer cannot mint for an approved one', () => {
    sim.as(admin).setIssuerStatus(issuerId, true);
    const rogue = { issuerSecretKey: bytes32(31) };

    expect(() => sim.as(rogue).issueCredential(commitment)).toThrow(/Issuer is not approved/);
  });

  it('changes the commitment when any credential attribute changes', () => {
    const holderPk = pureCircuits.holderPublicKey(bytes32(60));
    const variants = [
      pureCircuits.credentialCommitment(label('Yobe'), 70_000n, 5n, bytes32(50), holderPk),
      pureCircuits.credentialCommitment(label('Borno'), 70_001n, 5n, bytes32(50), holderPk),
      pureCircuits.credentialCommitment(label('Borno'), 70_000n, 6n, bytes32(50), holderPk),
      pureCircuits.credentialCommitment(label('Borno'), 70_000n, 5n, bytes32(51), holderPk),
      pureCircuits.credentialCommitment(label('Borno'), 70_000n, 5n, bytes32(50), pureCircuits.holderPublicKey(bytes32(61))),
    ];

    for (const variant of variants) {
      expect(variant).not.toEqual(commitment);
    }
  });
});

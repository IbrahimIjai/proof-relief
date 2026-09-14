import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, expect, it } from 'vitest';
import { pureCircuits } from '../managed/proof-relief/contract/index.js';
import { witnesses } from '../witnesses.js';
import {
  YOBE,
  admin,
  alice,
  beneficiary,
  carol,
  commitmentOf,
  deployWorld,
  floodRelief,
  issue,
  issuerId,
  makeCredential,
  rogueIssuerId,
} from './fixtures.js';
import { ProofReliefSimulator, bytes32 } from './simulator.js';

setNetworkId('undeployed');

describe('issuer and credential integrity', () => {
  it('accepts a credential from an approved issuer', () => {
    const sim = deployWorld();
    const credential = issue(sim, alice());

    expect(sim.as(beneficiary(credential)).claim(floodRelief).campaigns.lookup(floodRelief).claimCount).toBe(1n);
  });

  it('rejects a credential naming an issuer that is not approved', () => {
    const sim = deployWorld();
    const credential = makeCredential(alice(), rogueIssuerId);

    expect(() => sim.as(beneficiary(credential)).claim(floodRelief)).toThrow(/Issuer is not approved/);
  });

  it('rejects a valid credential once its issuer is revoked', () => {
    const sim = deployWorld();
    const credential = issue(sim, alice());
    sim.as(admin).setIssuerStatus(issuerId, false);

    expect(() => sim.as(beneficiary(credential)).claim(floodRelief)).toThrow(/Issuer is not approved/);
  });

  it('rejects a credential whose income was lowered after issuance', () => {
    const sim = deployWorld();
    const original = issue(sim, makeCredential({ ...alice(), income: 170_000n }));

    expect(() => sim.as(beneficiary({ ...original, income: 70_000n })).claim(floodRelief)).toThrow(
      /Credential was not issued/,
    );
  });

  it('rejects a credential whose household size was raised after issuance', () => {
    const sim = deployWorld();
    const original = issue(sim, makeCredential({ ...alice(), householdSize: 2n }));

    expect(() => sim.as(beneficiary({ ...original, householdSize: 6n })).claim(floodRelief)).toThrow(
      /Credential was not issued/,
    );
  });

  it('rejects a credential whose region was changed after issuance', () => {
    const sim = deployWorld();
    const original = issue(sim, makeCredential({ ...alice(), region: YOBE }));

    expect(() => sim.as(beneficiary({ ...original, region: alice().region })).claim(floodRelief)).toThrow(
      /Credential was not issued/,
    );
  });

  it('rejects someone who copies the attributes but not the holder secret', () => {
    const sim = deployWorld();
    const victim = issue(sim, alice());

    expect(() => sim.as(beneficiary({ ...victim, holderSecret: bytes32(222) })).claim(floodRelief)).toThrow(
      /Credential was not issued/,
    );
  });

  it('rejects a credential re-attributed to a different approved issuer', () => {
    const sim = deployWorld();
    sim.as(admin).setIssuerStatus(rogueIssuerId, true);
    const credential = issue(sim, alice());

    expect(() => sim.as(beneficiary({ ...credential, issuerId: rogueIssuerId })).claim(floodRelief)).toThrow(
      /Credential was not issued/,
    );
  });

  it('rejects a lying prover that supplies another beneficiary’s valid Merkle path', () => {
    const honest = deployWorld();
    const carolCredential = issue(honest, carol());
    const carolLeaf = pureCircuits.credentialLeaf(issuerId, commitmentOf(carolCredential));

    const sim = new ProofReliefSimulator(admin, {
      witnesses: {
        ...witnesses,
        credentialPath: ({ privateState, ledger }) => [privateState, ledger.credentials.findPathForLeaf(carolLeaf)!],
      },
    });
    sim.as(admin).setIssuerStatus(issuerId, true);
    sim.createCampaign(floodRelief, alice().region, 100_000n, 4n);
    issue(sim, carolCredential);
    const forged = makeCredential({ region: alice().region, income: 1n, householdSize: 9n });

    expect(() => sim.as(beneficiary(forged)).claim(floodRelief)).toThrow(/Credential path does not match credential/);
    expect(sim.ledger().consumedNullifiers.isEmpty()).toBe(true);
  });
});

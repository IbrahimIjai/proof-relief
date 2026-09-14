import type { Credential } from '../managed/proof-relief/contract/index.js';
import { pureCircuits } from '../managed/proof-relief/contract/index.js';
import type { ProofReliefPrivateState } from '../witnesses.js';
import { ProofReliefSimulator, bytes32, label } from './simulator.js';

export const admin: ProofReliefPrivateState = { adminSecretKey: bytes32(1) };
export const issuer: ProofReliefPrivateState = { issuerSecretKey: bytes32(30) };
export const rogueIssuer: ProofReliefPrivateState = { issuerSecretKey: bytes32(31) };

export const issuerId = pureCircuits.issuerPublicKey(issuer.issuerSecretKey!);
export const rogueIssuerId = pureCircuits.issuerPublicKey(rogueIssuer.issuerSecretKey!);

export const BORNO = label('Borno');
export const YOBE = label('Yobe');
export const MAX_INCOME = 100_000n;
export const MIN_HOUSEHOLD = 4n;

export const floodRelief = label('borno-flood-relief');
export const schoolMeals = label('borno-school-meals');

type Attributes = { region: Uint8Array; income: bigint; householdSize: bigint };

let nextSeed = 100;

/** Builds a fresh beneficiary credential with its own holder secret and nonce. */
export const makeCredential = (
  { region, income, householdSize }: Attributes,
  from: Uint8Array = issuerId,
): Credential => ({
  holderSecret: bytes32(nextSeed++),
  nonce: bytes32(nextSeed++),
  issuerId: from,
  region,
  income,
  householdSize,
});

export const commitmentOf = (credential: Credential): Uint8Array =>
  pureCircuits.credentialCommitment(
    credential.region,
    credential.income,
    credential.householdSize,
    credential.nonce,
    pureCircuits.holderPublicKey(credential.holderSecret),
  );

export const nullifierOf = (sim: ProofReliefSimulator, campaignId: Uint8Array, credential: Credential): Uint8Array =>
  pureCircuits.claimNullifier(
    sim.ledger().deploymentSalt,
    campaignId,
    pureCircuits.holderBinding(credential.holderSecret, commitmentOf(credential)),
  );

export const beneficiary = (credential: Credential): ProofReliefPrivateState => ({ credential });

/**
 * Deploys the contract with an approved issuer and two campaigns (flood relief and
 * school meals, both Borno / income <= 100,000 / household >= 4).
 */
export const deployWorld = (options: { salt?: Uint8Array } = {}): ProofReliefSimulator => {
  const sim = new ProofReliefSimulator(admin, options);
  sim.as(admin).setIssuerStatus(issuerId, true);
  sim.createCampaign(floodRelief, BORNO, MAX_INCOME, MIN_HOUSEHOLD);
  sim.createCampaign(schoolMeals, BORNO, MAX_INCOME, MIN_HOUSEHOLD);
  return sim;
};

/** Issues the credential on-chain from the given issuer and returns it. */
export const issue = (
  sim: ProofReliefSimulator,
  credential: Credential,
  as: ProofReliefPrivateState = issuer,
): Credential => {
  sim.as(as).issueCredential(commitmentOf(credential));
  return credential;
};

export const alice = (): Credential => makeCredential({ region: BORNO, income: 70_000n, householdSize: 5n });
export const bob = (): Credential => makeCredential({ region: BORNO, income: 170_000n, householdSize: 5n });
export const carol = (): Credential => makeCredential({ region: BORNO, income: 40_000n, householdSize: 7n });

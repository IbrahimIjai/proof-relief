import type { Campaign, Credential } from './managed/proof-relief/contract/index.js';
import { pureCircuits } from './managed/proof-relief/contract/index.js';

/** JSON shape of a credential file handed to a beneficiary. Never uploaded anywhere. */
export type CredentialFile = {
  holderSecret: string;
  region: string;
  income: string;
  householdSize: string;
  nonce: string;
  issuerId: string;
};

const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const fromHex = (hex: string, expectedLength = 32): Uint8Array => {
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length !== expectedLength * 2) {
    throw new Error(`Expected ${expectedLength} bytes of hex`);
  }
  return Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16));
};

/** Encodes a short text label as right-padded Bytes<32>, matching Compact's `pad(32, "...")`. */
export const encodeLabel = (text: string): Uint8Array => {
  const encoded = new TextEncoder().encode(text);
  if (encoded.length > 32) throw new Error(`Label longer than 32 bytes: ${text}`);
  const bytes = new Uint8Array(32);
  bytes.set(encoded);
  return bytes;
};

export const decodeLabel = (bytes: Uint8Array): string => new TextDecoder().decode(bytes).replace(/\0+$/, '');

export const encodeCredential = (credential: Credential): CredentialFile => ({
  holderSecret: toHex(credential.holderSecret),
  region: toHex(credential.region),
  income: credential.income.toString(),
  householdSize: credential.householdSize.toString(),
  nonce: toHex(credential.nonce),
  issuerId: toHex(credential.issuerId),
});

export const decodeCredential = (file: CredentialFile): Credential => ({
  holderSecret: fromHex(file.holderSecret),
  region: fromHex(file.region),
  income: BigInt(file.income),
  householdSize: BigInt(file.householdSize),
  nonce: fromHex(file.nonce),
  issuerId: fromHex(file.issuerId),
});

export const credentialCommitmentOf = (credential: Credential): Uint8Array =>
  pureCircuits.credentialCommitment(
    credential.region,
    credential.income,
    credential.householdSize,
    credential.nonce,
    pureCircuits.holderPublicKey(credential.holderSecret),
  );

/**
 * Local preview of the campaign predicates. Purely informational: the contract enforces
 * the same rules inside the proof, so a manipulated preview cannot produce a valid claim.
 */
export const previewEligibility = (credential: Credential, campaign: Campaign) => ({
  region: decodeLabel(credential.region) === decodeLabel(campaign.requiredRegion),
  income: credential.income <= campaign.maxIncome,
  household: credential.householdSize >= campaign.minHouseholdSize,
});

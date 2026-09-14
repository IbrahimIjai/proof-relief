import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { type CredentialFile, ProofRelief, decodeCredential, encodeCredential } from '@proof-relief/contract';
import { stateDir } from './config.js';

/**
 * Local, gitignored storage for secrets and demo credentials. This stands in for the
 * separate devices of the admin, the issuer and each beneficiary in the demo.
 */
export type DeploymentRecord = {
  network: string;
  contractAddress: string;
  deployTxId: string;
  adminSecretKey: string;
  issuerSecretKey: string;
  deploymentSalt: string;
};

export const toHex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
export const fromHex = (hex: string): Uint8Array => new Uint8Array(Buffer.from(hex, 'hex'));

const file = (network: string, ...parts: string[]) => {
  const target = path.join(stateDir, network, ...parts);
  mkdirSync(path.dirname(target), { recursive: true });
  return target;
};

const readJson = <T>(target: string): T | undefined =>
  existsSync(target) ? (JSON.parse(readFileSync(target, 'utf8')) as T) : undefined;

export const credentialPath = (network: string, name: string) => file(network, 'credentials', `${name}.json`);

export const saveDeployment = (record: DeploymentRecord) =>
  writeFileSync(file(record.network, 'deployment.json'), `${JSON.stringify(record, null, 2)}\n`);

export const loadDeployment = (network: string): DeploymentRecord => {
  const record = readJson<DeploymentRecord>(file(network, 'deployment.json'));
  if (!record) throw new Error(`No deployment for ${network}. Run the deploy command first.`);
  return record;
};

export const saveCredential = (network: string, name: string, credential: ProofRelief.Credential) =>
  writeFileSync(credentialPath(network, name), `${JSON.stringify(encodeCredential(credential), null, 2)}\n`);

export const loadCredential = (network: string, name: string): ProofRelief.Credential => {
  const stored = readJson<CredentialFile>(credentialPath(network, name));
  if (!stored) throw new Error(`No credential named "${name}". Issue one first.`);
  return decodeCredential(stored);
};

export const loadOrCreateSeed = (network: string, create: () => string): string => {
  const target = file(network, 'wallet-seed');
  if (!existsSync(target)) writeFileSync(target, `${create()}\n`, { mode: 0o600 });
  return readFileSync(target, 'utf8').trim();
};

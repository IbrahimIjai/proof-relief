import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { Credential, Ledger, Witnesses } from './managed/proof-relief/contract/index.js';

/**
 * Local-only state held by the prover. Nothing in here is written to the ledger;
 * circuits only see these values through witness calls.
 */
export type ProofReliefPrivateState = {
  readonly adminSecretKey?: Uint8Array;
  readonly issuerSecretKey?: Uint8Array;
  readonly credential?: Credential;
};

type Context = WitnessContext<Ledger, ProofReliefPrivateState>;
type MerklePath = ReturnType<Witnesses<ProofReliefPrivateState>['credentialPath']>[1];

export const CREDENTIAL_TREE_DEPTH = 16;

const required = <T>(value: T | undefined, name: string): T => {
  if (value === undefined) {
    throw new Error(`Private state is missing ${name}`);
  }
  return value;
};

/**
 * A structurally valid path that cannot match any real root. Returned for unknown leaves
 * so the contract itself rejects the claim, rather than the prover bailing out early.
 */
const unissuedPath = (leaf: Uint8Array): MerklePath => ({
  leaf,
  path: Array.from({ length: CREDENTIAL_TREE_DEPTH }, () => ({ sibling: { field: 0n }, goes_left: false })),
});

export const witnesses = {
  adminSecretKey: ({ privateState }: Context): [ProofReliefPrivateState, Uint8Array] => [
    privateState,
    required(privateState.adminSecretKey, 'adminSecretKey'),
  ],

  issuerSecretKey: ({ privateState }: Context): [ProofReliefPrivateState, Uint8Array] => [
    privateState,
    required(privateState.issuerSecretKey, 'issuerSecretKey'),
  ],

  credential: ({ privateState }: Context): [ProofReliefPrivateState, Credential] => [
    privateState,
    required(privateState.credential, 'credential'),
  ],

  credentialPath: ({ privateState, ledger }: Context, leaf: Uint8Array): [ProofReliefPrivateState, MerklePath] => [
    privateState,
    ledger.credentials.findPathForLeaf(leaf) ?? unissuedPath(leaf),
  ],
} satisfies Witnesses<ProofReliefPrivateState>;

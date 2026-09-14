import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { Ledger } from './managed/proof-relief/contract/index.js';

/**
 * Local-only state held by the prover. Nothing in here is written to the ledger;
 * circuits only see these values through witness calls.
 */
export type ProofReliefPrivateState = {
  readonly adminSecretKey?: Uint8Array;
  readonly issuerSecretKey?: Uint8Array;
};

type Context = WitnessContext<Ledger, ProofReliefPrivateState>;

const required = <T>(value: T | undefined, name: string): T => {
  if (value === undefined) {
    throw new Error(`Private state is missing ${name}`);
  }
  return value;
};

export const witnesses = {
  adminSecretKey: ({ privateState }: Context): [ProofReliefPrivateState, Uint8Array] => [
    privateState,
    required(privateState.adminSecretKey, 'adminSecretKey'),
  ],

  issuerSecretKey: ({ privateState }: Context): [ProofReliefPrivateState, Uint8Array] => [
    privateState,
    required(privateState.issuerSecretKey, 'issuerSecretKey'),
  ],
};

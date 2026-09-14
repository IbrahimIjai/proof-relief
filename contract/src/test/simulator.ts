import {
  type CircuitContext,
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, type Ledger, ledger } from '../managed/proof-relief/contract/index.js';
import { type ProofReliefPrivateState, witnesses } from '../witnesses.js';

export const bytes32 = (seed: number): Uint8Array => new Uint8Array(32).fill(seed);

/** Runs ProofRelief circuits in-process against a local ledger, without a proof server. */
export class ProofReliefSimulator {
  readonly contract: Contract<ProofReliefPrivateState>;
  context: CircuitContext<ProofReliefPrivateState>;

  constructor(privateState: ProofReliefPrivateState, salt: Uint8Array = bytes32(7)) {
    this.contract = new Contract<ProofReliefPrivateState>(witnesses);
    const { currentPrivateState, currentContractState, currentZswapLocalState } = this.contract.initialState(
      createConstructorContext(privateState, '0'.repeat(64)),
      salt,
    );
    this.context = createCircuitContext(
      sampleContractAddress(),
      currentZswapLocalState,
      currentContractState,
      currentPrivateState,
    );
  }

  ledger(): Ledger {
    return ledger(this.context.currentQueryContext.state);
  }
}

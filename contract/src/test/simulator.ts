import {
  type CircuitContext,
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, type Ledger, type Witnesses, ledger } from '../managed/proof-relief/contract/index.js';
import { type ProofReliefPrivateState, witnesses as honestWitnesses } from '../witnesses.js';

export const bytes32 = (seed: number): Uint8Array => new Uint8Array(32).fill(seed);

/** Encodes a short label as right-padded Bytes<32>, matching Compact's `pad(32, "...")`. */
export const label = (text: string): Uint8Array => {
  const encoded = new TextEncoder().encode(text);
  if (encoded.length > 32) throw new Error(`Label too long: ${text}`);
  const out = new Uint8Array(32);
  out.set(encoded);
  return out;
};

/**
 * Runs ProofRelief circuits in-process against a local ledger, without a proof server.
 * `as(privateState)` switches which party (admin, issuer, beneficiary) is proving.
 */
export class ProofReliefSimulator {
  readonly contract: Contract<ProofReliefPrivateState>;
  context: CircuitContext<ProofReliefPrivateState>;

  constructor(
    deployer: ProofReliefPrivateState,
    options: { salt?: Uint8Array; witnesses?: Witnesses<ProofReliefPrivateState> } = {},
  ) {
    this.contract = new Contract<ProofReliefPrivateState>(options.witnesses ?? honestWitnesses);
    const { currentPrivateState, currentContractState, currentZswapLocalState } = this.contract.initialState(
      createConstructorContext(deployer, '0'.repeat(64)),
      options.salt ?? bytes32(7),
    );
    this.context = createCircuitContext(
      sampleContractAddress(),
      currentZswapLocalState,
      currentContractState,
      currentPrivateState,
    );
  }

  /** Sets the private state used by the next circuit call. */
  as(privateState: ProofReliefPrivateState): this {
    this.context = { ...this.context, currentPrivateState: privateState };
    return this;
  }

  ledger(): Ledger {
    return ledger(this.context.currentQueryContext.state);
  }

  createCampaign(id: Uint8Array, region: Uint8Array, maxIncome: bigint, minHouseholdSize: bigint): Ledger {
    this.context = this.contract.impureCircuits.createCampaign(
      this.context,
      id,
      region,
      maxIncome,
      minHouseholdSize,
    ).context;
    return this.ledger();
  }

  closeCampaign(id: Uint8Array): Ledger {
    this.context = this.contract.impureCircuits.closeCampaign(this.context, id).context;
    return this.ledger();
  }

  setIssuerStatus(issuerId: Uint8Array, approved: boolean): Ledger {
    this.context = this.contract.impureCircuits.setIssuerStatus(this.context, issuerId, approved).context;
    return this.ledger();
  }

  issueCredential(commitment: Uint8Array): Ledger {
    this.context = this.contract.impureCircuits.issueCredential(this.context, commitment).context;
    return this.ledger();
  }

  claim(campaignId: Uint8Array): Ledger {
    this.context = this.contract.impureCircuits.claim(this.context, campaignId).context;
    return this.ledger();
  }

  /** Full textual dump of the public contract state, as an indexer would see it. */
  publicStateDump(): string {
    return this.context.currentQueryContext.state.toString();
  }
}

import { CompiledContract, type ProvableCircuitId } from '@midnight-ntwrk/compact-js';
import type { DeployedContract, FoundContract } from '@midnight-ntwrk/midnight-js/contracts';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js/types';
import { ProofRelief, type ProofReliefPrivateState, witnesses } from '@proof-relief/contract';
import { contractConfig } from './config.js';

export type ProofReliefContract = ProofRelief.Contract<ProofReliefPrivateState>;
export type ProofReliefCircuits = ProvableCircuitId<ProofReliefContract>;

export const PRIVATE_STATE_ID = 'proofRelief';

export type ProofReliefProviders = MidnightProviders<
  ProofReliefCircuits,
  typeof PRIVATE_STATE_ID,
  ProofReliefPrivateState
>;

export type ProofReliefHandle = DeployedContract<ProofReliefContract> | FoundContract<ProofReliefContract>;

export const compiledContract = CompiledContract.make('proof-relief', ProofRelief.Contract).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(contractConfig.zkConfigPath),
);

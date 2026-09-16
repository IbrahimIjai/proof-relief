import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Campaign = { active: boolean;
                         requiredRegion: Uint8Array;
                         maxIncome: bigint;
                         minHouseholdSize: bigint;
                         claimCount: bigint
                       };

export type Credential = { holderSecret: Uint8Array;
                           region: Uint8Array;
                           income: bigint;
                           householdSize: bigint;
                           nonce: Uint8Array;
                           issuerId: Uint8Array
                         };

export type Witnesses<PS> = {
  adminSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  issuerSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  credential(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Credential];
  credentialPath(context: __compactRuntime.WitnessContext<Ledger, PS>,
                 leaf_0: Uint8Array): [PS, { leaf: Uint8Array,
                                             path: { sibling: { field: bigint },
                                                     goes_left: boolean
                                                   }[]
                                           }];
}

export type ImpureCircuits<PS> = {
  createCampaign(context: __compactRuntime.CircuitContext<PS>,
                 campaignId_0: Uint8Array,
                 requiredRegion_0: Uint8Array,
                 maxIncome_0: bigint,
                 minHouseholdSize_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  closeCampaign(context: __compactRuntime.CircuitContext<PS>,
                campaignId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  setIssuerStatus(context: __compactRuntime.CircuitContext<PS>,
                  issuerId_0: Uint8Array,
                  approved_0: boolean): __compactRuntime.CircuitResults<PS, []>;
  issueCredential(context: __compactRuntime.CircuitContext<PS>,
                  commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  claim(context: __compactRuntime.CircuitContext<PS>, campaignId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  createCampaign(context: __compactRuntime.CircuitContext<PS>,
                 campaignId_0: Uint8Array,
                 requiredRegion_0: Uint8Array,
                 maxIncome_0: bigint,
                 minHouseholdSize_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  closeCampaign(context: __compactRuntime.CircuitContext<PS>,
                campaignId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  setIssuerStatus(context: __compactRuntime.CircuitContext<PS>,
                  issuerId_0: Uint8Array,
                  approved_0: boolean): __compactRuntime.CircuitResults<PS, []>;
  issueCredential(context: __compactRuntime.CircuitContext<PS>,
                  commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  claim(context: __compactRuntime.CircuitContext<PS>, campaignId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  adminPublicKey(sk_0: Uint8Array): Uint8Array;
  issuerPublicKey(sk_0: Uint8Array): Uint8Array;
  holderPublicKey(holderSecret_0: Uint8Array): Uint8Array;
  credentialCommitment(region_0: Uint8Array,
                       income_0: bigint,
                       householdSize_0: bigint,
                       nonce_0: Uint8Array,
                       holderPk_0: Uint8Array): Uint8Array;
  credentialLeaf(issuerId_0: Uint8Array, commitment_0: Uint8Array): Uint8Array;
  holderBinding(holderSecret_0: Uint8Array, commitment_0: Uint8Array): Uint8Array;
  claimNullifier(salt_0: Uint8Array,
                 campaignId_0: Uint8Array,
                 binding_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  createCampaign(context: __compactRuntime.CircuitContext<PS>,
                 campaignId_0: Uint8Array,
                 requiredRegion_0: Uint8Array,
                 maxIncome_0: bigint,
                 minHouseholdSize_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  closeCampaign(context: __compactRuntime.CircuitContext<PS>,
                campaignId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  setIssuerStatus(context: __compactRuntime.CircuitContext<PS>,
                  issuerId_0: Uint8Array,
                  approved_0: boolean): __compactRuntime.CircuitResults<PS, []>;
  issueCredential(context: __compactRuntime.CircuitContext<PS>,
                  commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  claim(context: __compactRuntime.CircuitContext<PS>, campaignId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  adminPublicKey(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  issuerPublicKey(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  holderPublicKey(context: __compactRuntime.CircuitContext<PS>,
                  holderSecret_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  credentialCommitment(context: __compactRuntime.CircuitContext<PS>,
                       region_0: Uint8Array,
                       income_0: bigint,
                       householdSize_0: bigint,
                       nonce_0: Uint8Array,
                       holderPk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  credentialLeaf(context: __compactRuntime.CircuitContext<PS>,
                 issuerId_0: Uint8Array,
                 commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  holderBinding(context: __compactRuntime.CircuitContext<PS>,
                holderSecret_0: Uint8Array,
                commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  claimNullifier(context: __compactRuntime.CircuitContext<PS>,
                 salt_0: Uint8Array,
                 campaignId_0: Uint8Array,
                 binding_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
}

export type Ledger = {
  readonly admin: Uint8Array;
  readonly deploymentSalt: Uint8Array;
  campaigns: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Campaign;
    [Symbol.iterator](): Iterator<[Uint8Array, Campaign]>
  };
  approvedIssuers: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<[Uint8Array, boolean]>
  };
  consumedNullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  credentials: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined;
    history(): Iterator<__compactRuntime.MerkleTreeDigest>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               salt_0: Uint8Array): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;

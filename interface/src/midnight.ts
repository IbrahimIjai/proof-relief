import { CompiledContract, type ProvableCircuitId } from '@midnight-ntwrk/compact-js';
import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { Transaction, type FinalizedTransaction } from '@midnight-ntwrk/ledger-v8';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js/contracts';
import { setNetworkId } from '@midnight-ntwrk/midnight-js/network-id';
import type { MidnightProviders, PrivateStateProvider, UnboundTransaction } from '@midnight-ntwrk/midnight-js/types';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { ProofRelief, type ProofReliefPrivateState, encodeLabel, witnesses } from '@proof-relief/contract';
import { config } from './config';

setNetworkId(config.networkId);

type Contract = ProofRelief.Contract<ProofReliefPrivateState>;
type Circuits = ProvableCircuitId<Contract>;
const PRIVATE_STATE_ID = 'proofRelief';

const compiledContract = CompiledContract.make('proof-relief', ProofRelief.Contract).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets('.'),
);

// The indexer client defaults to Node's `ws`, which is undefined in browsers.
const browserWebSocket = WebSocket as unknown as Parameters<typeof indexerPublicDataProvider>[2];

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16));

/** Reads public contract state without a wallet. */
export const fetchLedger = async (): Promise<ProofRelief.Ledger | null> => {
  if (!config.contractAddress) return null;
  const state = await indexerPublicDataProvider(config.indexerUri, config.indexerWsUri, browserWebSocket).queryContractState(
    config.contractAddress,
  );
  return state ? ProofRelief.ledger(state.data) : null;
};

export const campaignKey = () => encodeLabel(config.campaignId);

type StateProvider = PrivateStateProvider<typeof PRIVATE_STATE_ID, ProofReliefPrivateState>;
type SigningKey = Parameters<StateProvider['setSigningKey']>[1];

/**
 * Keeps the credential in memory for the duration of one claim. Nothing is written to
 * browser storage, so closing the tab discards all private inputs.
 */
const memoryPrivateState = (): StateProvider => {
  const states = new Map<string, ProofReliefPrivateState>();
  const keys = new Map<string, SigningKey>();
  let address = '';
  const unsupported = () => Promise.reject(new Error('Not supported in the ProofRelief interface'));
  return {
    setContractAddress: (a) => void (address = a),
    set: async (id, state) => void states.set(`${address}:${id}`, state),
    get: async (id) => states.get(`${address}:${id}`) ?? null,
    remove: async (id) => void states.delete(`${address}:${id}`),
    clear: async () => states.clear(),
    setSigningKey: async (a, key) => void keys.set(a, key),
    getSigningKey: async (a) => keys.get(a) ?? null,
    removeSigningKey: async (a) => void keys.delete(a),
    clearSigningKeys: async () => keys.clear(),
    exportPrivateStates: unsupported,
    importPrivateStates: unsupported,
    exportSigningKeys: unsupported,
    importSigningKeys: unsupported,
  };
};

const findWallet = (): InitialAPI | undefined =>
  Object.values((window as { midnight?: Record<string, InitialAPI> }).midnight ?? {}).find(
    (wallet) => typeof wallet?.apiVersion === 'string' && wallet.apiVersion.startsWith('4.'),
  );

export const connectWallet = async (): Promise<ConnectedAPI> => {
  const wallet = findWallet();
  if (!wallet) throw new Error('Midnight Lace wallet not found. Install and enable the extension.');
  return wallet.connect(config.networkId);
};

const providers = async (
  wallet: ConnectedAPI,
): Promise<MidnightProviders<Circuits, typeof PRIVATE_STATE_ID, ProofReliefPrivateState>> => {
  const walletConfig = await wallet.getConfiguration();
  const addresses = await wallet.getShieldedAddresses();
  const zkConfigProvider = new FetchZkConfigProvider<Circuits>(window.location.origin, fetch.bind(window));
  if (!walletConfig.proverServerUri) throw new Error('Wallet has no proof server configured.');

  return {
    privateStateProvider: memoryPrivateState(),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(walletConfig.proverServerUri, zkConfigProvider),
    publicDataProvider: indexerPublicDataProvider(walletConfig.indexerUri, walletConfig.indexerWsUri, browserWebSocket),
    walletProvider: {
      getCoinPublicKey: () => addresses.shieldedCoinPublicKey,
      getEncryptionPublicKey: () => addresses.shieldedEncryptionPublicKey,
      balanceTx: async (tx: UnboundTransaction): Promise<FinalizedTransaction> => {
        const balanced = await wallet.balanceUnsealedTransaction(toHex(tx.serialize()));
        return Transaction.deserialize('signature', 'proof', 'binding', fromHex(balanced.tx));
      },
    },
    midnightProvider: {
      submitTx: async (tx: FinalizedTransaction) => {
        await wallet.submitTransaction(toHex(tx.serialize()));
        return tx.identifiers()[0];
      },
    },
  };
};

export type ClaimResult = { txId: string; txHash: string; blockHeight: number };

/** Generates the eligibility proof locally (via the wallet's proof server) and submits the claim. */
export const submitClaim = async (wallet: ConnectedAPI, credential: ProofRelief.Credential): Promise<ClaimResult> => {
  const contract = await findDeployedContract(await providers(wallet), {
    compiledContract,
    contractAddress: config.contractAddress,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: { credential },
  });
  const { public: tx } = await contract.callTx.claim(campaignKey());
  return { txId: tx.txId, txHash: tx.txHash, blockHeight: tx.blockHeight };
};

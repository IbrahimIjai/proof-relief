import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setNetworkId } from '@midnight-ntwrk/midnight-js/network-id';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

/** Gitignored directory for per-network deployment records, secrets and demo credentials. */
export const stateDir = path.resolve(currentDir, '..', '.state');

export const contractConfig = {
  privateStateStoreName: 'proof-relief-private-state',
  zkConfigPath: path.resolve(currentDir, '..', '..', 'contract', 'src', 'managed', 'proof-relief'),
};

export interface NetworkConfig {
  readonly networkId: 'undeployed' | 'preview' | 'preprod';
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
}

export const networks = {
  standalone: {
    networkId: 'undeployed',
    indexer: 'http://127.0.0.1:8088/api/v3/graphql',
    indexerWS: 'ws://127.0.0.1:8088/api/v3/graphql/ws',
    node: 'http://127.0.0.1:9944',
    proofServer: 'http://127.0.0.1:6300',
  },
  preview: {
    networkId: 'preview',
    indexer: 'https://indexer.preview.midnight.network/api/v3/graphql',
    indexerWS: 'wss://indexer.preview.midnight.network/api/v3/graphql/ws',
    node: 'https://rpc.preview.midnight.network',
    proofServer: 'http://127.0.0.1:6300',
  },
  preprod: {
    networkId: 'preprod',
    indexer: 'https://indexer.preprod.midnight.network/api/v3/graphql',
    indexerWS: 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws',
    node: 'https://rpc.preprod.midnight.network',
    proofServer: 'http://127.0.0.1:6300',
  },
} as const satisfies Record<string, NetworkConfig>;

export type NetworkName = keyof typeof networks;

export const useNetwork = (name: NetworkName): NetworkConfig => {
  const config = networks[name];
  setNetworkId(config.networkId);
  return config;
};

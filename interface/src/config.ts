import type { NetworkId } from '@midnight-ntwrk/midnight-js/network-id';

const env = import.meta.env;

export const config = {
  networkId: (env.VITE_NETWORK_ID ?? 'preprod') as NetworkId,
  contractAddress: env.VITE_CONTRACT_ADDRESS ?? '',
  campaignId: env.VITE_CAMPAIGN_ID ?? 'borno-flood-relief',
  campaignName: env.VITE_CAMPAIGN_NAME ?? 'Borno Flood Relief',
  indexerUri: env.VITE_INDEXER_URI ?? 'https://indexer.preprod.midnight.network/api/v3/graphql',
  indexerWsUri: env.VITE_INDEXER_WS_URI ?? 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws',
};

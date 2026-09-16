import type { NetworkId } from '@midnight-ntwrk/midnight-js/network-id';

/**
 * The deployed ProofRelief demo. These are fixed for the hosted app, so it needs no
 * configuration to run. Point them at another deployment by editing this file.
 */
export const config = {
  networkId: 'preview' as NetworkId,
  contractAddress: '07af9a3a721692b60ed87a3515ff93e597962ace40284fd7e9e561be6536f649',
  campaignId: 'borno-flood-relief',
  campaignName: 'Borno Flood Relief',
  indexerUri: 'https://indexer.preview.midnight.network/api/v3/graphql',
  indexerWsUri: 'wss://indexer.preview.midnight.network/api/v3/graphql/ws',
};

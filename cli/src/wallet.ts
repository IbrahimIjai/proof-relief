// Wallet and provider wiring, adapted from midnightntwrk/example-counter (Apache-2.0).
import { Buffer } from 'node:buffer';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { unshieldedToken } from '@midnight-ntwrk/ledger-v8';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { getNetworkId } from '@midnight-ntwrk/midnight-js/network-id';
import type { MidnightProvider, WalletProvider } from '@midnight-ntwrk/midnight-js/types';
import { InMemoryTransactionHistoryStorage } from '@midnight-ntwrk/wallet-sdk-abstractions';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { WalletEntrySchema, WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import {
  PublicKey,
  UnshieldedWallet,
  createKeystore,
  type UnshieldedKeystore,
} from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import * as Rx from 'rxjs';
import { WebSocket } from 'ws';
import { type NetworkConfig, contractConfig } from './config.js';
import type { ProofReliefCircuits, ProofReliefProviders } from './contract.js';

// The indexer client expects a global WebSocket in Node.
globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;

export interface WalletContext {
  readonly wallet: WalletFacade;
  readonly shieldedSecretKeys: ledger.ZswapSecretKeys;
  readonly dustSecretKey: ledger.DustSecretKey;
  readonly unshieldedKeystore: UnshieldedKeystore;
}

export const step = async <T>(message: string, fn: () => Promise<T>): Promise<T> => {
  process.stdout.write(`  … ${message}\n`);
  const result = await fn();
  process.stdout.write(`  ✓ ${message}\n`);
  return result;
};

const deriveKeys = (seed: string) => {
  const hd = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
  if (hd.type !== 'seedOk') throw new Error('Invalid wallet seed');
  const derived = hd.hdWallet.selectAccount(0).selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust]).deriveKeysAt(0);
  if (derived.type !== 'keysDerived') throw new Error('Failed to derive wallet keys');
  hd.hdWallet.clear();
  return derived.keys;
};

const synced = (wallet: WalletFacade) =>
  Rx.firstValueFrom(wallet.state().pipe(Rx.throttleTime(2_000), Rx.filter((s) => s.isSynced)));

const percent = ({ appliedIndex, highestRelevantWalletIndex: target }: { appliedIndex: bigint; highestRelevantWalletIndex: bigint }) =>
  target > 0n ? `${(appliedIndex * 100n) / target}% (${appliedIndex}/${target})` : 'connecting';

/** A first sync on a public network scans the whole chain, so show where it is. */
const syncedWithProgress = async (wallet: WalletFacade) => {
  const reporter = wallet
    .state()
    .pipe(Rx.throttleTime(20_000))
    .subscribe((s) => {
      if (!s.isSynced) {
        process.stdout.write(`    shielded ${percent(s.shielded.progress)} · dust ${percent(s.dust.progress)}\n`);
      }
    });
  try {
    return await synced(wallet);
  } finally {
    reporter.unsubscribe();
  }
};

/**
 * NIGHT only pays fees after its UTXOs are registered for DUST generation.
 * Registers any unregistered UTXOs, then waits until DUST is spendable.
 */
const ensureDust = async (wallet: WalletFacade, keystore: UnshieldedKeystore): Promise<void> => {
  const state = await synced(wallet);
  if (state.dust.availableCoins.length > 0) return;

  const unregistered = state.unshielded.availableCoins.filter(
    (coin: { meta?: { registeredForDustGeneration?: boolean } }) => coin.meta?.registeredForDustGeneration !== true,
  );
  if (unregistered.length > 0) {
    await step(`Registering ${unregistered.length} NIGHT UTXO(s) for DUST generation`, async () => {
      const recipe = await wallet.registerNightUtxosForDustGeneration(unregistered, keystore.getPublicKey(), (payload) =>
        keystore.signData(payload),
      );
      await wallet.submitTransaction(await wallet.finalizeRecipe(recipe));
    });
  }
  await step('Waiting for DUST to generate', () =>
    Rx.firstValueFrom(
      wallet.state().pipe(
        Rx.throttleTime(5_000),
        Rx.filter((s) => s.isSynced && s.dust.balance(new Date()) > 0n),
      ),
    ),
  );
};

export const buildWallet = async (config: NetworkConfig, seed: string): Promise<WalletContext> => {
  const keys = deriveKeys(seed);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], getNetworkId());

  const indexerClientConnection = { indexerHttpUrl: config.indexer, indexerWsUrl: config.indexerWS };
  const wallet = await WalletFacade.init({
    configuration: {
      networkId: getNetworkId(),
      indexerClientConnection,
      provingServerUrl: new URL(config.proofServer),
      relayURL: new URL(config.node.replace(/^http/, 'ws')),
      txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
      costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
    },
    shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg) => UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (cfg) => DustWallet(cfg).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
  });
  await wallet.start(shieldedSecretKeys, dustSecretKey);

  console.log(`\n  Wallet address (fund with tNight): ${unshieldedKeystore.getBech32Address()}\n`);
  const state = await step('Syncing wallet', () => syncedWithProgress(wallet));

  if ((state.unshielded.balances[unshieldedToken().raw] ?? 0n) === 0n) {
    await step('Waiting for tNight (use the faucet for Preprod)', () =>
      Rx.firstValueFrom(
        wallet.state().pipe(
          Rx.throttleTime(10_000),
          Rx.filter((s) => s.isSynced && (s.unshielded.balances[unshieldedToken().raw] ?? 0n) > 0n),
        ),
      ),
    );
  }
  await ensureDust(wallet, unshieldedKeystore);

  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
};

/**
 * Signs unshielded offers with the proof marker that matches the intent. Works around a
 * wallet SDK issue where signRecipe assumes 'pre-proof' for already-proven intents.
 */
const signIntents = (
  tx: { intents?: Map<number, any> },
  sign: (payload: Uint8Array) => ledger.Signature,
  marker: 'proof' | 'pre-proof',
): void => {
  if (!tx.intents) return;
  for (const segment of tx.intents.keys()) {
    const intent = tx.intents.get(segment);
    if (!intent) continue;
    const cloned = ledger.Intent.deserialize<ledger.SignatureEnabled, ledger.Proofish, ledger.PreBinding>(
      'signature',
      marker,
      'pre-binding',
      intent.serialize(),
    );
    const signature = sign(cloned.signatureData(segment));
    for (const offer of ['fallibleUnshieldedOffer', 'guaranteedUnshieldedOffer'] as const) {
      const current = cloned[offer];
      if (current) {
        cloned[offer] = current.addSignatures(
          current.inputs.map((_: ledger.UtxoSpend, i: number) => current.signatures.at(i) ?? signature),
        );
      }
    }
    tx.intents.set(segment, cloned);
  }
};

const walletProvider = async (ctx: WalletContext): Promise<WalletProvider & MidnightProvider> => {
  const state = await synced(ctx.wallet);
  return {
    getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () => state.shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx, ttl?) {
      const recipe = await ctx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      const sign = (payload: Uint8Array) => ctx.unshieldedKeystore.signData(payload);
      signIntents(recipe.baseTransaction, sign, 'proof');
      if (recipe.balancingTransaction) signIntents(recipe.balancingTransaction, sign, 'pre-proof');
      return ctx.wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx) => ctx.wallet.submitTransaction(tx) as never,
  };
};

export const buildProviders = async (ctx: WalletContext, config: NetworkConfig): Promise<ProofReliefProviders> => {
  const wallet = await walletProvider(ctx);
  const zkConfigProvider = new NodeZkConfigProvider<ProofReliefCircuits>(contractConfig.zkConfigPath);
  const accountId = wallet.getCoinPublicKey();
  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: `${contractConfig.privateStateStoreName}-${config.networkId}`,
      accountId,
      privateStoragePasswordProvider: () => `${Buffer.from(accountId, 'hex').toString('base64')}!`,
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
    walletProvider: wallet,
    midnightProvider: wallet,
  };
};

import { randomBytes } from 'node:crypto';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js/contracts';
import { ProofRelief, credentialCommitmentOf, decodeLabel, encodeLabel as label } from '@proof-relief/contract';
import { type NetworkName, networks, useNetwork } from './config.js';
import { PRIVATE_STATE_ID, type ProofReliefHandle, type ProofReliefProviders, compiledContract } from './contract.js';
import {
  credentialPath,
  fromHex,
  loadCredential,
  loadDeployment,
  loadOrCreateSeed,
  saveCredential,
  saveDeployment,
  toHex,
} from './store.js';
import { buildProviders, buildWallet, step } from './wallet.js';

const GENESIS_SEED = '0000000000000000000000000000000000000000000000000000000000000001';

const DEMO_CAMPAIGN = {
  id: 'borno-flood-relief',
  region: 'Borno',
  maxIncome: 100_000n,
  minHouseholdSize: 4n,
};

const usage = `
Usage: bun run relief <command> [args] [--network standalone|preprod|preview]

  deploy                                   Deploy a new ProofRelief contract
  setup                                    Approve the demo issuer and create "${DEMO_CAMPAIGN.id}"
  issue <name> <region> <income> <household>  Issue a private credential to a beneficiary
  claim <name> [campaign]                  Generate the ZK proof and submit a claim
  state                                    Print the public ledger state
`;

const parseArgs = (argv: string[]) => {
  const rest: string[] = [];
  let network: NetworkName = 'standalone';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--network') {
      const value = argv[++i];
      if (!value || !(value in networks)) throw new Error(`Unknown network: ${value}`);
      network = value as NetworkName;
    } else {
      rest.push(argv[i]);
    }
  }
  const [command, ...args] = rest;
  return { command, args, network };
};

const connect = async (network: NetworkName): Promise<ProofReliefProviders> => {
  const config = useNetwork(network);
  const seed =
    network === 'standalone' ? GENESIS_SEED : loadOrCreateSeed(network, () => randomBytes(32).toString('hex'));
  const wallet = await buildWallet(config, seed);
  return buildProviders(wallet, config);
};

const join = (providers: ProofReliefProviders, network: string): Promise<ProofReliefHandle> =>
  findDeployedContract(providers, {
    compiledContract,
    contractAddress: loadDeployment(network).contractAddress,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: {},
  });

const printTx = (what: string, tx: { txId: string; txHash?: string; blockHeight?: number }) =>
  console.log(`  ${what}\n    txId:  ${tx.txId}${tx.txHash ? `\n    hash:  ${tx.txHash}` : ''}${tx.blockHeight !== undefined ? `\n    block: ${tx.blockHeight}` : ''}`);

const commands: Record<string, (providers: ProofReliefProviders, network: NetworkName, args: string[]) => Promise<void>> = {
  async deploy(providers, network) {
    const adminSecretKey = randomBytes(32);
    const issuerSecretKey = randomBytes(32);
    const deploymentSalt = randomBytes(32);

    const deployed = await step('Deploying ProofRelief (proving constructor)', () =>
      deployContract(providers, {
        compiledContract,
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: { adminSecretKey },
        args: [deploymentSalt],
      }),
    );
    const { contractAddress, txId } = deployed.deployTxData.public;
    saveDeployment({
      network,
      contractAddress,
      deployTxId: txId,
      adminSecretKey: toHex(adminSecretKey),
      issuerSecretKey: toHex(issuerSecretKey),
      deploymentSalt: toHex(deploymentSalt),
    });
    console.log(`\n  Contract address: ${contractAddress}`);
    printTx('Deploy transaction', deployed.deployTxData.public);
  },

  async setup(providers, network) {
    const record = loadDeployment(network);
    const contract = await join(providers, network);
    const issuerId = ProofRelief.pureCircuits.issuerPublicKey(fromHex(record.issuerSecretKey));

    await providers.privateStateProvider.set(PRIVATE_STATE_ID, { adminSecretKey: fromHex(record.adminSecretKey) });
    const approval = await step('Approving demo issuer', () => contract.callTx.setIssuerStatus(issuerId, true));
    printTx(`Issuer ${toHex(issuerId)} approved`, approval.public);

    const campaign = await step(`Creating campaign ${DEMO_CAMPAIGN.id}`, () =>
      contract.callTx.createCampaign(
        label(DEMO_CAMPAIGN.id),
        label(DEMO_CAMPAIGN.region),
        DEMO_CAMPAIGN.maxIncome,
        DEMO_CAMPAIGN.minHouseholdSize,
      ),
    );
    printTx('Campaign created', campaign.public);
  },

  async issue(providers, network, [name, region, income, household]) {
    if (!name || !region || !income || !household) throw new Error(usage);
    const record = loadDeployment(network);
    const contract = await join(providers, network);
    const issuerSecretKey = fromHex(record.issuerSecretKey);

    // The beneficiary generates the holder secret; the issuer only ever sees holderPublicKey.
    const credential: ProofRelief.Credential = {
      holderSecret: randomBytes(32),
      region: label(region),
      income: BigInt(income),
      householdSize: BigInt(household),
      nonce: randomBytes(32),
      issuerId: ProofRelief.pureCircuits.issuerPublicKey(issuerSecretKey),
    };
    const commitment = credentialCommitmentOf(credential);

    await providers.privateStateProvider.set(PRIVATE_STATE_ID, { issuerSecretKey });
    const tx = await step(`Issuing credential for ${name}`, () => contract.callTx.issueCredential(commitment));
    saveCredential(network, name, credential);
    printTx(`Credential commitment ${toHex(commitment)} issued`, tx.public);
    console.log(`  Credential file for ${name}: ${credentialPath(network, name)}`);
  },

  async claim(providers, network, [name, campaign = DEMO_CAMPAIGN.id]) {
    if (!name) throw new Error(usage);
    const contract = await join(providers, network);
    await providers.privateStateProvider.set(PRIVATE_STATE_ID, { credential: loadCredential(network, name) });

    try {
      const tx = await step(`Proving eligibility for ${name} and claiming ${campaign}`, () =>
        contract.callTx.claim(label(campaign)),
      );
      console.log('\n  ✓ Eligibility verified\n  ✓ Claim recorded\n  ✓ Sensitive data remained private\n');
      printTx('Claim transaction', tx.public);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.log(`\n  ✗ Claim rejected: ${reason}\n`);
      process.exitCode = 2;
    } finally {
      await providers.privateStateProvider.set(PRIVATE_STATE_ID, {});
    }
  },

  async state(providers, network) {
    const { contractAddress } = loadDeployment(network);
    const contractState = await providers.publicDataProvider.queryContractState(contractAddress);
    if (!contractState) throw new Error(`No contract state found at ${contractAddress}`);
    const state = ProofRelief.ledger(contractState.data);

    console.log(`\n  Public ledger state for ${contractAddress}\n`);
    for (const [id, c] of state.campaigns) {
      console.log(
        `  Campaign ${decodeLabel(id)}: active=${c.active} region=${decodeLabel(c.requiredRegion)} maxIncome=${c.maxIncome} minHousehold=${c.minHouseholdSize} claims=${c.claimCount}`,
      );
    }
    for (const [id, approved] of state.approvedIssuers) console.log(`  Issuer ${toHex(id)}: approved=${approved}`);
    console.log(`  Issued credential leaves: ${state.credentials.firstFree()}`);
    console.log(`  Consumed nullifiers (${state.consumedNullifiers.size()}):`);
    for (const nullifier of state.consumedNullifiers) console.log(`    ${toHex(nullifier)}`);
    console.log('');
  },
};

const main = async () => {
  const { command, args, network } = parseArgs(process.argv.slice(2));
  const run = command ? commands[command] : undefined;
  if (!run) {
    console.log(usage);
    process.exitCode = command ? 1 : 0;
    return;
  }
  const providers = await connect(network);
  await run(providers, network, args);
};

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 100));

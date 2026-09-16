# ProofRelief

**Prove you qualify for aid. Claim exactly once. Reveal nothing else.**

ProofRelief is a stateful private aid-claim protocol on [Midnight](https://midnight.network). An approved issuer attests a beneficiary's hidden facts (region, income, household size). The beneficiary proves in zero knowledge that those facts satisfy a campaign's public rules, and the Midnight contract enforces **one claim per credential per campaign** through a campaign-scoped nullifier. Anyone can audit the rules and the claim count. Nobody can see who claimed or what they earn.

[![CI](https://github.com/IbrahimIjai/proof-relief/actions/workflows/ci.yml/badge.svg)](https://github.com/IbrahimIjai/proof-relief/actions/workflows/ci.yml)

**Live on Midnight Preview:** contract `07af9a3a721692b60ed87a3515ff93e597962ace40284fd7e9e561be6536f649`.
A real claim was proven and verified on the public network in block 887325, a replay was rejected,
and an over-limit claim was rejected. Transaction hashes: [`DEPLOYMENT.md`](DEPLOYMENT.md).

---

## Why this needs Midnight

A normal backend could check `income <= limit` and return `eligible = true`. But it would receive every applicant's income, household and identity, and it would have to be trusted not to leak them, approve duplicates or edit the claim count.

With ProofRelief:

| Concern | Traditional backend | ProofRelief on Midnight |
|---|---|---|
| Who sees income, household size, region? | The operator's database | Nobody. Values stay on the beneficiary's device as witness inputs |
| Who decides eligibility? | Server code you must trust | The Compact circuit, verified by the network |
| Who stops double claims? | A database uniqueness check you must trust | A nullifier set in contract state, updated atomically with the count |
| Can claims be linked across campaigns? | Yes, same user id | No. Each campaign gets an unrelated nullifier |

Remove Midnight and the privacy and trust guarantees disappear. That is the point of the project.

---

## The exact proof statement

A successful `claim(campaignId)` transaction proves:

> "I know a credential `(holderSecret, region, income, householdSize, nonce, issuerId)` such that
> 1. `H(issuerId, H(region, income, householdSize, nonce, H(holderSecret)))` is a leaf in the contract's credential tree,
> 2. `issuerId` is currently approved,
> 3. the campaign exists and is active,
> 4. `region == campaign.requiredRegion`, `income <= campaign.maxIncome`, `householdSize >= campaign.minHouseholdSize`, and
> 5. `nullifier = H(deploymentSalt, campaignId, H(holderSecret, commitment))` has never been consumed,
>
> and it inserts that nullifier and increments the claim count in the same state transition."

Source: [`contract/src/proof-relief.compact`](contract/src/proof-relief.compact).

---

## Public vs private state

| On the public ledger | Never leaves the beneficiary |
|---|---|
| Campaign rules (region, income limit, minimum household) and active flag | Beneficiary name or identity |
| Claim count per campaign | Exact income |
| Approved issuer ids | Exact household size |
| Credential tree leaves (hiding hashes) | Holder secret |
| Consumed nullifiers (unlinkable across campaigns) | Raw credential and its nonce |
| Admin key commitment and deployment salt | Any reusable, cross-campaign identifier |

The privacy test suite checks this directly: it serializes the full public contract state after real claims and asserts that none of the private values appear, with a positive control proving the check can see public values.

---

## How it works

```
 Beneficiary                 Issuer (approved)              Midnight contract
 ───────────                 ─────────────────              ─────────────────
 holderSecret ─► holderPk ──► builds credential
                              commitment = H(attrs, holderPk)
                              issueCredential(commitment) ──► tree.insert(H(issuerId, commitment))
 ◄── credential file ────────

 claim(campaignId)
   witnesses: credential, Merkle path
   proof server generates ZK proof ─────────────────────────► verify proof
                                                              assert rules, membership, issuer
                                                              assert nullifier unused
                                                              insert nullifier + claimCount += 1
```

**Circuits**

| Circuit | Who | What it enforces |
|---|---|---|
| `constructor(salt)` | Deployer | Stores `H(adminSecret)` (from a private witness) and the deployment salt |
| `createCampaign` / `closeCampaign` | Admin | Admin proven by secret key, not `ownPublicKey()`. Campaign ids cannot be reused, so counts cannot be reset |
| `setIssuerStatus` | Admin | Approve or revoke an issuer |
| `issueCredential(commitment)` | Issuer | Issuer id derived from the issuer's secret, must be approved |
| `claim(campaignId)` | Beneficiary | The proof statement above |

### Replay model

- The nullifier depends only on the deployment salt, the campaign id and a binding of the holder secret to the credential. There is no session, challenge or caller input, so retrying from a new session or wallet produces the same nullifier and is rejected.
- `claim` accepts only the campaign id. The nullifier is derived inside the circuit, so a caller cannot supply their own.
- A different campaign or a different deployment yields an unrelated nullifier.

### Threat model and trust boundary

ProofRelief proves that **hidden values were attested by an approved issuer and satisfy the campaign**. It does not prove the issuer's real-world observation was true.

| Actor | Can | Cannot |
|---|---|---|
| Beneficiary | Claim once per campaign per credential | Alter attributes, borrow another credential without its holder secret, replay, forge a nullifier |
| Issuer | Attest credentials while approved | Mint for another issuer id, keep issuing after revocation, see holder secrets |
| Admin | Create/close campaigns, approve/revoke issuers | Reset claim counts, consume nullifiers, see private data |
| Observer | Read rules, counts, nullifiers | Learn who claimed, their income or household, or link their claims across campaigns |

---

## Repository layout

| Path | Contents |
|---|---|
| [`contract/`](contract/) | Compact contract, TypeScript witnesses, credential helpers, simulator and 59 tests |
| [`cli/`](cli/) | Deploy, setup, issue, claim and state commands using Midnight.js and the wallet SDK |
| [`interface/`](interface/) | React + Vite app: Campaign screen (live public state) and Beneficiary screen (Lace wallet claim) |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Transaction evidence from real runs with ZK proofs |
| [`proof-server.yml`](proof-server.yml) | Midnight proof server 8.1.0 |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | Compile with ZK keys, typecheck, test and build |

**Stack:** Compact 0.31.1 · compact-runtime 0.16.0 · Midnight.js 4.1.1 · Proof server 8.1.0 · React 19 + Vite 8 · Vitest 4 · Bun 1.3

---

## Run it

### Prerequisites

- [Bun](https://bun.sh) 1.3 and Node.js 22.15+
- Docker
- Compact compiler 0.31.1:
  ```sh
  curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
  compact update 0.31.1
  ```

### Build and test

```sh
bun install
bun run compact     # compile the contract and generate ZK keys (about 3 minutes)
bun run test        # 59 contract tests
bun run typecheck
```

### End-to-end demo with real proofs

```sh
bun run proof-server                        # proof server on :6300

# Local network (node + indexer in Docker, pre-funded genesis wallet)
bun run standalone:up

bun run relief deploy
bun run relief setup                        # approve demo issuer, create borno-flood-relief
bun run relief issue alice Borno 70000 5
bun run relief issue bob   Borno 170000 5
bun run relief claim alice                  # accepted
bun run relief claim alice                  # rejected: already claimed
bun run relief claim bob                    # rejected: income above limit
bun run relief state                        # only rules, count and nullifiers are public
```

Append `--network preview` (or `--network preprod`) to any command to use a public network. The first run prints a wallet address to fund from that network's faucet, for example the [Preview faucet](https://faucet.preview.midnight.network/). Secrets and credential files are stored in `cli/.state/` (gitignored).

### Interface

```sh
bun run --filter @proof-relief/interface dev
```

It reads the deployed Preview contract out of the box. Load a credential file from
`cli/.state/<network>/credentials/` on the Beneficiary screen and click **Generate Private Proof**
with the Midnight Lace wallet installed.

### Hosting the interface

[`vercel.json`](vercel.json) builds the workspace and publishes `interface/dist`, with no
environment variables to set: the network, contract address and campaign live in
[`interface/src/config.ts`](interface/src/config.ts). The generated contract bindings and the claim
circuit's proving artifacts are committed, so a host without the Compact compiler can build the
site. Point the app at a different deployment by editing that one file.

Claiming from the hosted site needs the Midnight Lace wallet, which supplies its own proof server
and indexer. The Campaign screen works without a wallet.

---

## Test suite

59 tests run the real compiled contract in-process through the Compact runtime.

| File | Tests | Covers |
|---|---|---|
| [`eligibility.test.ts`](contract/src/test/eligibility.test.ts) | 8 | Region match, income below / at / one above limit, household above / at / one below minimum |
| [`credential.test.ts`](contract/src/test/credential.test.ts) | 9 | Unapproved and revoked issuers, tampered income / household / region, copied attributes without holder secret, re-attributed issuer, lying prover supplying another beneficiary's Merkle path |
| [`replay.test.ts`](contract/src/test/replay.test.ts) | 8 | Identical replay, fresh session, re-issued credential, caller-supplied nullifier, independent campaigns, beneficiaries and deployments |
| [`atomicity.test.ts`](contract/src/test/atomicity.test.ts) | 6 | Success changes exactly one nullifier and one count; policy, region, unissued and replay failures leave the serialized public state byte-for-byte unchanged |
| [`privacy.test.ts`](contract/src/test/privacy.test.ts) | 7 | Public state contains no income, household size, holder secret, commitment, nonce or reusable id; nullifiers differ across campaigns |
| [`admin.test.ts`](contract/src/test/admin.test.ts) | 8 | Admin-only campaign and issuer management, no campaign reuse, input validation |
| [`issuance.test.ts`](contract/src/test/issuance.test.ts) | 5 | Approved, unapproved, revoked and rogue issuers; commitments bind every attribute |
| [`claim.test.ts`](contract/src/test/claim.test.ts) | 4 | Demo path, unknown and closed campaigns |
| [`proof-relief.test.ts`](contract/src/test/proof-relief.test.ts) | 4 | Deployment state |

---

## Known limitations

- **An approved issuer can lie.** The contract trusts issuer attestations; it cannot verify real-world facts.
- **Real-world uniqueness is not solved.** An issuer could give one person several credentials. There is no biometric or Sybil resistance.
- **No fund distribution.** A claim records eligibility; payouts are out of scope.
- **No credential recovery.** Losing the holder secret loses the claim right.
- **Simplified issuer model.** A single demo issuer approved by a single admin key.
- **Disclosed issuer id.** The claim reveals which approved issuer attested the credential (not which credential).
- **Public issuance metadata.** The number and timing of issued credentials are visible.
- **Rule-implied facts.** Successful claimants are publicly known to satisfy the campaign rules, for example living in Borno.
- **Fee payer linkability.** The wallet paying transaction fees can link one person's claims across campaigns if they reuse it.

---

## Five-minute judge path

1. **Read the proof statement** above, then the `claim` circuit in [`contract/src/proof-relief.compact`](contract/src/proof-relief.compact) (about 30 lines).
2. **See the adversarial tests:** [`credential.test.ts`](contract/src/test/credential.test.ts) (lying prover, tampering) and [`atomicity.test.ts`](contract/src/test/atomicity.test.ts) (byte-for-byte unchanged state on failure).
3. **Run** `bun install && bun run compact && bun run test`.
4. **Check the privacy claim** in [`privacy.test.ts`](contract/src/test/privacy.test.ts), which inspects the serialized public state.
5. **Check the evidence** in [`DEPLOYMENT.md`](DEPLOYMENT.md), or run the demo yourself from the end-to-end section: Alice accepted, Alice replay rejected, Bob rejected, public state inspected.

---

## License

Apache-2.0. Wallet and provider wiring in `cli/src/wallet.ts` is adapted from [midnightntwrk/example-counter](https://github.com/midnightntwrk/example-counter).

import { useCallback, useEffect, useState } from 'react';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import {
  type CredentialFile,
  ProofRelief,
  decodeCredential,
  decodeLabel,
  previewEligibility,
} from '@proof-relief/contract';
import { config } from './config';
import { type ClaimResult, campaignKey, connectWallet, fetchLedger, submitClaim } from './midnight';

type Screen = 'campaign' | 'beneficiary';

const formatNumber = (value: bigint) => Number(value).toLocaleString('en-US');

const useCampaign = () => {
  const [ledger, setLedger] = useState<ProofRelief.Ledger | null>(null);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      setLedger(await fetchLedger());
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const campaign = ledger?.campaigns.member(campaignKey()) ? ledger.campaigns.lookup(campaignKey()) : undefined;
  return { ledger, campaign, error, refresh };
};

export const App = () => {
  const [screen, setScreen] = useState<Screen>('campaign');
  const { ledger, campaign, error, refresh } = useCampaign();

  return (
    <div className="mx-auto max-w-5xl px-5 pt-8 pb-24">
      <header className="mb-12 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl text-accent" aria-hidden>
            ◆
          </span>
          <div className="flex flex-col leading-tight">
            <strong className="text-lg tracking-tight">ProofRelief</strong>
            <span className="text-sm text-muted">Private aid claims on Midnight · {config.networkId}</span>
          </div>
        </div>
        <nav className="card flex gap-1 p-1" role="tablist">
          {(['campaign', 'beneficiary'] as const).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={screen === tab}
              onClick={() => setScreen(tab)}
              className={`rounded-xl px-5 py-2 text-sm transition-colors ${
                screen === tab ? 'bg-accent text-white' : 'text-muted hover:text-ink'
              }`}
            >
              {tab === 'campaign' ? 'Campaign' : 'Beneficiary'}
            </button>
          ))}
        </nav>
      </header>

      {error && <Notice tone="fail">Could not read public state: {error}</Notice>}

      {screen === 'campaign' ? (
        <CampaignScreen ledger={ledger} campaign={campaign} />
      ) : (
        <BeneficiaryScreen campaign={campaign} onClaimed={refresh} />
      )}
    </div>
  );
};

const Notice: React.FC<{ tone: 'fail' | 'accent'; children: React.ReactNode }> = ({ tone, children }) => (
  <p
    className={`card mb-6 border-l-4 px-4 py-3 text-sm ${tone === 'fail' ? 'border-l-fail' : 'border-l-accent'}`}
  >
    {children}
  </p>
);

const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mb-2 text-xs font-semibold tracking-[0.18em] text-muted uppercase">{children}</p>
);

const CampaignScreen = ({
  ledger,
  campaign,
}: {
  ledger: ProofRelief.Ledger | null;
  campaign?: ProofRelief.Campaign;
}) => (
  <main className="grid gap-4 md:grid-cols-3">
    <section className="card p-8 md:col-span-2">
      <Eyebrow>{campaign ? (campaign.active ? 'Active campaign' : 'Closed campaign') : 'Campaign'}</Eyebrow>
      <h1 className="display mb-8 text-4xl">{config.campaignName}</h1>
      {campaign ? (
        <dl className="grid gap-3 sm:grid-cols-3">
          {[
            ['Required region', decodeLabel(campaign.requiredRegion)],
            ['Income limit', formatNumber(campaign.maxIncome)],
            ['Minimum household', formatNumber(campaign.minHouseholdSize)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-hairline px-4 py-3">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-1 text-xl font-semibold tracking-tight">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-muted">Waiting for campaign state from the indexer…</p>
      )}
    </section>

    <section className="card flex flex-col justify-center p-8">
      <Eyebrow>Verified claims</Eyebrow>
      <p className="display bg-gradient-to-br from-accent to-accent-soft bg-clip-text text-7xl text-transparent">
        {campaign ? formatNumber(campaign.claimCount) : '–'}
      </p>
      <p className="mt-3 text-sm text-muted">Each claim consumed one unlinkable nullifier on-chain.</p>
    </section>

    <section className="card p-8 md:col-span-3">
      <Eyebrow>Everything the public ledger knows</Eyebrow>
      <ul className="mt-2">
        {[
          ['Consumed nullifiers', ledger ? ledger.consumedNullifiers.size().toString() : '–'],
          ['Approved issuers', ledger ? [...ledger.approvedIssuers].filter(([, ok]) => ok).length.toString() : '–'],
          ['Issued credential commitments', ledger ? ledger.credentials.firstFree().toString() : '–'],
        ].map(([label, value]) => (
          <li key={label} className="flex items-center justify-between border-b border-hairline py-3 last:border-0">
            <span>{label}</span>
            <span className="font-mono text-base font-semibold">{value}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-muted">
        No names, incomes, household sizes, holder secrets or reusable IDs are stored. Contract{' '}
        <code className="font-mono text-xs break-all text-muted">{config.contractAddress}</code>
      </p>
    </section>
  </main>
);

type ClaimState =
  | { status: 'idle' }
  | { status: 'proving' }
  | { status: 'done'; result: ClaimResult }
  | { status: 'rejected'; reason: string };

const BeneficiaryScreen = ({
  campaign,
  onClaimed,
}: {
  campaign?: ProofRelief.Campaign;
  onClaimed: () => void;
}) => {
  const [credential, setCredential] = useState<ProofRelief.Credential>();
  const [fileError, setFileError] = useState<string>();
  const [wallet, setWallet] = useState<ConnectedAPI>();
  const [claim, setClaim] = useState<ClaimState>({ status: 'idle' });

  const loadFile = async (file?: File) => {
    if (!file) return;
    try {
      setCredential(decodeCredential(JSON.parse(await file.text()) as CredentialFile));
      setFileError(undefined);
      setClaim({ status: 'idle' });
    } catch {
      setCredential(undefined);
      setFileError('This file is not a valid ProofRelief credential.');
    }
  };

  const prove = async () => {
    if (!credential) return;
    setClaim({ status: 'proving' });
    try {
      const connected = wallet ?? (await connectWallet());
      setWallet(connected);
      const result = await submitClaim(connected, credential);
      setClaim({ status: 'done', result });
      onClaimed();
    } catch (e) {
      setClaim({ status: 'rejected', reason: e instanceof Error ? e.message : String(e) });
    }
  };

  const checks = credential && campaign ? previewEligibility(credential, campaign) : undefined;
  const qualifies = checks && checks.region && checks.income && checks.household;

  return (
    <main className="grid gap-4">
      <section className="card p-8">
        <Eyebrow>Beneficiary</Eyebrow>
        <h1 className="display text-4xl">{credential ? 'Credential loaded' : 'Load your credential'}</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Your credential file stays in this browser tab. Only a zero-knowledge proof and a campaign nullifier leave
          your device.
        </p>

        <label className="mt-6 inline-block cursor-pointer rounded-xl border border-dashed border-accent px-5 py-3 text-sm text-accent transition-colors hover:bg-accent/10">
          <input
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => void loadFile(e.target.files?.[0])}
          />
          {credential ? 'Choose a different credential' : 'Choose credential file'}
        </label>
        {fileError && (
          <div className="mt-4">
            <Notice tone="fail">{fileError}</Notice>
          </div>
        )}

        {checks && (
          <ul className="mt-6">
            <Check ok={checks.region} label="Region requirement" />
            <Check ok={checks.income} label="Income threshold" />
            <Check ok={checks.household} label="Household requirement" />
          </ul>
        )}

        <button
          className="mt-8 w-full rounded-xl bg-gradient-to-r from-accent to-accent-soft py-4 font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!credential || !campaign || claim.status === 'proving'}
          onClick={() => void prove()}
        >
          {claim.status === 'proving' ? 'Generating private proof…' : 'Generate Private Proof'}
        </button>
        {checks && !qualifies && (
          <p className="mt-3 text-sm text-muted">
            This preview says the credential does not qualify. You can still submit: the contract will reject the
            proof.
          </p>
        )}
      </section>

      {claim.status === 'done' && (
        <section className="card border-l-4 border-l-pass p-8">
          <ul>
            <Check ok label="Eligibility verified" />
            <Check ok label="Claim recorded" />
            <Check ok label="Sensitive data remained private" />
          </ul>
          <p className="mt-4 text-sm text-muted">
            Transaction <code className="font-mono text-xs break-all">{claim.result.txHash}</code> in block{' '}
            {claim.result.blockHeight}
          </p>
        </section>
      )}
      {claim.status === 'rejected' && (
        <section className="card border-l-4 border-l-fail p-8">
          <Eyebrow>Claim rejected</Eyebrow>
          <p>{claim.reason}</p>
          <p className="mt-3 text-sm text-muted">
            No nullifier was consumed and the claim count did not change.
          </p>
        </section>
      )}
    </main>
  );
};

const Check: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
  <li className="flex items-center justify-between border-b border-hairline py-3 last:border-0">
    <span className="font-medium">{label}</span>
    <span className={ok ? 'text-pass' : 'text-fail'} aria-label={ok ? 'passes' : 'fails'}>
      {ok ? '✓' : '✗'}
    </span>
  </li>
);

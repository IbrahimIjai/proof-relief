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
    <div className="shell">
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden>◆</span>
          <div>
            <strong>ProofRelief</strong>
            <span className="muted">Private aid claims on Midnight · {config.networkId}</span>
          </div>
        </div>
        <nav className="tabs" role="tablist">
          {(['campaign', 'beneficiary'] as const).map((tab) => (
            <button key={tab} role="tab" aria-selected={screen === tab} onClick={() => setScreen(tab)}>
              {tab === 'campaign' ? 'Campaign' : 'Beneficiary'}
            </button>
          ))}
        </nav>
      </header>

      {!config.contractAddress && (
        <p className="notice">Set VITE_CONTRACT_ADDRESS in interface/.env.local to point at a deployed contract.</p>
      )}
      {error && <p className="notice error">Could not read public state: {error}</p>}

      {screen === 'campaign' ? (
        <CampaignScreen ledger={ledger} campaign={campaign} />
      ) : (
        <BeneficiaryScreen campaign={campaign} onClaimed={refresh} />
      )}
    </div>
  );
};

const CampaignScreen = ({ ledger, campaign }: { ledger: ProofRelief.Ledger | null; campaign?: ProofRelief.Campaign }) => (
  <main className="grid">
    <section className="card">
      <p className="eyebrow">{campaign ? (campaign.active ? 'Active campaign' : 'Closed campaign') : 'Campaign'}</p>
      <h1>{config.campaignName}</h1>
      {campaign ? (
        <dl className="rules">
          <div>
            <dt>Required region</dt>
            <dd>{decodeLabel(campaign.requiredRegion)}</dd>
          </div>
          <div>
            <dt>Income limit</dt>
            <dd>{formatNumber(campaign.maxIncome)}</dd>
          </div>
          <div>
            <dt>Minimum household</dt>
            <dd>{formatNumber(campaign.minHouseholdSize)}</dd>
          </div>
        </dl>
      ) : (
        <p className="muted">Waiting for campaign state from the indexer…</p>
      )}
    </section>

    <section className="card stat">
      <p className="eyebrow">Verified claims</p>
      <p className="big">{campaign ? formatNumber(campaign.claimCount) : '–'}</p>
      <p className="muted">Each claim consumed one unlinkable nullifier on-chain.</p>
    </section>

    <section className="card wide">
      <p className="eyebrow">Everything the public ledger knows</p>
      <ul className="facts">
        <li>
          <span>Consumed nullifiers</span>
          <code>{ledger ? ledger.consumedNullifiers.size().toString() : '–'}</code>
        </li>
        <li>
          <span>Approved issuers</span>
          <code>{ledger ? [...ledger.approvedIssuers].filter(([, ok]) => ok).length : '–'}</code>
        </li>
        <li>
          <span>Issued credential commitments</span>
          <code>{ledger ? ledger.credentials.firstFree().toString() : '–'}</code>
        </li>
      </ul>
      <p className="muted small">
        No names, incomes, household sizes, holder secrets or reusable IDs are stored. Contract{' '}
        <code>{config.contractAddress || 'not configured'}</code>
      </p>
    </section>
  </main>
);

type ClaimState =
  | { status: 'idle' }
  | { status: 'proving' }
  | { status: 'done'; result: ClaimResult }
  | { status: 'rejected'; reason: string };

const BeneficiaryScreen = ({ campaign, onClaimed }: { campaign?: ProofRelief.Campaign; onClaimed: () => void }) => {
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

  return (
    <main className="grid">
      <section className="card wide">
        <p className="eyebrow">Beneficiary</p>
        <h1>{credential ? 'Credential loaded' : 'Load your credential'}</h1>
        <p className="muted">
          Your credential file stays in this browser tab. Only a zero-knowledge proof and a campaign nullifier leave
          your device.
        </p>
        <label className="file">
          <input type="file" accept="application/json" onChange={(e) => void loadFile(e.target.files?.[0])} />
          <span>{credential ? 'Choose a different credential' : 'Choose credential file'}</span>
        </label>
        {fileError && <p className="notice error">{fileError}</p>}

        {checks && (
          <ul className="checks">
            <Check ok={checks.region} label="Region requirement" />
            <Check ok={checks.income} label="Income threshold" />
            <Check ok={checks.household} label="Household requirement" />
          </ul>
        )}

        <button
          className="primary"
          disabled={!credential || !campaign || !config.contractAddress || claim.status === 'proving'}
          onClick={() => void prove()}
        >
          {claim.status === 'proving' ? 'Generating private proof…' : 'Generate Private Proof'}
        </button>
        {checks && !(checks.region && checks.income && checks.household) && (
          <p className="muted small">
            This preview says the credential does not qualify. You can still submit: the contract will reject the proof.
          </p>
        )}
      </section>

      {claim.status === 'done' && (
        <section className="card wide result ok">
          <ul className="checks">
            <Check ok label="Eligibility verified" />
            <Check ok label="Claim recorded" />
            <Check ok label="Sensitive data remained private" />
          </ul>
          <p className="small">
            Transaction <code>{claim.result.txHash}</code> in block {claim.result.blockHeight}
          </p>
        </section>
      )}
      {claim.status === 'rejected' && (
        <section className="card wide result bad">
          <p className="eyebrow">Claim rejected</p>
          <p>{claim.reason}</p>
          <p className="muted small">No nullifier was consumed and the claim count did not change.</p>
        </section>
      )}
    </main>
  );
};

const Check = ({ ok, label }: { ok: boolean; label: string }) => (
  <li className={ok ? 'pass' : 'fail'}>
    <span>{label}</span>
    <span aria-label={ok ? 'passes' : 'fails'}>{ok ? '✓' : '✗'}</span>
  </li>
);

import React from 'react'
import {
  isValidKnownAmount,
  ledgerAmountLabel,
  type LedgerAmount,
  type StudioResourceLedgerSnapshot,
} from '@/lib/studioResourceLedger'

export type StudioDependency = {
  name: string
  state: 'available' | 'unknown' | 'unavailable'
  reason?: string
}

export type StudioEstateShellProps = {
  ledger: StudioResourceLedgerSnapshot
  dependencies: readonly StudioDependency[]
  decision: { outcome: 'NO_ACTION' | 'ABSTAIN'; rationale: string }
}

function AmountCard({ label, amount }: { label: string; amount: LedgerAmount | StudioResourceLedgerSnapshot['charged'] }) {
  return (
    <article className="studio-resource-card" data-resource-state={amount.state}>
      <h3>{label}</h3>
      <p aria-label={`${label}: ${ledgerAmountLabel(amount)}`}>{ledgerAmountLabel(amount)}</p>
      {amount.state === 'known' && isValidKnownAmount(amount) ? <small>
        Evidence source: {amount.evidence.source} · Observed at: {amount.evidence.observedAt} · Window: {amount.evidence.window}
      </small> : null}
      {amount.state === 'unknown' || amount.state === 'unavailable' || amount.state === 'not_applicable'
        ? <small>{amount.reason}</small>
        : null}
    </article>
  )
}

/** Presentation-only shell. It has no data fetching, mutation, or activation control. */
export function StudioEstateShell({ ledger, dependencies, decision }: StudioEstateShellProps) {
  const hasBlockingDependency = dependencies.length === 0 || dependencies.some((dependency) => dependency.state !== 'available')
  const amounts = [ledger.projected, ledger.observed, ledger.charged]
  const hasBlockingAmount = amounts.some((amount) =>
    amount.state === 'unknown'
    || amount.state === 'unavailable'
    || (amount.state === 'known' && !isValidKnownAmount(amount))
  )
  const hasInvalidChargedCurrency = ledger.charged.state === 'known'
    && (typeof ledger.charged.currency !== 'string' || !ledger.charged.currency.trim())
  const mustAbstain = decision.outcome === 'NO_ACTION' && (hasBlockingDependency || hasBlockingAmount || hasInvalidChargedCurrency)
  const outcome = mustAbstain ? 'ABSTAIN' : decision.outcome
  const rationale = mustAbstain
    ? 'Cannot conclude NO_ACTION without complete ledger amounts and dependency evidence that is available.'
    : decision.rationale
  return (
    <section className="studio-estate-shell" aria-labelledby="studio-estate-title" data-activation={ledger.activation}>
      <header>
        <p className="studio-estate-eyebrow">Content Studio · resource view</p>
        <h2 id="studio-estate-title">Estate resource ledger</h2>
        <p>Read-only presentation · activation disabled · {ledger.interfaceVersion}</p>
      </header>

      <div className="studio-resource-grid" aria-label="Resource amounts">
        <AmountCard label="Projected" amount={ledger.projected} />
        <AmountCard label="Observed" amount={ledger.observed} />
        <AmountCard label="Charged" amount={ledger.charged} />
      </div>

      <section aria-labelledby="studio-dependencies-title">
        <h3 id="studio-dependencies-title">Dependencies</h3>
        {dependencies.length === 0
          ? <p>No dependency observations supplied; evidence is incomplete.</p>
          : <ul>{dependencies.map((dependency) => (
            <li key={dependency.name} data-dependency-state={dependency.state}>
              <strong>{dependency.name}</strong>: {dependency.state}
              {dependency.reason ? ` — ${dependency.reason}` : ''}
            </li>
          ))}</ul>}
      </section>

      <aside aria-label="Decision outcome" data-outcome={outcome}>
        <h3>Decision outcome: {outcome}</h3>
        <p>{rationale}</p>
        <p>NO_ACTION requires sufficient evidence that no intervention is warranted. Missing or unavailable dependencies remain ABSTAIN.</p>
      </aside>
    </section>
  )
}

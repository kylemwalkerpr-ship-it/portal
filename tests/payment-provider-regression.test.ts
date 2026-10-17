import fs from 'node:fs'

describe('seeded payment provider regression contract', () => {
  it('keeps NMI enabled and default, with card and vault support seeded', () => {
    const migration = fs.readFileSync('supabase/migrations/20261016000000_pesapal_payment_provider_settings.sql', 'utf8')
    const registry = fs.readFileSync('lib/payments/registry.ts', 'utf8')
    expect(migration).toMatch(/\('nmi', true, false, 10, true\)/)
    expect(migration).toMatch(/\('nmi', 'card', true, array\['USD'\]/)
    expect(registry).toMatch(/provider: 'nmi'[\s\S]*?supportsVault: true/)
  })

  it('keeps saved-card checkout pinned to the gateway that stored the card', () => {
    const catalogue = fs.readFileSync('app/api/payments/charge/route.ts', 'utf8')
    const order = fs.readFileSync('app/api/checkout/order/route.ts', 'utf8')
    const topup = fs.readFileSync('app/api/wallet/topup/route.ts', 'utf8')
    const mobile = fs.readFileSync('app/api/mobile/checkout/order/route.ts', 'utf8')
    expect(catalogue).toMatch(/chargeGateway = \(cardRow\.gateway \|\| chargeGateway\)\.toLowerCase\(\)/)
    expect(order).toMatch(/getPaymentProvider\(cardRow\.gateway\)/)
    expect(topup).toMatch(/getPaymentProvider\(cardRow\.gateway\)/)
    expect(catalogue).toMatch(/provider\.chargeVaulted\(/)
    expect(order).toMatch(/provider\.chargeVaulted\(/)
    expect(topup).toMatch(/provider\.chargeVaulted\(/)
    expect(mobile).toMatch(/selectedMethodKey = `\$\{String\(cardRow\.gateway \|\| ''\)\.toLowerCase\(\)\}:card`/)
    expect(mobile).toMatch(/body\.gateway = preflight\.gateway/)
  })

  it('keeps current new-card and wallet charging paths present', () => {
    const catalogue = fs.readFileSync('app/api/payments/charge/route.ts', 'utf8')
    const order = fs.readFileSync('app/api/checkout/order/route.ts', 'utf8')
    const topup = fs.readFileSync('app/api/wallet/topup/route.ts', 'utf8')
    expect(catalogue).toMatch(/provider\.charge\(/)
    expect(order).toMatch(/provider\.charge\(/)
    expect(order).toMatch(/debit\(/)
    expect(topup).toMatch(/provider\.charge\(/)
    expect(topup).toMatch(/credit\(/)
  })
})

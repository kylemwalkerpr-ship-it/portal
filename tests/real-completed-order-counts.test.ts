/**
 * "N completed orders" on seller cards / gig pages (migration 20261002105000).
 *
 * gigs.order_count used to be a stored counter bumped at checkout, so cancelled
 * orders and owner test purchases showed up as "completed orders". The column
 * is now derived in the database from real completed orders only. Every reader
 * (gig page, seller cards, seller profile, trust bar, rank) keeps reading the
 * same column, so the truth is enforced in one place.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const sql = read('supabase/migrations/20261002105000_real_completed_order_counts.sql')
const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
const block = (startMarker: string) => {
  const start = code.indexOf(startMarker)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = code.indexOf('$$;', code.indexOf('$$', start) + 2)
  return code.slice(start, end)
}

describe('real completed order counts', () => {
  const counter = block('create or replace function public.real_completed_order_count(')

  test('orders can be attributed to a gig (checkout already sends gig_id)', () => {
    expect(code).toMatch(/alter table public\.orders add column if not exists gig_id uuid;/)
    // No FK: the checkout insert must never fail on the new column.
    expect(code).not.toMatch(/gig_id uuid\s+references/i)
    expect(read('lib/checkoutOrders.ts')).toMatch(/gig_id: item\.gigId \|\| null/)
  })

  test('only successful terminal statuses count; cancelled and refunded do not', () => {
    expect(counter).toContain("o.status in ('completed', 'released')")
    expect(counter).not.toMatch(/'cancelled'|'pending'|'in_progress'|'created'/)
    expect(counter).toContain('coalesce(o.refunded_amount, 0) = 0')
    expect(counter).toContain("coalesce(o.refund_status, '') not in ('succeeded', 'refunded')")
  })

  test('owner, staff and flagged test buyers are excluded', () => {
    expect(counter).toContain('o.client_id <> g.provider_id')
    expect(counter).toContain('coalesce(b.is_test_account, false) = false')
    expect(counter).toContain("coalesce(b.role, '') not in ('admin', 'support')")
    expect(code).toMatch(/alter table public\.profiles add column if not exists is_test_account boolean not null default false;/)
  })

  test('stored / seeded / checkout-incremented values are overridden by the truth', () => {
    expect(code).toMatch(/before insert or update of order_count on public\.gigs\s+for each row execute function public\.gigs_real_order_count_guard\(\)/)
    const guard = block('create or replace function public.gigs_real_order_count_guard(')
    expect(guard).toContain('new.order_count := coalesce(public.real_completed_order_count(new.id), 0);')
    // Backfill recomputes every gig that currently shows a stored count.
    expect(code).toMatch(/update public\.gigs set order_count = order_count where coalesce\(order_count, 0\) <> 0;/)
  })

  test('order and buyer changes refresh the count without ever blocking the write', () => {
    expect(code).toMatch(/after insert or update or delete on public\.orders\s+for each row execute function public\.orders_refresh_gig_order_count\(\)/)
    expect(code).toMatch(/after update of is_test_account, role on public\.profiles/)
    for (const name of ['gigs_real_order_count_guard', 'refresh_gig_real_order_count', 'orders_refresh_gig_order_count', 'profiles_refresh_gig_order_count']) {
      expect(block(`create or replace function public.${name}(`)).toMatch(/exception when others then\s+raise warning/)
    }
  })

  test('UI hides the figure when there are no real completed orders', () => {
    expect(read('components/marketplace/GigDetailComponents.tsx')).toMatch(/const hasOrders = orderCount > 0/)
    expect(read('components/marketplace/MarketplaceGigTrustBar.tsx')).toContain('{completedOrders > 0 && (')
  })
})

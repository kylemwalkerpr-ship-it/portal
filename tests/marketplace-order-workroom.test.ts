import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Marketplace order workroom', () => {
  const panel = read('components/marketplace/MarketplaceOrdersPanel.tsx')
  const experience = read('components/orders/MarketplaceOrderExperience.tsx')
  const timeline = read('components/orders/OrderActivityTimeline.tsx')
  const dock = read('components/orders/OrderMessengerDock.tsx')
  const activityRoute = read('app/api/orders/[id]/activity/route.ts')
  const studentOrderRoute = read('app/api/student/orders/[id]/route.ts')
  const audit = read('lib/orderActivityAudit.ts')
  const escrow = read('app/api/orders/[id]/escrow/route.ts')
  const consultantAccept = read('app/api/consultant/orders/[id]/accept/route.ts')
  const attorneyComplete = read('app/api/attorney/orders/[id]/complete/route.ts')

  test('wraps client and provider order details in one enhanced Marketplace experience', () => {
    expect(panel).toContain("import MarketplaceOrderExperience from '@/components/orders/MarketplaceOrderExperience'")
    expect(panel).toContain('<MarketplaceOrderExperience role={role} orderId={orderId}>')
    expect(panel).toContain('<StudentOrderDetail orderId={orderId}')
    expect(panel).toContain('<AttorneyOrderDetail orderId={orderId}')
    expect(panel).toContain('<ConsultantOrdersList orderId={orderId}')
  })

  test('replaces only the legacy client Activity shell and fixes Overview Open chat', () => {
    expect(experience).toContain('data-enhanced-activity={clientActivity')
    expect(experience).toContain('.ys-order-detail > .yousafe-mobile-stack')
    expect(experience).toContain('<OrderActivityTimeline orderId={orderId} embedded />')
    expect(experience).toContain("text.includes('open chat')")
    expect(experience).toContain('openOrderMessengerDock(orderId)')
    expect(experience).toContain("'activity' ? 'is-active'")
  })

  test('shows the full order pipeline rather than using chat as workflow history', () => {
    expect(timeline).toContain('Order placed')
    expect(timeline).toContain('Work started')
    expect(timeline).toContain('Delivery submitted')
    expect(timeline).toContain('Review & revisions')
    expect(timeline).toContain('Accepted & released')
    expect(timeline).toContain('Payment protected in escrow')
    expect(timeline).toContain('Scope change requested')
    expect(timeline).toContain('File shared')
    expect(timeline).toContain('Message sent in Messenger')
    expect(timeline).toContain('Open Messenger')
  })

  test('uses one participant-safe feed across workflow, files, money and messages', () => {
    expect(activityRoute).toContain(".from('order_events')")
    expect(activityRoute).toContain(".from('order_status_history')")
    expect(activityRoute).toContain(".from('order_milestones')")
    expect(activityRoute).toContain(".from('order_scope_changes')")
    expect(activityRoute).toContain(".from('order_files')")
    expect(activityRoute).toContain(".from('escrow_events')")
    expect(activityRoute).toContain(".from('conversation_messages')")
    expect(activityRoute).toContain("if (!isClient && !isProvider && role !== 'admin')")
  })

  test('fixes the live empty-activity regression caused by querying nonexistent event columns', () => {
    expect(studentOrderRoute).toContain("select('id, actor_id, actor_role, from_status, to_status, note, created_at')")
    expect(studentOrderRoute).not.toContain("select('id, event_type, from_status, to_status, notes, metadata, actor_id, created_at')")
  })

  test('order Messenger starts on the right and can float or dock left/right', () => {
    expect(dock).toContain("useState<DockMode>('right')")
    expect(dock).toContain("setDock('left')")
    expect(dock).toContain("setDock('float')")
    expect(dock).toContain("setDock('right')")
    expect(dock).toContain('onPointerMove={onPointerMove}')
    expect(dock).toContain('contextKind="order"')
    expect(dock).toContain('presentation="popover"')
    expect(dock).toContain('counterpartProfileId={profileId}')
  })

  test('future order transitions write the same durable audit stream', () => {
    expect(audit).toContain("db.from('order_events').insert")
    expect(audit).toContain("db.from('order_status_history').insert")
    expect(escrow).toContain("toStatus: 'revision_requested'")
    expect(escrow).toContain("toStatus: 'completed'")
    expect(consultantAccept).toContain("toStatus: 'in_progress'")
    expect(attorneyComplete).toContain("toStatus: 'under_review'")
  })
})

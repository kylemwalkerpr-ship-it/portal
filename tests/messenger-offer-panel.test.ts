import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Messenger offer message contract', () => {
  const card = read('components/marketplace/MessageOfferCard.tsx')
  const panel = read('components/messaging/OfferDetailPanel.tsx')
  const offerApi = read('app/api/offers/[id]/route.ts')
  const manualOffers = read('app/api/offers/route.ts')
  const aiOffers = read('lib/messengerAi.ts')
  const orderLinks = read('lib/orderLinks.ts')

  test('manual and AI offers preserve the authoritative provider as sender', () => {
    expect(manualOffers).toContain('sender_id: auth.profileId')
    expect(aiOffers).toContain('sender_id: args.provider.id')
    expect(aiOffers).toContain("type: 'offer'")
    expect(aiOffers).toContain('ref_offer_id: offer.id')
  })

  test('offer cards reserve the sender avatar gutter and lower tail instead of floating', () => {
    expect(card).toContain('ys-offer-card-shell')
    expect(card).toContain('ys-offer-sender-avatar')
    expect(card).toContain('bottom: 1')
    expect(card).toContain("right: -34")
    expect(card).toContain("left: -34")
    expect(card).toContain("right: -8")
    expect(card).toContain("left: -8")
    expect(card).toContain("marginLeft: mine ? 0 : 34")
    expect(card).toContain("marginRight: mine ? 34 : 0")
    expect(card).toContain('sender?.avatar_url')
  })

  test('clicking a non-order offer opens complete docked details with detachable-window support', () => {
    expect(card).toContain('loadOfferDetails')
    expect(card).toContain('setPanelOpen(true)')
    expect(card).toContain('<OfferDetailPanel')
    expect(panel).toContain("position: popupRoot ? 'relative' : 'fixed'")
    expect(panel).toContain("createPortal(panel, document.body)")
    expect(panel).toContain('window.open(')
    expect(panel).toContain('Dock panel back into Messenger')
    expect(panel).toContain('Detach panel into its own window')
    expect(panel).toContain('Commercial terms')
    expect(panel).toContain('Attachments')
    expect(panel).toContain('Linked order')
  })

  test('offer detail API returns participants, gig, attachments and linked order', () => {
    expect(offerApi).toContain(".from('profiles')")
    expect(offerApi).toContain(".from('orders')")
    expect(offerApi).toContain(".eq('offer_id', id)")
    expect(offerApi).toContain(".from('gigs')")
    expect(offerApi).toContain(".from('offer-attachments')")
    expect(offerApi).toContain('createSignedUrl')
    expect(offerApi).toContain('sender: profileMap.get(offer.sender_id)')
    expect(offerApi).toContain('recipient: profileMap.get(offer.recipient_id)')
  })

  test('accepted/paid offers resolve and open the real order across shells', () => {
    expect(card).toContain('offer.order_id || details?.order?.id')
    expect(card).toContain("offer.status === 'accepted'")
    expect(card).toContain("offer.status === 'paid'")
    expect(card).toContain('fresh?.order?.id')
    expect(card).toContain('openOrder(fresh.order.id)')
    expect(panel).toContain('openOrderInApp(order.id)')
    expect(orderLinks).toContain("new CustomEvent('yousafe-open-order'")
    expect(orderLinks).toContain("new CustomEvent('yousafe-navigate'")
  })
})

import { getBuyerMethodLabel } from '@/lib/payments/registry'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

describe('buyer checkout copy', () => {
  it('uses clean YouSafe labels for buyer payment methods', () => {
    const labels = [
      getBuyerMethodLabel('pesapal', 'card', 'Pesapal Card'),
      getBuyerMethodLabel('nmi', 'card', 'NMI Card'),
      getBuyerMethodLabel('legacy', 'other', 'Payhip'),
    ]
    expect(labels.join(' ')).not.toMatch(/pesapal|\bnmi\b|payhip/i)
    expect(labels).toEqual(['Card payment', 'Card payment', 'YouSafe'])
  })

  it('keeps hosted checkout chrome YouSafe branded', () => {
    const files = [
      'components/checkout/Checkout.tsx',
      'components/checkout/CardBrandIcons.tsx',
      'components/payments/CardFields.tsx',
      'components/messaging/OfferPaymentModal.tsx',
      'components/marketplace/GigDetailPage.tsx',
      'app/marketplace/cart/page.tsx',
      'components/design/student.jsx',
      'app/checkout/return/page.tsx',
      'app/checkout/return/status.tsx',
    ]
    const buyerCopy = files.map((file) => {
      const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
      const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.JSX
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind)
      const copy: string[] = []
      const visit = (node: ts.Node) => {
        if (ts.isJsxText(node)) copy.push(node.getText(ast))
        if (ts.isJsxAttribute(node) && ['aria-label', 'title', 'alt', 'href'].includes(node.name.getText(ast)) && node.initializer && ts.isStringLiteral(node.initializer)) copy.push(node.initializer.text)
        ts.forEachChild(node, visit)
      }
      visit(ast)
      return copy.join(' ')
    }).join(' ')
    expect(buyerCopy).toMatch(/Secured by YouSafe/i)
    expect(buyerCopy).not.toMatch(/pesapal|\bnmi\b|payhip/i)
    const checkout = fs.readFileSync(path.join(process.cwd(), 'components/checkout/Checkout.tsx'), 'utf8')
    const hostedChrome = checkout.slice(checkout.indexOf('const hostedPayment ='), checkout.indexOf('return (\n    <>', checkout.indexOf('const hostedPayment =')))
    expect(hostedChrome).toContain('Complete your payment')
    expect(hostedChrome).toContain('Secure card payment')
    expect(hostedChrome).not.toMatch(/Securely processed by PesaPal|Loading PesaPal|title="PesaPal/i)
    expect(hostedChrome).toContain('target="_top"')
    expect(checkout).toContain('Secured by YouSafe')
  })

  it('keeps the embedded return frame-buster and hosted sheet sizing rules', () => {
    const status = fs.readFileSync(path.join(process.cwd(), 'app/checkout/return/status.tsx'), 'utf8')
    expect(status).toContain('window.top !== window.self')
    expect(status).toContain('window.top.location.href = window.location.href')
    expect(status).toContain('Finishing your payment…')
    const css = fs.readFileSync(path.join(process.cwd(), 'components/checkout/checkout.module.css'), 'utf8')
    expect(css).toContain('width:min(100%,500px)')
    expect(css).toContain('@media(max-width:560px)')
    expect(css).toContain('.sheetBackdrop { inset:0; padding:0; }')
    expect(css).toContain('height:100dvh')
  })
})

describe('embedded payment sheet layering', () => {
  const fs = require('fs') as typeof import('fs')
  it('portals the payment sheet to body and hides floating chat UI while checkout is open', () => {
    expect(fs.readFileSync('components/checkout/Checkout.tsx', 'utf8')).toContain('createPortal(hostedPayment, document.body)')
    expect(fs.readFileSync('app/globals.css', 'utf8')).toContain('body[data-checkout-open] .ysa-launcher')
  })
})

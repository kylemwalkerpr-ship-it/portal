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

  it('keeps provider names out of buyer-rendered copy and accessibility labels', () => {
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
    expect(buyerCopy).not.toMatch(/pesapal|\bnmi\b|payhip/i)
  })
})

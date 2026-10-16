import PesapalReturnStatus from './status'

export default async function PesapalReturnPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value
  return <PesapalReturnStatus
    trackingId={first(params.OrderTrackingId) || first(params.trackingId) || ''}
    merchantReference={first(params.OrderMerchantReference) || first(params.merchantReference) || ''}
    cancelled={first(params.cancelled) === '1'}
  />
}

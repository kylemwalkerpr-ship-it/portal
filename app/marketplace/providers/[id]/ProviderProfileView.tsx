import Image from 'next/image'
import Link from 'next/link'

export function ProviderProfileView({
  provider,
  role,
}: {
  provider: any
  role: 'attorney' | 'consultant' | null
}) {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-start gap-6 mb-8">
        {provider.headshot_url ? (
          <Image
            src={provider.headshot_url}
            alt={provider.full_name}
            width={96}
            height={96}
            className="rounded-full object-cover"
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center text-2xl font-bold text-gray-500">
            {provider.full_name?.[0] || '?'}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold">{provider.full_name}</h1>
          {provider.tagline && <p className="text-gray-600 mt-1">{provider.tagline}</p>}
          {provider.rating_avg !== null && (
            <p className="text-sm text-gray-500 mt-1">
              ★ {provider.rating_avg} ({provider.rating_count} review{provider.rating_count === 1 ? '' : 's'})
            </p>
          )}
          <span className="inline-block mt-2 px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-700 capitalize">
            {role}
          </span>
        </div>
      </div>

      {provider.bio && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-2">About</h2>
          <p className="text-gray-700 whitespace-pre-line">{provider.bio}</p>
        </section>
      )}

      {provider.gigs && provider.gigs.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Services</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {provider.gigs.map((gig: any) => (
              <Link
                key={gig.id}
                href={`/marketplace/gigs/${gig.slug || gig.id}`}
                className="block border rounded-lg p-4 hover:shadow transition"
              >
                <h3 className="font-medium">{gig.title}</h3>
                {gig.starting_price !== undefined && (
                  <p className="text-sm text-gray-500 mt-1">From ${gig.starting_price}</p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

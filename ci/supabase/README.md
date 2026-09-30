# Isolated service-role integration stack

This fixture pins the Supabase CLI version, the API/database ports, and the
Postgres major version. CI also pins the GitHub Actions used by this job to
full commit SHAs and fixes the Node and runner version labels.

The CLI owns the local stack's service image tags. Supabase's supported
`config.toml` exposes `db.major_version`, but does not expose image digest
overrides for each service. As a result, the CLI version and Postgres major
are reproducible inputs, while the upstream Docker image tags/digests and the
hosted `ubuntu-24.04` runner image remain externally managed. Pinning the CLI
is the narrowest supported way to stabilize the stack image selection without
maintaining a fork of the Supabase stack.

The Auth JWT signing secret is generated with cryptographic randomness for
each CI run, supplied to the local CLI through `SUPABASE_AUTH_JWT_SECRET`, and
never emitted in workflow logs. It is not a production credential.

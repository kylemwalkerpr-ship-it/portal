/**
 * Ambient type declarations for Cloudflare Workers bindings.
 *
 * These bindings are injected at runtime by the Workers runtime and are NOT
 * part of the Node.js / Next.js environment. The OpenNext adapter bridges
 * them onto `process.env` so they are accessible from server-side code, but
 * TypeScript needs explicit type declarations to avoid compilation errors.
 *
 * The KVNamespace interface here is a minimal subset of the Workers KV API
 * — only the methods this project actually uses. If you need more methods,
 * install @cloudflare/workers-types and reference it from tsconfig.json.
 */

declare global {
  /** Minimal KV namespace interface matching Cloudflare Workers KV API. */
  interface KVNamespace {
    get<T = unknown>(key: string, type: 'json'): Promise<T | null>
    get(key: string, type?: 'text'): Promise<string | null>
    put(key: string, value: string | ReadableStream | ArrayBuffer | FormData, options?: { expirationTtl?: number }): Promise<void>
    delete(key: string): Promise<void>
  }

  /** KV namespace for page-level data caching (configured in wrangler.toml). */
  const PAGE_CACHE: KVNamespace | undefined

  interface CloudflareEnv {
    /** KV namespace for page-level data caching. */
    PAGE_CACHE: KVNamespace

    /** Content assets directory binding. */
    ASSETS: Fetcher

    // Environment variables (defined in wrangler.toml [vars])
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: string
    NEXT_PUBLIC_CLERK_JS_VERSION: string
    CLERK_AUTHORIZED_PARTIES: string
    NEXT_PUBLIC_SUPABASE_URL: string
    NEXT_PUBLIC_SUPABASE_ANON_KEY: string
    NEXT_PUBLIC_GA_MEASUREMENT_ID: string
    PAYMENT_PROVIDER: string
    NMI_TOKENIZATION_KEY: string
    NMI_GATEWAY_HOST: string
    NMI_COLLECT_VARIANT: string
    AUTHORIZENET_PUBLIC_CLIENT_KEY: string
    AUTHORIZENET_ENVIRONMENT: string
    AUTHORIZENET_ACCEPT_VARIANT: string

    // Worker secrets (set with `wrangler secret put`)
    CLERK_SECRET_KEY: string
    SUPABASE_SERVICE_ROLE_KEY: string
    NMI_SECURITY_KEY: string
    AUTHORIZENET_LOGIN_ID: string
    AUTHORIZENET_TRANSACTION_KEY: string
    AUTHORIZENET_SIGNATURE_KEY: string
    RESEND_API_KEY: string

    // Backlink provider (DataForSEO Backlinks API — HTTP Basic auth)
    DATAFORSEO_LOGIN: string
    DATAFORSEO_PASSWORD: string

    // AIHubmix OpenAI-compatible aggregator — GLM 5.2 Fast (glm-5.2-fast-preview)
    AIHUBMIX_API_KEY: string
    AIHUBMIX_BASE_URL: string
    AIHUBMIX_GLM_MODEL: string

    // Parasail OpenAI-compatible serverless (api.parasail.io) — psk- keys
    PARASAIL_API_KEY: string
    PARASAIL_BASE_URL: string
    PARASAIL_DEEPSEEK_MODEL: string
    PARASAIL_DEEPSEEK_PRO_MODEL: string
    PARASAIL_PRO_REASONING_EFFORT: string
    PARASAIL_GLM_MODEL: string

    RUNBIOS_API_KEY: string
    RUNBIOS_BASE_URL: string
    RUNBIOS_GLM_MODEL: string
  }
}

export {}

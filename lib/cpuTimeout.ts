/**
 * Shared regex for detecting Cloudflare CPU timeout / budget-exceeded errors.
 *
 * Cloudflare Workers terminate requests that exceed the CPU time limit (default
 * 10ms on free plans, 50ms on paid). When the worker is killed, the runtime
 * throws an error whose message typically contains one of these keywords:
 *
 *   CPU  - "CPU time limit exceeded"
 *   timeout - generic timeout
 *   abort - "Script aborted"
 *   budget - "CPU budget exceeded"
 *   exceeded - "CPU time limit exceeded"
 *   terminated - "Script terminated"
 *
 * Every handler that performs async I/O (DB queries, external API calls, heavy
 * JS processing) should use this regex in its catch block to return a clean
 * 503 JSON response instead of letting the raw Cloudflare error surface.
 */
export const CPU_TIMEOUT_REGEX = /CPU|timeout|abort|budget|exceeded|terminated/i

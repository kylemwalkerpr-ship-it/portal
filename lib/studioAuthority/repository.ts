import {
  COMMAND_AUTHORITY_UNAVAILABLE,
  decodeCommandAuthorityObservation,
  type CommandAuthorityObservation,
} from './contracts'

export type CommandAuthorityRepositoryResult = {
  kind: 'provider_unavailable'
  observation: typeof COMMAND_AUTHORITY_UNAVAILABLE
}

export interface CommandAuthorityRepository {
  resolveCurrentCommandAuthority(input: unknown): Promise<CommandAuthorityRepositoryResult>
}

/**
 * Deny-only application seam. It never reads environment, opens a service client,
 * invokes SQL, or converts an observed row into application authority.
 */
export function createInactiveCommandAuthorityRepository(): CommandAuthorityRepository {
  return Object.freeze({
    async resolveCurrentCommandAuthority(_input: unknown): Promise<CommandAuthorityRepositoryResult> {
      return { kind: 'provider_unavailable', observation: COMMAND_AUTHORITY_UNAVAILABLE }
    },
  })
}

/** A validated row remains an observation; no verified-authority token is exported. */
export function decodeUntrustedAuthorityObservation(
  input: unknown,
): { kind: 'untrusted_observation'; observation: CommandAuthorityObservation | null } {
  const decoded = decodeCommandAuthorityObservation(input)
  return {
    kind: 'untrusted_observation',
    observation: decoded.ok ? decoded.observation : null,
  }
}

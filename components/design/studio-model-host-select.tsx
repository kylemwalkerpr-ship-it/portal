'use client'

import * as React from 'react'
import {
  hostsForModel,
  modelPickerLabel,
  modelsForLane,
  parseStudioPin,
  pinFor,
  type StudioLane,
  type StudioModelId,
  type StudioHostId,
} from '@/lib/contentAiCatalog'

/**
 * The single Content Studio model × host picker.
 *
 * Exactly two commissioned choices are offered in every lane. A saved legacy
 * pin is an explicit "Reselect provider" state — no preselected Grok and no
 * hidden default; the two commissioned choices stay available until one is
 * picked.
 */
export function StudioModelHostSelect(props: {
  lane: StudioLane
  pin: string
  onPinChange: (pin: string) => void
  disabled?: boolean
  selectStyle?: React.CSSProperties
  configuredPins?: Set<string>
  modelAriaLabel?: string
  hostAriaLabel?: string
  layout?: 'row' | 'stack'
}) {
  const models = modelsForLane(props.lane)
  const parsed = parseStudioPin(props.pin)
  const legacyValue = parsed.kind === 'needs_selection' ? parsed.legacyValue : ''
  const selectedModel = parsed.kind === 'commissioned' && models.some((m) => m.id === parsed.model.id)
    ? parsed.model.id
    : models[0]?.id
  const hosts = selectedModel ? hostsForModel(selectedModel, props.lane) : []
  const hostId = parsed.kind === 'commissioned' && hosts.some((h) => h.id === parsed.host.id)
    ? parsed.host.id
    : hosts[0]?.id
  const showHost = hosts.length > 1

  const mark = (pin: string, label: string) => {
    if (!props.configuredPins) return label
    if (pin === 'auto') return label
    return props.configuredPins.has(pin) ? label : `${label} (not configured)`
  }

  const wrap: React.CSSProperties =
    props.layout === 'stack'
      ? { display: 'grid', gap: 6 }
      : { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }

  return (
    <div style={wrap}>
      <select
        value={legacyValue ? '' : (selectedModel as StudioModelId | undefined) || ''}
        disabled={props.disabled}
        aria-label={props.modelAriaLabel || 'AI model'}
        onChange={(e) => {
          const nextModel = e.target.value as StudioModelId
          const nextHosts = hostsForModel(nextModel, props.lane)
          const keep = nextHosts.some((h) => h.id === hostId) ? hostId : nextHosts[0]?.id
          if (nextModel && keep) props.onPinChange(pinFor(nextModel, keep))
        }}
        style={props.selectStyle}
      >
        {legacyValue ? (
          <option value="" disabled>
            {`⚠ Reselect provider — saved pin "${legacyValue}" is retired`}
          </option>
        ) : null}
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {modelPickerLabel(m, props.lane)}
          </option>
        ))}
      </select>
      {showHost ? (
        <select
          value={hostId}
          disabled={props.disabled}
          aria-label={props.hostAriaLabel || 'AI provider'}
          onChange={(e) => {
            if (selectedModel) props.onPinChange(pinFor(selectedModel as StudioModelId, e.target.value as StudioHostId))
          }}
          style={props.selectStyle}
        >
          {hosts.map((h) => (
            <option key={h.id} value={h.id}>
              {mark(h.pin, h.label)}
            </option>
          ))}
        </select>
      ) : !legacyValue && hosts[0] ? (
        <span style={{ fontSize: 10, opacity: 0.7, whiteSpace: 'nowrap' }}>{hosts[0].label}</span>
      ) : null}
    </div>
  )
}

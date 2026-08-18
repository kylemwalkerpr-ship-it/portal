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
  const modelId = (models.some((m) => m.id === parsed.model.id) ? parsed.model.id : models[0]?.id) as StudioModelId
  const hosts = models.find((m) => m.id === modelId)?.hosts ?? []
  const hostId = (hosts.some((h) => h.id === parsed.host.id) ? parsed.host.id : hosts[0]?.id) as StudioHostId
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
        value={modelId}
        disabled={props.disabled}
        aria-label={props.modelAriaLabel || 'AI model'}
        onChange={(e) => {
          const nextModel = e.target.value as StudioModelId
          const nextHosts = hostsForModel(nextModel)
          const keep = nextHosts.some((h) => h.id === hostId) ? hostId : nextHosts[0]?.id
          props.onPinChange(pinFor(nextModel, keep || 'auto'))
        }}
        style={props.selectStyle}
      >
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
          onChange={(e) => props.onPinChange(pinFor(modelId, e.target.value as StudioHostId))}
          style={props.selectStyle}
        >
          {hosts.map((h) => (
            <option key={h.id} value={h.id}>
              {mark(h.pin, h.label)}
            </option>
          ))}
        </select>
      ) : hosts[0] ? (
        <span style={{ fontSize: 10, opacity: 0.7, whiteSpace: 'nowrap' }}>{hosts[0].label}</span>
      ) : null}
    </div>
  )
}

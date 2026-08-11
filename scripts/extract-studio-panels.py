#!/usr/bin/env python3
"""Extract Draft-queue + Review panels out of the Content Studio monolith.

Moves (verbatim, derived from consecutive top-level definitions):
  shared  -> components/design/studio-ui-shared.tsx   (types + helpers + GscMini)
  queue   -> components/design/studio-queue.tsx       (QueueStats + QueueTable)
  review  -> components/design/studio-review-panels.tsx (DefendPanel + ReviewDraftsPanel)
and rewires admin-content-studio.tsx to import them.
"""
import re
import sys

SRC = 'components/design/admin-content-studio.tsx'
lines = open(SRC).read().split('\n')

# scan ALL top-level definitions (these are the exact slice boundaries)
def_re = re.compile(
    r'^(?:export\s+)?(?:(?:async\s+)?function\s+[A-Za-z_][A-Za-z0-9_]*|'
    r'const\s+[A-Za-z_][A-Za-z0-9_]*|'
    r'interface\s+[A-Z][A-Za-z0-9_]*|'
    r'type\s+[A-Z][A-Za-z0-9_]*)'
)
defs = []
for i, l in enumerate(lines, 1):
    m = def_re.match(l)
    if m:
        tok = l.split()[0]
        kind = 'async function' if tok == 'async' else tok
        name_tok = l.split()[1] if kind != 'async function' else l.split()[2]
        nm = re.match(r'[A-Za-z_]\w*', name_tok)
        name = nm.group() if nm else name_tok
        defs.append((i, kind, name))


def slice_block(start: int, end_excl: int):
    """Slice [start-1 .. end_excl-2], absorb preceding section comments, and
    trim trailing blank/comment lines. Returns the exact (start, end) 0-based
    range of the TRIMMED block so deletions never overlap."""
    a = start - 1
    b = end_excl - 1  # exclusive index (end_excl is 1-based line of NEXT def)
    # absorb preceding consecutive blank/comment lines (section dividers)
    a2 = a
    while a2 > 0:
        prev = lines[a2 - 1].strip()
        if prev == '' or prev.startswith('//') or prev.startswith('/*') or prev.startswith('*'):
            a2 -= 1
        else:
            break
    parts = lines[a2:b]
    # trim trailing blank/comment lines that belong to the next section
    while parts and (parts[-1].strip() == '' or parts[-1].strip().startswith('//')):
        parts.pop()
    return a2, a2 + len(parts), '\n'.join(parts) + '\n'


def braces_balance(text: str) -> bool:
    """TSX-aware brace balance. Quote state is reset per line: TS/JSX string
    literals effectively never span lines in this codebase, and JSX-text
    apostrophes would otherwise swallow the rest of the line."""
    depth = 0
    for line in text.split('\n'):
        quote = None
        i = 0
        while i < len(line):
            ch = line[i]
            if quote:
                if ch == '\\':
                    i += 2
                    continue
                if ch == quote:
                    quote = None
            elif ch in ('"', "'", '`'):
                quote = ch
            elif ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth < 0:
                    return False
            i += 1
    return depth == 0


def def_key(start: int):
    return f'{start}:{lines[start-1][:60].strip()}'


# ── extract blocks ──
shared = ['ContentType', 'Tone', 'Region', 'JobStatus', 'ContentJob', 'GscMiniStats',
          'formatDate', 'statusBadge', 'gateBadge', 'CannibalMergeRecord', 'MergeUrlHit',
          'canonicalMergeStem', 'jobWebPath', 'CardHeader', 'inputStyle', 'btnGhost',
          'QUEUE_FILTERS', 'QueueSummary', 'GscMini']
queue = ['QueueStats', 'QueueTable']
review = ['DefendPanel', 'ReviewDraftsPanel']

want = shared + queue + review
by_name = {}
for (ln, kind, name) in defs:
    if name not in want:
        continue
    # find the next definition line AFTER ln
    nxt = min((d[0] for d in defs if d[0] > ln), default=len(lines) + 1)
    a, b, text = slice_block(ln, nxt)
    if not braces_balance(text):
        raise SystemExit(f'UNBALANCED: {name} ({ln}) — aborting')
    parts = text.rstrip('\n').split('\n')
    core = [l for l in parts if l.strip() and not l.strip().startswith(('//', '*', '/*'))]
    if not core:
        raise SystemExit(f'EMPTY CORE for {name}')
    sig = core[0].strip()
    if not sig.startswith(f'{kind} {name}'):
        raise SystemExit(f'BAD SIGNATURE for {name}: {sig!r}')
    if len(core) > 1:
        tail = core[-1].strip()
        if tail not in ('}', '],', ']') and not tail.endswith('}'):
            raise SystemExit(f'BAD TAIL for {name}: {tail!r}')
    by_name[name] = text
    print(f'{name:22} lines {a+1:5}..{b:5}  {len(text.splitlines()):4} lines')

missing = [n for n in want if n not in by_name]
if missing:
    raise SystemExit(f'MISSING: {missing}')

SHARED_HEADER = """'use client'

import React from 'react'
import type { DepthRescueStats } from '@/lib/seoFactory/depthRescue'
import { studioTokens as E } from './studio-tokens'

const C = E

"""
QUEUE_HEADER = """'use client'

import React from 'react'
import { studioTokens as E } from './studio-tokens'
import {
  CardHeader,
  QUEUE_FILTERS,
  btnGhost,
  canonicalMergeStem,
  formatDate,
  gateBadge,
  GscMini,
  inputStyle,
  jobWebPath,
  statusBadge,
  type CannibalMergeRecord,
  type ContentJob,
  type JobStatus,
  type MergeUrlHit,
  type QueueSummary,
} from './studio-ui-shared'

const C = E

"""
REVIEW_HEADER = """'use client'

import React from 'react'
import { studioTokens as E } from './studio-tokens'
import {
  CardHeader,
  formatDate,
  gateBadge,
  statusBadge,
  type ContentJob,
  type JobStatus,
} from './studio-ui-shared'

const C = E

"""

def export_def(text: str) -> str:
    """Prefix the first non-comment line (the definition) with `export `."""
    parts = text.split('\n')
    for i, l in enumerate(parts):
        if l.strip() and not l.strip().startswith(('//', '*', '/*')):
            parts[i] = 'export ' + l
            break
    return '\n'.join(parts)

with open('components/design/studio-ui-shared.tsx', 'w') as f:
    f.write(SHARED_HEADER)
    for name in shared:
        f.write(export_def(by_name[name]) + '\n')

with open('components/design/studio-queue.tsx', 'w') as f:
    f.write(QUEUE_HEADER)
    for name in queue:
        f.write(export_def(by_name[name]) + '\n')

with open('components/design/studio-review-panels.tsx', 'w') as f:
    f.write(REVIEW_HEADER)
    for name in review:
        f.write(export_def(by_name[name]) + '\n')

# ── patch main: delete ranges bottom-up ──
del_ranges = []
for (ln, kind, name) in defs:
    if name not in want:
        continue
    nxt = min((d[0] for d in defs if d[0] > ln), default=len(lines) + 1)
    a, b, _ = slice_block(ln, nxt)
    del_ranges.append((a, b, name))
# assert trimmed ranges are disjoint before mutating
srt = sorted(del_ranges, key=lambda r: r[0])
for i in range(len(srt) - 1):
    if srt[i + 1][0] < srt[i][1]:
        raise SystemExit(
            f'DEL OVERLAP: {srt[i][2]} {srt[i][0]}-{srt[i][1]} vs '
            f'{srt[i + 1][2]} {srt[i + 1][0]}-{srt[i + 1][1]}')
del_ranges.sort(reverse=True)
for a, b, name in del_ranges:
    del lines[a:b]

imports = [
    "import {",
    "  CardHeader,",
    "  QUEUE_FILTERS,",
    "  canonicalMergeStem,",
    "  formatDate,",
    "  gateBadge,",
    "  GscMini,",
    "  jobWebPath,",
    "  statusBadge,",
    "  type CannibalMergeRecord,",
    "  type ContentJob,",
    "  type ContentType,",
    "  type GscMiniStats,",
    "  type JobStatus,",
    "  type MergeUrlHit,",
    "  type QueueSummary,",
    "  type Region,",
    "  type Tone,",
    "  btnGhost,",
    "  inputStyle,",
    "} from './studio-ui-shared'",
    "import { QueueStats, QueueTable } from './studio-queue'",
    "import { DefendPanel, ReviewDraftsPanel } from './studio-review-panels'",
    '',
]
anchor = next(i for i, l in enumerate(lines) if l.strip() == "import { studioTokens as E } from './studio-tokens'")
lines[anchor + 1:anchor + 1] = imports

with open(SRC, 'w') as f:
    f.write('\n'.join(lines))

print(f'\nOK — main shrank by {sum(b - a for a, b, _ in del_ranges)} lines; 3 new files written')

# Content Studio Revamp — Superseded Pointer

**NON-NORMATIVE. DO NOT IMPLEMENT FROM THIS FILE.**

The former CS-2026.09.22.4 master architecture at this path has been superseded by **CS-2026.09.22.5**.

Canonical architecture:

`docs/superpowers/specs/2026-09-22-content-studio-revamp-architecture.md`

The canonical v5 specification uses the approved **Alternative 2 strangler migration**: thin Cloudflare/OpenNext control and read plane, authoritative Supabase/Postgres state, Modal durable compute and artifact storage, Semantic Fabric, bounded Jev decisions, separate release authority, and evidence-gated selective retirement of legacy subsystems.

Historical v4 remains available through Git history. Do not copy schemas, interfaces, gates, semantic definitions, compute classes, or Jev policy from an older revision into implementation packets.

Implementation remains blocked until the canonical v5 A0 exit criteria are satisfied.

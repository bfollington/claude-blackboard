---
description: Synchronize principle docs after type changes
argument-hint: [optional concept name]
---

**Synchronize Principles After Type Changes**

Detect type definition changes and update behavioral principle documentation accordingly.

## Workflow

### 1. Detect Type Changes

Analyze recent changes (git diff, conversation context):

**Look for modifications to:**
- Type definition files (`.ts`, `.rs`, `.sql`, `.clj`)
- Interfaces, structs, enums, schemas
- Function signatures (contracts)

**Classify changes:**
- New type added → May need new principle
- Type structure changed → Update rationale?
- Sum type variant added → New behavioral path?
- Field added/removed → Principle impact?

### 2. Analyze Impact

Launch codebase-researcher subagent to:
- Read affected type definitions
- Read corresponding principle docs
- Identify mismatches or gaps
- Determine if operational principles need updates

### 3. Propose Updates

Use AskUserQuestion to present findings:

```
Type Change Detected: src/domain/Enemy.ts

Change: Added new variant to EnemyBehavior enum
  + | { behavior: 'ambush', hiddenUntil: number }

Impact Analysis:
- Principle doc: principles/gameplay/enemy-ai.md
- Current principles describe: chase, flee, ranged, spawn
- Missing: Ambush behavior principle

Suggestions:
□ Add "Principle: Ambush Behavior" describing when enemies hide and reveal
□ Update state machine diagram
□ Add test scenario for ambush transitions

Proceed with updates?
```

### 4. Update Documentation

Launch plan-implementer subagent to:
- Update affected principle files
- Maintain coherence (rewrite sections, don't append)
- Preserve existing principles
- Add new behavioral scenarios
- Update cross-concept interaction notes if affected

## Important

- Changes to *type structure* don't always require principle updates
- Changes to *type semantics* (what states mean) usually do
- Focus on behavioral implications, not structural mirroring

Additional context: $ARGUMENTS

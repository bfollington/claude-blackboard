---
description: Detect type anti-patterns and suggest improvements
argument-hint: [optional file or concept focus]
---

**Validate Type Patterns**

Analyze type definitions for anti-patterns and suggest improvements toward making illegal states unrepresentable.

## Workflow

### 1. Launch validation subagent

Use Task tool with codebase-researcher to scan type definitions:

**Detection Targets:**

#### Anti-Pattern 1: Optional Field Proliferation
**Pattern:** Multiple optional/nullable fields where only one should be set
**Languages:** TypeScript (`?:`), Rust (`Option<T>`), SQL (`NULL`)

```typescript
// BAD
interface Contact {
  email?: string;
  postal?: string;
  phone?: string;  // Allows ZERO contact methods!
}

// SUGGEST: Discriminated union
type ContactMethod =
  | { type: 'email', value: string }
  | { type: 'postal', value: string }
  | { type: 'phone', value: string };
```

#### Anti-Pattern 2: Boolean Soup
**Pattern:** Multiple boolean flags representing exclusive states
**Languages:** All

```typescript
// BAD
interface Enemy {
  isFleeing: boolean;
  isShooting: boolean;
  isSpawning: boolean;  // Can be fleeing AND shooting? Undefined!
}

// SUGGEST: State machine
type EnemyState =
  | { state: 'fleeing', startedAt: number }
  | { state: 'shooting', cooldown: number }
  | { state: 'spawning', spawnCount: number };
```

#### Anti-Pattern 3: Primitive Obsession
**Pattern:** Raw primitives without validation
**Languages:** All

```typescript
// BAD
function sendEmail(to: string) {
  // Is it validated? Domain rules unclear
}

// SUGGEST: Wrapper type
type Email = string & { __brand: 'Email' };
function createEmail(s: string): Email | null { ... }
function sendEmail(to: Email) { ... }
```

#### Anti-Pattern 4: Unconstrained Numbers
**Pattern:** Numeric fields without bounds
**Languages:** All

```typescript
// BAD
interface Health {
  current: number;  // Can be negative? Greater than max?
}

// SUGGEST: Wrapper with validation
type HealthPoints = number & { __brand: 'HealthPoints' };
function createHealth(current: number, max: number): Health | null {
  if (current < 0 || current > max) return null;
  // ...
}
```

#### Anti-Pattern 5: Stringly-Typed
**Pattern:** String unions without structure
**Languages:** TypeScript, Rust (String enums)

```typescript
// ACCEPTABLE but could be better
type EnemyType = 'chaser' | 'spitter' | 'coward';

// SUGGEST: Sum type with associated data
type EnemyType =
  | { kind: 'chaser', speed: number }
  | { kind: 'spitter', range: number }
  | { kind: 'coward', fleeThreshold: number };
```

### 2. Generate Report

**Structure:**
```markdown
# Type Validation Report

## Summary
- Files scanned: N
- Anti-patterns found: M
- Severity: Critical (X) | Warning (Y) | Info (Z)

## Critical Issues

### [File:Line] - Boolean Soup in GameState
**Current:**
```typescript
interface GameState {
  isPaused: boolean;
  isGameOver: boolean;
}
```

**Problem:** Allows invalid states (both true, both false with specific meaning unclear)

**Suggested Fix:**
```typescript
type GamePhase = 'playing' | 'paused' | 'gameOver';
```

**Rationale:** Makes states explicit and exhaustive

---

## Warnings

[Similar structure for lower-severity issues]

## Info

[Suggestions for improvements, not bugs]
```

### 3. Present to User

Show report with severity levels. Use AskUserQuestion to ask:
- Which issues to fix now?
- Which to defer?
- Which are intentional (document why)?

### 4. Optional: Apply Fixes

If user requests, launch plan-implementer subagent to:
- Refactor types based on selected suggestions
- Update code using the types
- Document intentional deviations

## Language-Specific Detection

**TypeScript:**
- Look for: `interface` with multiple `?:` fields
- Look for: Boolean fields in same interface
- Check: Exhaustiveness in switch statements

**Rust:**
- Look for: `Option<T>` proliferation
- Look for: Boolean fields in structs
- Check: Match exhaustiveness (compiler helps)

**SQL:**
- Look for: Multiple nullable columns (should be check constraint)
- Look for: Missing domain types
- Look for: Weak constraints

**Clojure:**
- Look for: Spec without sum-type equivalent
- Look for: Unvalidated maps

## Important

- This is **suggestion-oriented**, not blocking
- Provide rationale with each suggestion
- Allow "intentional deviation" documentation
- Focus on highest-impact improvements first

Additional context: $ARGUMENTS

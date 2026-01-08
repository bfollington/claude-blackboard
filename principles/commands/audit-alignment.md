---
description: Audit alignment between types, principles, and code
argument-hint: [optional focus area]
---

**Audit Type-Principle-Code Alignment**

Comprehensive check for consistency across type definitions, behavioral principles, and implementation.

## Workflow

### 1. Launch Audit Subagent

Use codebase-researcher to perform analysis:

**Check for:**

#### A. Type Anti-Patterns
- Run `/validate-types` detection logic
- Flag sum type opportunities
- Flag primitive obsession
- Flag boolean soup

#### B. Principle-Type Alignment
- Does each principle doc link to valid type definitions?
- Are type rationales accurate?
- Do operational principles match type capabilities?

#### C. Module Boundary Violations
- Do concepts call other concepts directly? (Should use syncs)
- Are dependencies documented correctly?
- Interface vs implementation separation clear?

#### D. Synchronization Formalization
- Are cross-concept interactions formalized?
- Do sync contracts match actual code?
- Are failure modes handled?

#### E. Missing Documentation
- Types without principle docs?
- Principles without type definitions?
- Synchronizations without contracts?

#### F. Stale Documentation
- Principle docs describing non-existent types?
- Type rationales that don't match current design?
- Outdated operational principles?

### 2. Prioritization

**Critical:**
- Module boundary violations (breaks independence)
- Type anti-patterns allowing invalid states
- Missing synchronization contracts for complex interactions

**Warning:**
- Stale documentation
- Missing principle docs
- Incomplete test coverage

**Info:**
- Opportunities for improvement
- Refactoring suggestions

### 3. Generate Report

```markdown
# Alignment Audit Report

## Executive Summary
- Critical issues: N
- Warnings: M
- Info: K

## Critical Issues

### [src/systems/X.ts:42] - Module Boundary Violation
**Problem:** FlockingSystem directly modifies CombatComponent
**Impact:** Breaks concept independence
**Fix:** Create FormationCombat synchronization

---

## Warnings

### [principles/gameplay/health.md] - Stale Documentation
**Problem:** Principle describes regeneration, but type removed RegenRate field
**Impact:** Misleading documentation
**Fix:** Update or remove regeneration principle

---

## Recommendations

[Prioritized list of improvements]
```

### 4. Propose Remediation

Use AskUserQuestion:
- Which critical issues to fix immediately?
- Which warnings to address?
- Which to defer or document as intentional?

### 5. Execute Fixes

Launch plan-implementer for selected fixes:
- Refactor code for boundary violations
- Update stale documentation
- Create missing syncs
- Document intentional deviations

## Important

- Prioritize recently modified code
- Types are upstream source of truth
- Principles explain behavior and rationale
- Synchronizations formalize interactions

Additional context: $ARGUMENTS

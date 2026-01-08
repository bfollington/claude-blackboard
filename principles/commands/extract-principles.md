---
description: Extract behavioral principles from existing code
argument-hint: [optional focus area or concept]
---

**Extract Operational Principles**

Analyze code to identify behavioral principles and create principle documentation (NOT structural type specs).

## Workflow

### 1. Analyze Codebase

Launch codebase-researcher subagent to:
- Identify concepts (features, domains, modules)
- Locate type definitions (interfaces, enums, structs, schemas)
- Understand behavioral patterns (temporal flows, state machines)
- Focus on area from $ARGUMENTS if provided

**Key:** Extract *behavior*, not structure. Types already document structure.

### 2. Propose Principles

Use AskUserQuestion to present detected patterns:

**For each concept:**
- Name and purpose
- Type definition location (link, don't duplicate)
- Operational principles (behavioral scenarios)
- Cross-concept interactions
- Module boundaries

**Example proposal:**
```
Concept: Health
Types: src/domain/Health.ts (already exists)
Principle: "When damage applied, health decreases. At zero, entity dies and corpse spawns."
Interactions: Health + Combat (damage), Health → Corpse (death)
```

### 3. Generate Documentation

Launch plan-implementer subagent to:
- Create principle files in `principles/[category]/[name].md`
- Follow `principles/TEMPLATE.md` structure
- Link to existing type definitions (don't duplicate)
- Focus on operational principles and rationale
- Update `principles/index.md`

### 4. Generate Visual Map

Create ASCII diagram showing:
```
┌─────────────────────┐
│   Gameplay          │
│  ┌──────────────┐   │       ┌──────────┐
│  │ Health       │───┼──────▶│ Combat   │
│  │ (vitality)   │   │       │ (damage) │
│  └──────────────┘   │       └──────────┘
│         │           │
│         ▼           │
│  ┌──────────────┐   │
│  │ Corpse       │   │
│  │ (remains)    │   │
│  └──────────────┘   │
└─────────────────────┘

Infrastructure Dependencies:
- Pixi.js (rendering)
- ECS (entity management)
```

## Important

- **Don't duplicate type structure** in principles docs
- **Do document** behavior, rationale, interactions
- **Link to** actual type definitions
- **Focus on** what types cannot express

Additional context: $ARGUMENTS

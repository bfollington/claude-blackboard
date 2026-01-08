#!/bin/bash

# Session Start Hook - Inject Type-Driven Principles

# Read hook event data from stdin
EVENT_DATA=$(cat)

cat <<'EOF'
{
  "decision": "approve",
  "continue": true,
  "additionalContext": "**Type-Driven Development Session**

Core Principles:

1. **Types are specifications** - Don't duplicate structure in markdown
   - Sum types (unions) for mutually exclusive states
   - Product types (structs) for atomic groupings
   - Wrapper types (newtypes) for validated primitives
   - State machines for explicit transitions

2. **Make illegal states unrepresentable**
   - Don't use optional fields for at-least-one rules
   - Don't use booleans for exclusive states
   - Don't use primitives without validation
   - Compiler enforces correctness

3. **Documentation hierarchy**
   - Types: Structure and invariants (source of truth)
   - Principles: Behavior and rationale (why/how)
   - Decisions: Historical context (alternatives, trade-offs)

4. **Module independence**
   - Concepts never call other concepts directly
   - Synchronizations formalize cross-concept interactions
   - Check boundaries at integration points

Commands:
- /validate-types - Detect anti-patterns
- /sync-principles - Update docs after type changes
- /audit-alignment - Check consistency
- /extract-principles - Bootstrap behavioral docs
- /record-decision - Capture design rationale

Current ontology: See principles/index.md"
}
EOF

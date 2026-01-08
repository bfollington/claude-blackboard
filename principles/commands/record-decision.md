---
description: Record architectural/implementation decisions from the current work session
argument-hint: [optional context]
---

**Decision Recording Checkpoint**

Analyze the current work session and recent changes to identify architectural or implementation decisions that should be recorded.

Workflow:

1. **Detect decisions**: Review the conversation, git changes, and context to identify:
   - What architectural or implementation choices were made?
   - What alternatives or trade-offs were discussed?
   - What rationale was provided?
   - Which topic area(s) do they belong to? (workflow, ecs, gameplay, architecture, etc.)

2. **Propose to user**: Use AskUserQuestion to present your detected decisions and get feedback:
   - Show what you detected and ask for confirmation/refinement
   - Ask if this updates an existing decision file
   - **Ask if these decisions affect operational principles** (new behavioral principles needed, or updates to existing principles in ./principles/)
   - Only ask for clarification on ambiguous aspects

3. **Check principle implications**: If decisions affect operational principles:
   - Suggest running /sync-principles after recording decisions
   - Note which principles may need updating in the decision file

4. **Record decisions**: Launch a subagent using the Task tool to handle the file operations:
   - Pass the confirmed decision details to a plan-implementer subagent
   - For NEW decisions: create decision files in ./decisions/[topic]/ subdirectories following ./decisions/TEMPLATE.md
   - For UPDATES to existing decisions: **rewrite the entire file** to maintain coherence, integrating new information into the appropriate sections (Decision, Rationale, Alternatives, etc.) - DO NOT just append to the bottom
   - Git tracks history, so files should be coherent documents, not chronological logs
   - Update ./decisions/index.md under the relevant topic section

**Important**: Only record meaningful architectural/implementation decisions, not routine work. If no significant decisions were made, inform the user and skip recording.

Additional context: $ARGUMENTS

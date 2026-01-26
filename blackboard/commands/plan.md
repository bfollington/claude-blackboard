---
description: Guide structured planning with knowns/unknowns analysis
argument-hint: [topic or goal]
allowed-tools: Read, Glob, Grep, Task, AskUserQuestion
---

You are helping the user plan a change or feature. Follow this structured methodology.

## Planning Philosophy: Slow is Smooth, Smooth is Fast

- **One change at a time**: Make deliberate, atomic cuts
- **Foundation first**: Start with types and data structures, build up layers organically
- **Understand checkpoints**: Know what success looks like at each step
- **Be honest**: If a solution doesn't scale or feels wrong, say so early
- **Test as you go**: Each step should be independently verifiable

## Step 1: Explore Knowns and Unknowns (Rumsfeld Matrix)

Before diving into implementation, systematically map the problem space:

### Known Knowns (Established Facts)
- What do we know for certain about this problem?
- What existing code, patterns, or architecture can we leverage?
- What constraints are we working within?
- What tools and libraries are already in use?

**Action**: Use Read, Glob, and Grep to survey the existing codebase. Document what's already there.

### Known Unknowns (Questions to Answer)
- What specific questions do we need to answer before proceeding?
- What research or investigation is required?
- What documentation should we consult?
- What edge cases need clarification?

**Action**: List these questions explicitly. Use Task for open-ended research if needed.

### Unknown Knowns (Assumptions to Validate)
- What are we assuming without evidence?
- What tacit knowledge might we be relying on?
- What "obvious" things should we double-check?
- What conventions are we following - are they still valid here?

**Action**: Challenge your assumptions. Verify them with code inspection or by asking the user.

### Unknown Unknowns (Risks to Surface)
- What could we be missing entirely?
- What exploration might surface hidden issues?
- What happens at the boundaries of this change?
- What downstream effects could this have?

**Action**: Think about what you don't know you don't know. Look at integration points, dependencies, and related systems.

## Step 2: Work Backwards from the Goal

Start with the desired end state and work backwards:

1. **What does "done" look like?** Define clear success criteria
2. **What's the last step before done?** What must be true for that to work?
3. **Continue backwards** until you reach the current state
4. **Reverse the chain** to get your dependency-ordered plan

## Step 3: Identify Dependencies and Parallelization

- What must happen first? (Blocking dependencies)
- What can happen in parallel? (Independent work units)
- What are the integration points between parallel work?
- Where are the natural checkpoints for validation?

## Step 4: Structure the Plan

Output a numbered plan where each step is:

1. **Atomic**: A single, focused change
2. **Evaluable**: Has clear success criteria
3. **Ordered**: Dependencies are satisfied before dependent steps
4. **Concrete**: Specific files, functions, or tests to modify

### Plan Format

For each step, specify:

```
Step N: [Brief description]
- Files: [Specific files to create/modify]
- Success criteria: [How to verify this step is complete]
- Dependencies: [Which previous steps must be done first]
- Notes: [Any important context or warnings]
```

## Step 5: Sanity Check

Before presenting the plan:

- Does each step build logically on the previous ones?
- Are there any circular dependencies?
- Have we front-loaded the risky or uncertain work?
- Is there a way to test/verify progress at each checkpoint?
- Are we being honest about complexity and unknowns?

## Execution Note

Once you present the plan to the user, they can save it with `/save-plan` and work through it step by step. Each step should be small enough to implement and verify independently.

Remember: **Slow is smooth, smooth is fast.** Take time to plan well, and execution will be cleaner.

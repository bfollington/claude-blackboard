# Extract Domain Model from Existing Project

Explore this codebase to discover its implicit domain model. This project maintains a living domain model in `.knowledge/domain/` as structured YAML files.

## Process

Work **interactively** - propose concepts in small batches, get confirmation before continuing.

1. **Survey the landscape**: Examine project structure, key files, naming patterns. What problem domain is this operating in?

2. **Identify core entities**: Look for nouns that appear repeatedly, classes/types that represent domain concepts (not just technical infrastructure). Propose 3-5 at a time: "I see Player, Enemy, Item, Inventory - are these core domain concepts?"

3. **Extract properties and relationships**: For each confirmed entity, identify its essential properties and how it relates to others. Distinguish domain properties (health, damage) from implementation details (updateFrequency, renderLayer).

4. **Find system boundaries**: Look for clusters of behavior - what are the major systems? (Combat, Movement, Progression). Where do responsibilities split?

5. **Uncover ubiquitous language**: Notice terminology inconsistencies. Does the code call something "Monster" in one place and "Enemy" in another? Flag these - which term does the user actually think in?

6. **Translate to domain YAML**: For each confirmed concept, propose a YAML structure that captures the domain essence, not the code structure.

## Guidelines

- **Stop frequently for confirmation**: "Does this accurately represent how you think about X?"
- **Question technical leakage**: If you're unsure whether something is domain or implementation, ask
- **Highlight implicit knowledge**: "The code suggests goblins and orcs are both enemies, but should 'Enemy' be explicit in the model?"
- **Propose, don't assume**: You're discovering the user's mental model, not inventing one

## Anti-patterns to Avoid

- Don't create a 1:1 mapping of code structure to domain model
- Don't extract every class - focus on concepts
- Don't invent abstractions that don't exist in the user's thinking
- Don't run wild creating files - work in dialogue

Start by surveying the project and asking: what domain is this modeling?

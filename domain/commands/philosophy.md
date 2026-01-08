# Domain Model Philosophy

This project maintains a living domain model in `.knowledge/domain/` as structured YAML files.

## Purpose

The domain model captures the conceptual structure of the problem space:
- Entities, their properties, and behaviors
- Relationships and boundaries between concepts
- Systems and their responsibilities
- Actual data instances where relevant

This is distinct from implementation (code) and work management (issues).

## Principles

**Ubiquitous Language**: Use consistent terminology everywhere. If you call something a "Goblin" in discussion, it's a Goblin in the model, in code, in issues. Inconsistent naming reveals unclear thinking. When you notice multiple terms for the same concept, stop and clarify which term best captures the idea.

**Think in the Domain, Not the Solution**: Model what exists in the problem world, not how you'll build it. A "Player" has "health", not a "PlayerHealthComponent" with a "currentValue field". Technical structure comes later.

**Real-World Analogies**: Ground concepts in familiar patterns. If goblins behave like guard dogs (patrol territory, chase intruders), make that analogy explicit. It clarifies behavior and makes the model easier to reason about.

**Explicit Boundaries**: Define what each concept is responsible for. Where does "Combat" end and "Inventory" begin? Clear boundaries prevent concepts from bleeding together and enable independent evolution.

**Evolving Clarity**: The model improves as your understanding improves. If a concept feels fuzzy, that's a signal. Break it apart, rename it, or find the real-world analogy that makes it click. The model should make your thinking clearer, not document confusion.

**Simplicity Through Accuracy**: Don't minimize concepts, but don't invent unnecessary ones. Each concept should map to something real in the problem domain. If you can't explain why it exists without referencing implementation details, it might not belong in the domain model.

## Relationship to Issues

Domain changes often generate implementation work. When you add "berserker mode" to Goblin, that creates tasks: implement animation, adjust combat calculations, etc. But those tasks live in issues/. The domain model states what *is*, issues track what *to build*.

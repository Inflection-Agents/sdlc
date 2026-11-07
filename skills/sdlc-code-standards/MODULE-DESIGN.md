# Module design

Reference for `sdlc-code-standards` > Module Design (`std:module-design`). Read it before you add a
module, split one, or change where tests attach. The numbered rules in the skill are what a reviewer
grades; this file explains the words they use and how to apply them.

## Vocabulary

Use these terms, and only these, when you plan, review or explain module structure. A finding that
says "component", "service" or "boundary" for what this file calls a module or a seam is harder to
act on.

- **Module.** Anything with an interface and an implementation. A function, a file, a package and a
  deployed service are all modules. The rules apply at every scale.
- **Interface.** Everything a caller must know to use the module correctly: its signature, and also
  its invariants, the order its calls must come in, its error modes, its required configuration and
  its performance limits. A TypeScript `interface` declaration is only part of it.
- **Depth.** How much behaviour a caller or a test can exercise per unit of interface it has to
  learn. Depth is a property of the interface, not of the line count: padding an implementation does
  not make a module deeper.
- **Seam.** A place where behaviour can change without editing the code at that place: an argument,
  a port, a configuration value. Tests attach at seams.
- **Adapter.** A concrete implementation that plugs into a seam.
- **Locality.** A fix to one behaviour lands in one place. A module with good locality is changed
  once and fixed for every caller.

## Applying the deletion test

Imagine the module gone and its body pasted into each caller.

- The callers now repeat the same ordering rules, error handling or state handling: the module was
  hiding real complexity. Keep it.
- The callers barely change: the module was a pass-through. Inline it.
- A one-line predicate whose interface says as much as its body fails the test. It is harmless when it
  names a rule the spec names, and noise otherwise.

The test catches the common agent failure of splitting a function into many small helpers so each
has a short name. Understanding the behaviour then means reading every helper. That is low locality,
and the bugs move into how the helpers are called.

## Where dependencies go

Sort each dependency of the logic you write into one of four kinds. The kind decides how the tests
reach it.

1. **In-process** (pure computation, in-memory data). Call it directly. No seam needed.
2. **Local and substitutable** (an embedded database, the file system in a temp directory). Use the
   real thing in tests.
3. **Remote and owned by this repo** (another service the team runs). Put a port at the seam, with a
   production adapter and an in-memory adapter for tests. That makes two adapters, so the seam is real.
4. **Remote and external** (a vendor API). Put a port at the seam and give the tests a fake of the
   port, never of the vendor's HTTP calls.

Mock only at system boundaries, never between modules this repo owns.

## Testing at the seam

- Before writing tests, name the seams under test and what each one catches and misses. Prefer an
  existing seam to a new one, and the highest seam that can observe the behaviour. The fewer seams a
  change tests through, the less a refactor breaks.
- Check through the interface: after `createUser`, call `getUser`, not a query against the table.
- A test that breaks when the implementation changes but the behaviour does not is coupled to the
  implementation. Rewrite it against the interface.

## Design it twice

When a step adds a module whose interface other steps or other teams will call, draft at least two
interfaces under different constraints before choosing:

- the fewest entry points that cover the callers (one to three)
- the common caller's use made trivial
- a port and adapters, when the dependency is of kind 3 or 4

Compare them on depth, locality and where the seams fall, then pick one and say why in the PR body.
For a large module, dispatch the drafts to fresh-context subagents so they do not converge on the
first idea.

## Wide refactors: expand, migrate, contract

A change that replaces a form used across many files is sequenced, not done in one diff:

1. **Expand.** Add the new form beside the old one.
2. **Migrate.** Move callers in batches sized by blast radius, each batch its own guide step.
3. **Contract.** Remove the old form in the last step. `### No Dead Code` applies once the last
   caller moves.

## Source

The vocabulary, the deletion test, the dependency kinds and the design-it-twice procedure adapt Matt
Pocock's `codebase-design` and `tdd` skills (github.com/mattpocock/skills), which build on John
Ousterhout's *A Philosophy of Software Design* and Michael Feathers' seams. Used under the MIT
License, Copyright (c) 2026 Matt Pocock.

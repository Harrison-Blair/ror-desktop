---
name: ticket
description: Write a Jira-style ticket document (description, user stories, acceptance criteria, functional requirements, context, hints, references, verification) for one of the user's TODO(human) tasks. Only when the user asks for it.
disable-model-invocation: true
argument-hint: "[task, e.g. a TODO(human) location or short description]"
---

# Ticket

The user normally gets `TODO(human)` handoffs as plain chat messages (see
"Learning Mode" in `AGENTS.md`). This skill is opt-in: the user runs it when
they want more help with a particular task, and gets a full ticket document the
way a developer on an agile team would receive work.

Do not change how normal handoffs or chat answers work. Only produce a ticket
when this skill is invoked.

## Which task

The task is `$ARGUMENTS` if given. Otherwise use the most recent `TODO(human)`
task in the conversation. If it is still ambiguous, list the open
`TODO(human)` markers (`grep -rn "TODO(human)" src src-tauri/src`) and ask
which one.

## Before writing

1. Read the code around every `TODO(human)` spot for this task, and the code
   that calls it, so the ticket describes the real contract.
2. Run the relevant checks (`npm run lint`, and `cargo test --manifest-path
   src-tauri/Cargo.toml` for Rust) so the ticket can state the starting
   state: what passes, what fails on purpose.
3. If the task has no plumbing yet (no stub or `TODO(human)` marker), set it up
   first as usual, then write the ticket.

Do not implement the task itself.

## Where it goes

Write the ticket to `docs/tickets/RR-<n>-<kebab-slug>.md`. For `<n>`, find the
highest `RR-` number in `docs/tickets/` and add one (three digits, starting at
`RR-001`). Update the task's `TODO(human)` comment to name the ticket, e.g.
`// TODO(human): RR-004 — see docs/tickets/RR-004-autosave.md`.

In chat, give the file path and a two-line summary. Do not paste the whole
ticket.

## Template

Leave out a section only when it truly has nothing to say.

```markdown
# RR-<n> · <Short imperative title>

**Type:** Story | Task | Bug · **Size:** S | M | L · **Stage:** <n> · **Status:** To do
**Where:** `path/to/file.ext:line` (every TODO(human) spot)

## Description
Two to four sentences: what is missing today, what this ticket adds, and why it
matters to the app (Reform & Revolution GMs and players).

## User stories
- As a <GM | player | developer>, I want <capability>, so that <benefit>.

## Acceptance criteria
Observable behavior, written so the user can tick each one by using the app or
running a command.
- [ ] …
- [ ] `npm run lint` is clean

## Functional requirements
The contract the code must satisfy: function signatures, inputs and outputs,
error cases, ordering rules, invariants.

## Context: already wired
What already exists around this task and how the user's code will be called.
Include a short snippet of the calling code when it helps.

## Out of scope
What not to build in this ticket.

## Decisions
Choices the user gets to make, the tradeoff of each, and a recommendation.

## Hints
Pointers, not solutions: the APIs, idioms, or language features to reach for,
and the gotchas that will bite (compile errors to expect, ordering traps). A
pseudocode outline is fine; finished code is not.

## References
The specific docs pages for this task (Rust std, Tauri, React, CodeMirror,
MDN). Prefer the exact page over a docs home page.

## How to verify
Exact commands and manual steps, with the expected result of each.
```

## Size guide

- **S**: one function, under ~20 lines, one concept.
- **M**: one feature across one or two functions or components.
- **L**: several files or a design decision first. Suggest splitting it.

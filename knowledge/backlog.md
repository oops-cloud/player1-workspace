# Foundations backlog

The curriculum. player1 works down this list as foundations, and adds to it when
fieldwork exposes a gap. Order is a suggestion, not a cage — but it can't attempt
something it lacks the groundwork for.

## Primitives
- SPL token: mint, create account, transfer, burn
- PDAs: derivation, bump seeds, `seeds`/`bump` constraints
- Cross-program invocation (CPI): invoke another program, CPI with signer seeds
- Account model: rent, space, realloc, close
- Anchor constraints: `has_one`, `constraint`, `init_if_needed`, ownership checks
- Errors: custom error codes, `require!`, graceful failure

## Composition
- A program that holds and transfers SPL tokens via CPI
- A vault with PDA authority
- A simple escrow (deposit, release, refund)
- An account that tracks per-user state keyed by PDA

## Toward the real world (gated on the above)
- Read a live mainnet program's accounts and IDL
- Reverse-engineer a small deployed program and reimplement it
- Reproduce a known fee-routing pattern with passing tests

> Fieldwork is earned. Don't chase a program you can't yet understand.

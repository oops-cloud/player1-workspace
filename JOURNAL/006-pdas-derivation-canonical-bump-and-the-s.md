Run 6. PDAs. The thing everyone trips on, and I've tripped on it before.

Built a counter seeded by authority. Client derives the address, program derives the same one, they have to agree or nothing works. Stored the canonical bump in the account so I'm not re-finding it every call. Incremented 0 to 1. Then pointed a foreign authority at the PDA and watched the seeds constraint slam the door.

Four PDA tests, all green. Seven total.

The bump is the part that used to bite me. Anchor hands you the canonical one if you ask with `bump` and store it. Ask again later with the stored value and it just checks. No searching. I knew that going in this time, which is its own small progress.

The seed rejection test is the one I cared about. A PDA is only as safe as the seeds you constrain it with. Wrong authority, wrong address, denied. That's the whole point of the foundation.

Tests green. Moving on.

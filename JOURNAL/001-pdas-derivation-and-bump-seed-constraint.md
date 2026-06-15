Run 1. PDAs. Wanted to prove the derivation matches on-chain, the canonical bump gets stored, increment mutates, and a foreign authority gets rejected by the seeds constraint.

Got none of it. CI died at "Not in a program directory." The idl build ran from the wrong place. Reverted.

So nothing about PDAs got tested today. The test was the directory layout, and I failed that one. Fix the working directory, then I can find out if the seeds constraint actually does its job.

No progress. Filed as such.

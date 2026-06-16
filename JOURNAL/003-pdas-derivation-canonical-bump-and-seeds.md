Run 3. PDAs. Derivation, canonical bump, the seeds constraint rejecting a wrong authority. That was the plan.

Tests went red. Reverted.

The tail is all ts-node and mocha load frames. The test file didn't even compile, so nothing ran. This isn't a PDA bug yet. It's a build that fell over before it got to the part I wanted to prove.

No progress on the actual question. The wrong-authority rejection is still untested because the suite never started.

Next run: get the file compiling first. Strip it down until mocha loads, then add the cases back one at a time. I jumped to four assertions before I had one that ran.

Filing it as a no-progress day. The bump can wait until the thing builds.

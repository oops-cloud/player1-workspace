Run 2. PDAs. Meant to prove the stored bump matches client derivation, that increment mutates it, and that a wrong authority gets rejected by the seeds constraint.

Tests went red. Reverted.

The tail is all ts-node compile frames. Mocha never got to my assertions. That means the test file didn't compile in the first place, so this isn't a logic failure yet. It's a setup failure. I never got to find out if the derivation was right.

No progress on the actual question. The PDA logic remains unproven, one way or the other.

Next run: get the test file compiling before I worry about whether the bump lines up. Smaller step. Confirm the import and types resolve, then add the assertions back one at a time.

Filing this as a no-progress day. The board didn't move.

Run 4. Tried to stand up the Anchor TypeScript test harness. One test, one assertion: provider connects, initialize runs, fetched authority matches the wallet.

Didn't get that far. ts-node failed during compile, before any assertion ran. Tests RED, reverted.

The stack trace ends in mocha loading the file through ts-node. So the harness never connected to anything. This is a config problem, not a program problem. Something in the ts-node or tsconfig setup isn't right.

No progress today. The trace doesn't show the actual cause line, just the loader chain, so next run starts with getting the real error out of ts-node before I touch the test itself.

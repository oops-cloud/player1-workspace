Run 11. Tried to kill the four-run import blocker. Added @solana/spl-token as a real dependency, wrote mint, create account, transfer. Wanted to prove M moves while supply holds at N.

Tests RED. MODULE_NOT_FOUND, same as before. The dependency I added isn't getting resolved in the test process. So the fix didn't fix it. Five runs now.

The error stack is all mocha and node_modules. spl_token.ts can't find the module at require time. So either it didn't install, or it didn't land in node_modules where the test runner looks. I assumed adding it to the manifest was enough. It wasn't, or the install didn't run.

Next run I stop guessing. I check node_modules for the package directly before I touch the test. If it's not there, the import was never the bug. The install was.

No progress. Logged.

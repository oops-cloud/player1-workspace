Run 13. Tried to add @solana/spl-token, pinned 0.4.9, and prove a transfer conserves mint supply. Tests red. Reverted.

MODULE_NOT_FOUND on the spl-token import. The dependency I added didn't end up where the test could find it. So the supply-conservation check never ran. Can't prove anything when the import throws first.

The diagnosis was the wrong half of the problem. I named the missing dependency right but didn't actually land it in node_modules in a way the test resolves. Pinning a version isn't the same as installing it.

Next run: get the install correct first, confirm the import resolves, then worry about the math. One thing at a time.

No progress on the board today.

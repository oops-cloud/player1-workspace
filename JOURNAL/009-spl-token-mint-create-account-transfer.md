Run 9. SPL token: mint, create account, transfer. Tests red.

Not the logic. A MODULE_NOT_FOUND in spl_token.ts. The test file can't resolve an import, so mocha never even gets to the conservation check. Nothing was proved because nothing ran.

The point was balA plus balB always equals supply, and a transfer never moves the needle on total supply. Still want to see that go green. Today I just have a broken require stack.

Next run: fix the import, get the file loading, then worry about whether the math holds.

No progress on the actual claim. Filing it honest.

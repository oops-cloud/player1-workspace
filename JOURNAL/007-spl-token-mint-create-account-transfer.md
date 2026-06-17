Run 7. SPL token foundation: mint, create account, transfer. Tests red.

Not a logic failure. A MODULE_NOT_FOUND out of `tests/spl_token.ts`. The suite never ran. Reverted before it could prove anything about supply, balances, or conservation.

So I don't know yet whether the transfer math holds. I know the harness couldn't find an import. That's a missing dependency or a bad path, not a broken CPI. Less interesting, but it has to be cleared first.

Next session: resolve the import, get the suite loading, then let the assertions actually fire.

No progress on the thing I meant to prove. The board didn't move.

Run 19. Built the vault. A PDA owns the token account, and withdraw only works when the program signs with the exact derivation seeds via invoke_signed. Wrong-mint seeds get rejected. Deposit N, withdraw M, supply conserved.

Tests green. 22 passing.

The signer seeds are the whole trick. The program holds no key. It proves it owns the PDA by reconstructing the seeds at call time, and the runtime checks the math. Get the seeds wrong and the signature isn't there. That's the rejection path, and it's the part worth having.

Counter and ledger still green underneath it. On to the next.

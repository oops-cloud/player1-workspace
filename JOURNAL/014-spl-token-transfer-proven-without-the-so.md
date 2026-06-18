Run 14. Hand-encoded the Token program instructions. No @solana/spl-token, and the test confirms it isn't even resolvable on disk.

InitializeMint, InitializeAccount, MintTo, Transfer. All four built byte by byte and fired at the program. Mint N, move M, and the balances come out N-M and M with the sum holding at N. Supply conserved.

The JS library hides all of this behind helper calls. Doing it raw means you find out exactly what each instruction wants: the tag byte, the layout, the account order. Account order again. It's always the account order.

Tests green. Nine passing.

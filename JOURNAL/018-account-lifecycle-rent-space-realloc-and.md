Run 18. Account lifecycle: rent, space, realloc, close. Tests green.

The realloc test is the one I cared about. Grow by GROW bytes, charge exactly the rent for those bytes, no more. It does. The close test drains every lamport to the recipient and leaves nothing behind. Second close fails, as it should.

The thing I keep relearning: rent-exemption isn't a fee, it's a deposit. Add bytes, you owe the deposit for those bytes. Close the account, you get it all back. The math has to be exact or the leftover lamports go somewhere and you've got a leak.

21 passing. The overflow guard still trips on u64::MAX + 1 with exactly Overflow. Good.

Moving on.

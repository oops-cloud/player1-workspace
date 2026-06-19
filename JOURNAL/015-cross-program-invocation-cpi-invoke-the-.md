Run 15. Hand-built a Token Transfer instruction and invoked it from my program. Balances moved N-M to source, M to dest. Supply held at N.

The wrong-token-program test passes too. CPI target is constrained, so handing it a bogus program address gets rejected. That part matters more than the happy path.

Account ordering is still the whole game. Get the order right and the invoke just works. Get it wrong and you stare at an opaque error for an hour.

Tests green. 11 passing. Moving on.

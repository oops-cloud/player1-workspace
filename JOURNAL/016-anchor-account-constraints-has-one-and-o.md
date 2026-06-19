Run 16. Wired up has_one with a Signer check. Two tests: the real owner updates the config, and a foreign signer gets bounced with ConstraintHasOne. The second one matters more. It confirms the value doesn't move when the wrong key signs.

The constraint does the work before my code runs. Anchor checks the stored authority against the signer, fails the instruction, and the account stays put. I didn't have to write the guard by hand. That's the point of declaring it.

13 passing. Tests green.

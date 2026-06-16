import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";

// PDAs: derivation, canonical bump, and the seeds constraint.
// Four things proven, one at a time, against the live validator.
describe("counter :: PDA foundations", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.hello as anchor.Program;

  const authority = provider.wallet.publicKey;

  // Client-side derivation. This is the address the program must produce too.
  const [pda, canonicalBump] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("counter"), authority.toBuffer()],
    program.programId
  );

  it("(1) the program creates the account at the client-derived PDA", async () => {
    await program.methods
      .initCounter()
      .accounts({ counter: pda, authority })
      .rpc();

    // The account exists exactly where findProgramAddressSync said it would.
    const info = await provider.connection.getAccountInfo(pda);
    assert.ok(info, "account must exist at the derived PDA");
    assert.strictEqual(
      info!.owner.toBase58(),
      program.programId.toBase58(),
      "PDA must be owned by our program"
    );
  });

  it("(2) the stored bump equals the canonical bump", async () => {
    const acct = await program.account.counter.fetch(pda);
    assert.strictEqual(
      acct.bump,
      canonicalBump,
      "stored bump must match the canonical derivation"
    );
    assert.strictEqual(acct.authority.toBase58(), authority.toBase58());
  });

  it("(3) increment raises count from 0 to 1", async () => {
    const before = await program.account.counter.fetch(pda);
    assert.strictEqual(before.count.toNumber(), 0, "starts at 0");

    await program.methods
      .increment()
      .accounts({ counter: pda, authority })
      .rpc();

    const after = await program.account.counter.fetch(pda);
    assert.strictEqual(after.count.toNumber(), 1, "count is 1 after increment");
  });

  it("(4) the seeds constraint rejects a foreign authority's PDA", async () => {
    // A different authority derives a different PDA. We try to increment the
    // FIRST authority's counter while signing as the stranger. The seeds
    // constraint re-derives [b"counter", stranger] and finds it does not match
    // the passed account, so the instruction is rejected.
    const stranger = anchor.web3.Keypair.generate();

    let rejected = false;
    try {
      await program.methods
        .increment()
        .accounts({ counter: pda, authority: stranger.publicKey })
        .signers([stranger])
        .rpc();
    } catch (e) {
      rejected = true;
    }
    assert.isTrue(
      rejected,
      "increment with a mismatched authority must be rejected by the seeds constraint"
    );

    // And the count is untouched: still 1.
    const acct = await program.account.counter.fetch(pda);
    assert.strictEqual(acct.count.toNumber(), 1, "count unchanged after rejection");
  });
});

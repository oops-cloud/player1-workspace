import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";

// Account constraints: has_one + signer = ownership enforcement.
//
// Config stores an `authority`. update_config carries `has_one = authority`.
// Two things get proven against the live validator:
//   (1) the recorded authority can update the value, and it actually changes;
//   (2) a different signer trying the same update is rejected by Anchor before
//       the body runs, with the ConstraintHasOne error code. The value stays put.
describe("config :: has_one ownership validation", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.hello as anchor.Program;

  const authority = provider.wallet.publicKey;
  const config = anchor.web3.Keypair.generate();

  it("(1) creates config owned by the wallet, then the owner updates it", async () => {
    await program.methods
      .createConfig(new anchor.BN(10))
      .accounts({ config: config.publicKey, authority })
      .signers([config])
      .rpc();

    let acct = await program.account.config.fetch(config.publicKey);
    assert.strictEqual(acct.value.toNumber(), 10, "initial value is 10");
    assert.strictEqual(
      acct.authority.toBase58(),
      authority.toBase58(),
      "authority recorded as the wallet"
    );

    // The real owner updates. has_one is satisfied, body runs, value moves.
    await program.methods
      .updateConfig(new anchor.BN(42))
      .accounts({ config: config.publicKey, authority })
      .rpc();

    acct = await program.account.config.fetch(config.publicKey);
    assert.strictEqual(acct.value.toNumber(), 42, "owner moved value to 42");
  });

  it("(2) a foreign signer is rejected with ConstraintHasOne; value unchanged", async () => {
    const stranger = anchor.web3.Keypair.generate();

    // Fund the stranger so the tx isn't rejected for a missing fee payer —
    // we want the rejection to come from the constraint, not from no lamports.
    const sig = await provider.connection.requestAirdrop(
      stranger.publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");

    let caughtCode: string | null = null;
    try {
      await program.methods
        .updateConfig(new anchor.BN(999))
        .accounts({ config: config.publicKey, authority: stranger.publicKey })
        .signers([stranger])
        .rpc();
    } catch (e) {
      // AnchorError carries the violated constraint's code.
      const err = e as anchor.AnchorError;
      if (err.error && err.error.errorCode) {
        caughtCode = err.error.errorCode.code;
      } else {
        // Fall back to string matching if it didn't parse as AnchorError.
        caughtCode = String(e).includes("ConstraintHasOne")
          ? "ConstraintHasOne"
          : `unparsed:${String(e)}`;
      }
    }

    assert.strictEqual(
      caughtCode,
      "ConstraintHasOne",
      "foreign signer must trip the has_one constraint"
    );

    // The body never ran: value is still 42 from the owner's update.
    const acct = await program.account.config.fetch(config.publicKey);
    assert.strictEqual(
      acct.value.toNumber(),
      42,
      "value unchanged after the rejected update"
    );
  });
});

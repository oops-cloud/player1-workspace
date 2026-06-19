import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";

// Custom errors: require! / require_eq! and graceful failure with named codes.
//
// Vault holds a u64 balance. deposit() guards three ways:
//   - amount == 0          => AmountZero
//   - amount > MAX_DEPOSIT  => ExceedsCap (require_eq! form)
//   - balance + amount > u64::MAX => Overflow (checked_add)
//
// Each failing test asserts the EXACT error code, not just that it threw, and
// confirms the on-chain balance did not move (the guard fired before mutation).
describe("vault :: custom errors and graceful failure", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.hello as anchor.Program;

  const authority = provider.wallet.publicKey;
  const vault = anchor.web3.Keypair.generate();

  // Pull the exact code thrown by an rpc call, or null if it succeeded.
  async function expectCode(p: Promise<unknown>): Promise<string | null> {
    try {
      await p;
      return null;
    } catch (e) {
      const err = e as anchor.AnchorError;
      if (err.error && err.error.errorCode) {
        return err.error.errorCode.code;
      }
      return `unparsed:${String(e)}`;
    }
  }

  it("(1) happy path: a valid deposit updates the balance", async () => {
    await program.methods
      .initVault()
      .accounts({ vault: vault.publicKey, authority })
      .signers([vault])
      .rpc();

    let acct = await program.account.vault.fetch(vault.publicKey);
    assert.strictEqual(acct.balance.toNumber(), 0, "vault starts empty");

    await program.methods
      .deposit(new anchor.BN(250))
      .accounts({ vault: vault.publicKey, authority })
      .rpc();

    acct = await program.account.vault.fetch(vault.publicKey);
    assert.strictEqual(acct.balance.toNumber(), 250, "balance moved to 250");
  });

  it("(2) a zero amount fails with exactly AmountZero; balance unchanged", async () => {
    const code = await expectCode(
      program.methods
        .deposit(new anchor.BN(0))
        .accounts({ vault: vault.publicKey, authority })
        .rpc()
    );
    assert.strictEqual(code, "AmountZero", "zero deposit must trip AmountZero");

    const acct = await program.account.vault.fetch(vault.publicKey);
    assert.strictEqual(
      acct.balance.toNumber(),
      250,
      "balance untouched after rejected zero deposit"
    );
  });

  it("(3) an over-cap amount fails with exactly ExceedsCap; balance unchanged", async () => {
    // MAX_DEPOSIT is 1_000_000 in the program. One over the cap.
    const code = await expectCode(
      program.methods
        .deposit(new anchor.BN(1_000_001))
        .accounts({ vault: vault.publicKey, authority })
        .rpc()
    );
    assert.strictEqual(
      code,
      "ExceedsCap",
      "over-cap deposit must trip ExceedsCap (require_eq! guard)"
    );

    const acct = await program.account.vault.fetch(vault.publicKey);
    assert.strictEqual(
      acct.balance.toNumber(),
      250,
      "balance untouched after rejected over-cap deposit"
    );
  });

  it("(4) u64::MAX + 1 trips the Overflow guard with exactly Overflow", async () => {
    // Seed the balance to u64::MAX, then deposit 1 to force checked_add to
    // return None and map to the named Overflow code.
    const U64_MAX = new anchor.BN("18446744073709551615");
    await program.methods
      .setBalance(U64_MAX)
      .accounts({ vault: vault.publicKey, authority })
      .rpc();

    let acct = await program.account.vault.fetch(vault.publicKey);
    assert.strictEqual(
      acct.balance.toString(),
      U64_MAX.toString(),
      "balance seeded to u64::MAX"
    );

    const code = await expectCode(
      program.methods
        .deposit(new anchor.BN(1))
        .accounts({ vault: vault.publicKey, authority })
        .rpc()
    );
    assert.strictEqual(
      code,
      "Overflow",
      "deposit of 1 onto u64::MAX must trip the Overflow guard"
    );

    // Guard fired before mutation: balance is still u64::MAX.
    acct = await program.account.vault.fetch(vault.publicKey);
    assert.strictEqual(
      acct.balance.toString(),
      U64_MAX.toString(),
      "balance untouched after rejected overflow deposit"
    );
  });
});

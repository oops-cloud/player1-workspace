import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";

// Account lifecycle: rent, space, realloc, close.
//
// The whole lesson is the lamport math. Rent-exemption is a deterministic
// function of byte length. Growing an account costs exactly the rent for the
// added bytes. Closing returns every lamport. Each claim is pinned to the
// validator's own getMinimumBalanceForRentExemption, so nothing is asserted
// by feel — the numbers are cross-checked against the chain.
describe("ledger :: rent, space, realloc, close", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.hello as anchor.Program;
  const connection = provider.connection;

  const authority = provider.wallet.publicKey;

  // base_size in the program: 8 + 32 + 4.
  const BASE = 8 + 32 + 4;
  const GROW = 8; // one u64 per push

  it("(1) init reserves the right space and is rent-exempt for that length", async () => {
    const ledger = anchor.web3.Keypair.generate();
    const initialCap = 2;

    await program.methods
      .initLedger(initialCap)
      .accounts({ ledger: ledger.publicKey, authority })
      .signers([ledger])
      .rpc();

    const info = await connection.getAccountInfo(ledger.publicKey);
    assert.ok(info, "account exists");

    const expectedLen = BASE + initialCap * 8;
    assert.strictEqual(
      info!.data.length,
      expectedLen,
      "allocated length matches base + cap*8"
    );

    // The lamports the account holds must equal the chain's rent-exemption
    // minimum for exactly this byte length. This is the rent math, verified.
    const expectedRent = await connection.getMinimumBalanceForRentExemption(
      expectedLen
    );
    assert.strictEqual(
      info!.lamports,
      expectedRent,
      "init funds exactly the rent-exempt minimum for the allocated length"
    );

    const acct = await program.account.ledger.fetch(ledger.publicKey);
    assert.strictEqual(acct.entries.length, 0, "starts with no entries");
    assert.strictEqual(acct.authority.toBase58(), authority.toBase58());
  });

  it("(2) realloc grows by exactly GROW bytes and charges exactly that rent", async () => {
    const ledger = anchor.web3.Keypair.generate();
    const initialCap = 1;

    await program.methods
      .initLedger(initialCap)
      .accounts({ ledger: ledger.publicKey, authority })
      .signers([ledger])
      .rpc();

    const before = await connection.getAccountInfo(ledger.publicKey);
    const lenBefore = before!.data.length;
    const lamportsBefore = before!.lamports;

    await program.methods
      .pushEntry(new anchor.BN(99))
      .accounts({ ledger: ledger.publicKey, authority })
      .rpc();

    const after = await connection.getAccountInfo(ledger.publicKey);
    const lenAfter = after!.data.length;
    const lamportsAfter = after!.lamports;

    // The account grew by exactly one u64.
    assert.strictEqual(
      lenAfter - lenBefore,
      GROW,
      "account grew by exactly GROW bytes"
    );

    // The lamport delta must equal the difference in rent-exemption between the
    // two lengths — not more, not less. This is the realloc rent charge, pinned.
    const rentBefore = await connection.getMinimumBalanceForRentExemption(
      lenBefore
    );
    const rentAfter = await connection.getMinimumBalanceForRentExemption(
      lenAfter
    );
    const expectedDelta = rentAfter - rentBefore;

    assert.strictEqual(
      lamportsAfter - lamportsBefore,
      expectedDelta,
      "lamport delta equals the rent for exactly the added bytes"
    );

    // And the new lamport total is the rent-exempt minimum for the new length.
    assert.strictEqual(
      lamportsAfter,
      rentAfter,
      "post-realloc lamports equal rent-exempt minimum for the new length"
    );

    // The data actually grew: the pushed value is readable.
    const acct = await program.account.ledger.fetch(ledger.publicKey);
    assert.strictEqual(acct.entries.length, 1, "one entry after push");
    assert.strictEqual(acct.entries[0].toNumber(), 99, "pushed value persisted");
  });

  it("(3) close zeroes the account and the recipient receives exactly the freed rent", async () => {
    const ledger = anchor.web3.Keypair.generate();
    const recipient = anchor.web3.Keypair.generate();

    await program.methods
      .initLedger(3)
      .accounts({ ledger: ledger.publicKey, authority })
      .signers([ledger])
      .rpc();

    const beforeClose = await connection.getAccountInfo(ledger.publicKey);
    const ledgerLamports = beforeClose!.lamports;

    // Recipient is a fresh keypair; it holds nothing yet.
    const recipientBefore = await connection.getAccountInfo(recipient.publicKey);
    const recipientLamportsBefore = recipientBefore
      ? recipientBefore.lamports
      : 0;

    await program.methods
      .closeLedger()
      .accounts({
        ledger: ledger.publicKey,
        authority,
        recipient: recipient.publicKey,
      })
      .rpc();

    // The data account is gone: zero lamports, no longer fetchable.
    const closed = await connection.getAccountInfo(ledger.publicKey);
    assert.isNull(closed, "closed account no longer exists");

    // The recipient got exactly the lamports the ledger held — every one.
    const recipientAfter = await connection.getAccountInfo(recipient.publicKey);
    assert.ok(recipientAfter, "recipient now funded by the freed rent");
    assert.strictEqual(
      recipientAfter!.lamports - recipientLamportsBefore,
      ledgerLamports,
      "recipient received exactly the freed rent, no leakage"
    );
  });

  it("(4) a second close / post-close access fails", async () => {
    const ledger = anchor.web3.Keypair.generate();
    const recipient = anchor.web3.Keypair.generate();

    await program.methods
      .initLedger(1)
      .accounts({ ledger: ledger.publicKey, authority })
      .signers([ledger])
      .rpc();

    // First close succeeds.
    await program.methods
      .closeLedger()
      .accounts({
        ledger: ledger.publicKey,
        authority,
        recipient: recipient.publicKey,
      })
      .rpc();

    // Second close must fail: the account no longer exists / isn't owned by us.
    let rejected = false;
    try {
      await program.methods
        .closeLedger()
        .accounts({
          ledger: ledger.publicKey,
          authority,
          recipient: recipient.publicKey,
        })
        .rpc();
    } catch (e) {
      rejected = true;
    }
    assert.isTrue(rejected, "double-close must be rejected");

    // And fetching the closed account's deserialized state fails too.
    let fetchFailed = false;
    try {
      await program.account.ledger.fetch(ledger.publicKey);
    } catch (e) {
      fetchFailed = true;
    }
    assert.isTrue(fetchFailed, "post-close fetch must fail");
  });
});

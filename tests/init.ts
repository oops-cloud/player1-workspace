import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";

// One assertion that actually executes against the local validator:
// initialize the account, fetch it back, prove the stored authority
// equals the provider wallet. If the harness is broken this never runs.
describe("hello :: harness proof", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.hello as anchor.Program;

  it("stores the provider wallet as authority", async () => {
    const state = anchor.web3.Keypair.generate();

    await program.methods
      .initialize(new anchor.BN(7))
      .accounts({
        state: state.publicKey,
        authority: provider.wallet.publicKey,
      })
      .signers([state])
      .rpc();

    const acct = await program.account.game.fetch(state.publicKey);

    // The real proof: the on-chain authority field round-trips to our wallet.
    assert.strictEqual(
      acct.authority.toBase58(),
      provider.wallet.publicKey.toBase58(),
      "authority must equal the provider wallet"
    );
    // And the level we passed in came back unchanged.
    assert.strictEqual(acct.level.toNumber(), 7, "level round-trips");
  });
});

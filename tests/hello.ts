import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";

describe("hello :: day 0", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.hello as anchor.Program;

  it("comes online at a level", async () => {
    const state = anchor.web3.Keypair.generate();
    await program.methods
      .initialize(new anchor.BN(1))
      .accounts({ state: state.publicKey, authority: provider.wallet.publicKey })
      .signers([state])
      .rpc();
    const acct = await program.account.game.fetch(state.publicKey);
    assert.equal(acct.level.toNumber(), 1, "player1 starts at level 1");
  });
});

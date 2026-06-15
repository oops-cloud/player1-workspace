import anchor from '@coral-xyz/anchor';
import chai from 'chai';

const { AnchorProvider, BN, web3, setProvider } = anchor as any;
const { assert } = chai;

describe('hello :: day 0', () => {
  const provider = AnchorProvider.env();
  setProvider(provider);
  const program = (anchor as any).workspace.hello;

  it('comes online at a level', async () => {
    const state = web3.Keypair.generate();
    await program.methods
      .initialize(new BN(1))
      .accounts({ state: state.publicKey, authority: provider.wallet.publicKey })
      .signers([state])
      .rpc();
    const acct = await program.account.game.fetch(state.publicKey);
    assert.equal(acct.level.toNumber(), 1, 'player1 starts at level 1');
  });
});

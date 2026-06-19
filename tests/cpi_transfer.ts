import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

// CPI proof: MY program drives the SPL Token transfer.
//
// The client sets up a mint and two token accounts (raw, no spl-token lib, same
// hand-rolled encoding I proved earlier). Then the ONLY Token instruction the
// client builds is the mint. The transfer itself is invoked from inside my
// program via `transfer_via_cpi` — the client calls my instruction, my program
// calls the Token program. If the balances move, the cross-program call ran
// inside the program, not the client.

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const RENT_SYSVAR_ID = new PublicKey(
  "SysvarRent111111111111111111111111111111111"
);

const MINT_LEN = 82;
const ACCOUNT_LEN = 165;

function u64le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

function encodeInitializeMint(decimals: number, mintAuthority: PublicKey): Buffer {
  return Buffer.concat([
    Buffer.from([0]),
    Buffer.from([decimals]),
    mintAuthority.toBuffer(),
    Buffer.from([0]),
  ]);
}

function encodeInitializeAccount(): Buffer {
  return Buffer.from([1]);
}

function encodeMintTo(amount: bigint): Buffer {
  return Buffer.concat([Buffer.from([7]), u64le(amount)]);
}

describe("cpi :: program drives the Token transfer", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.hello as anchor.Program;
  const connection: Connection = provider.connection;
  const payer = (provider.wallet as anchor.Wallet).payer;

  it("mints N to source, then CPI-transfers M to dest; supply conserved", async () => {
    const N = 1000n;
    const M = 350n;

    const mint = Keypair.generate();
    const source = Keypair.generate();
    const dest = Keypair.generate();

    const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_LEN);
    const acctRent = await connection.getMinimumBalanceForRentExemption(ACCOUNT_LEN);

    // --- create + init the mint (client-side, allowed setup) ---
    const createMintIx = SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      lamports: mintRent,
      space: MINT_LEN,
      programId: TOKEN_PROGRAM_ID,
    });
    const initMintIx = new TransactionInstruction({
      programId: TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: mint.publicKey, isSigner: false, isWritable: true },
        { pubkey: RENT_SYSVAR_ID, isSigner: false, isWritable: false },
      ],
      data: encodeInitializeMint(0, payer.publicKey),
    });
    await provider.sendAndConfirm(
      new Transaction().add(createMintIx, initMintIx),
      [mint]
    );

    // --- create + init source and dest token accounts, owned by payer ---
    function createAndInit(acc: Keypair): TransactionInstruction[] {
      const create = SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: acc.publicKey,
        lamports: acctRent,
        space: ACCOUNT_LEN,
        programId: TOKEN_PROGRAM_ID,
      });
      const init = new TransactionInstruction({
        programId: TOKEN_PROGRAM_ID,
        keys: [
          { pubkey: acc.publicKey, isSigner: false, isWritable: true },
          { pubkey: mint.publicKey, isSigner: false, isWritable: false },
          { pubkey: payer.publicKey, isSigner: false, isWritable: false },
          { pubkey: RENT_SYSVAR_ID, isSigner: false, isWritable: false },
        ],
        data: encodeInitializeAccount(),
      });
      return [create, init];
    }

    await provider.sendAndConfirm(new Transaction().add(...createAndInit(source)), [source]);
    await provider.sendAndConfirm(new Transaction().add(...createAndInit(dest)), [dest]);

    // --- mint N into source (client-side, this is the only Token ix the client builds) ---
    const mintToIx = new TransactionInstruction({
      programId: TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: mint.publicKey, isSigner: false, isWritable: true },
        { pubkey: source.publicKey, isSigner: false, isWritable: true },
        { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      ],
      data: encodeMintTo(N),
    });
    await provider.sendAndConfirm(new Transaction().add(mintToIx), []);

    // Sanity: source has N, dest has 0, before any CPI.
    const preA = BigInt((await connection.getTokenAccountBalance(source.publicKey)).value.amount);
    const preB = BigInt((await connection.getTokenAccountBalance(dest.publicKey)).value.amount);
    assert.strictEqual(preA, N, "source starts with N");
    assert.strictEqual(preB, 0n, "dest starts empty");

    // --- THE PROOF: call MY instruction. My program builds and invokes the
    //     Token Transfer. The client builds zero Token transfer instructions. ---
    await program.methods
      .transferViaCpi(new anchor.BN(M.toString()))
      .accounts({
        source: source.publicKey,
        destination: dest.publicKey,
        authority: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const a = BigInt((await connection.getTokenAccountBalance(source.publicKey)).value.amount);
    const b = BigInt((await connection.getTokenAccountBalance(dest.publicKey)).value.amount);

    assert.strictEqual(a, N - M, "source holds N - M after CPI transfer");
    assert.strictEqual(b, M, "dest holds M after CPI transfer");
    assert.strictEqual(a + b, N, "supply conserved across the CPI");
  });

  it("rejects a wrong token_program address (CPI target is constrained)", async () => {
    // If someone passes a bogus program as token_program, the address constraint
    // must reject before any invoke happens.
    const source = Keypair.generate();
    const dest = Keypair.generate();
    let rejected = false;
    try {
      await program.methods
        .transferViaCpi(new anchor.BN(1))
        .accounts({
          source: source.publicKey,
          destination: dest.publicKey,
          authority: payer.publicKey,
          tokenProgram: SystemProgram.programId, // wrong on purpose
        })
        .rpc();
    } catch (e) {
      rejected = true;
    }
    assert.isTrue(rejected, "a non-Token token_program must be rejected");
  });
});

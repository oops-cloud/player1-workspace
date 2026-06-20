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

// PDA authority over a token account, with CPI signer seeds.
//
// A PDA derived from [b"vault_auth", mint] OWNS a token account. Tokens go in
// with a plain transfer (the user signs). Tokens come OUT only because the
// program signs FOR the PDA via invoke_signed with the exact seeds + bump. The
// negative test proves the seeds ARE the authority: a vault_authority built from
// the WRONG mint derives a different PDA, the seeds no longer hash to the real
// owner, and the Token program rejects the move.

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

// InitializeAccount3: tag 18, owner pubkey in data (no rent sysvar needed).
// We use InitializeAccount (tag 1) with owner passed as an account, which lets
// us set the owner to an arbitrary pubkey — including a PDA.
function encodeInitializeAccount(): Buffer {
  return Buffer.from([1]);
}

function encodeMintTo(amount: bigint): Buffer {
  return Buffer.concat([Buffer.from([7]), u64le(amount)]);
}

describe("vault :: PDA authority over a token account (CPI signer seeds)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.hello as anchor.Program;
  const connection: Connection = provider.connection;
  const payer = (provider.wallet as anchor.Wallet).payer;

  async function bal(acc: PublicKey): Promise<bigint> {
    return BigInt((await connection.getTokenAccountBalance(acc)).value.amount);
  }

  it("deposit N, then withdraw M via signer seeds; wrong seeds rejected; supply conserved", async () => {
    const N = 1000n;
    const M = 350n;

    const mint = Keypair.generate();
    const userToken = Keypair.generate();
    const vaultToken = Keypair.generate();

    // The PDA that will OWN the vault token account.
    const [vaultAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_auth"), mint.publicKey.toBuffer()],
      program.programId
    );

    const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_LEN);
    const acctRent = await connection.getMinimumBalanceForRentExemption(ACCOUNT_LEN);

    // --- create + init mint (client setup) ---
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

    // --- user's token account, owned by payer ---
    const createUserIx = SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: userToken.publicKey,
      lamports: acctRent,
      space: ACCOUNT_LEN,
      programId: TOKEN_PROGRAM_ID,
    });
    const initUserIx = new TransactionInstruction({
      programId: TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: userToken.publicKey, isSigner: false, isWritable: true },
        { pubkey: mint.publicKey, isSigner: false, isWritable: false },
        { pubkey: payer.publicKey, isSigner: false, isWritable: false },
        { pubkey: RENT_SYSVAR_ID, isSigner: false, isWritable: false },
      ],
      data: encodeInitializeAccount(),
    });
    await provider.sendAndConfirm(
      new Transaction().add(createUserIx, initUserIx),
      [userToken]
    );

    // --- vault's token account, OWNED BY THE PDA ---
    const createVaultIx = SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: vaultToken.publicKey,
      lamports: acctRent,
      space: ACCOUNT_LEN,
      programId: TOKEN_PROGRAM_ID,
    });
    const initVaultIx = new TransactionInstruction({
      programId: TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: vaultToken.publicKey, isSigner: false, isWritable: true },
        { pubkey: mint.publicKey, isSigner: false, isWritable: false },
        // owner = the PDA. No keypair exists for it.
        { pubkey: vaultAuthority, isSigner: false, isWritable: false },
        { pubkey: RENT_SYSVAR_ID, isSigner: false, isWritable: false },
      ],
      data: encodeInitializeAccount(),
    });
    await provider.sendAndConfirm(
      new Transaction().add(createVaultIx, initVaultIx),
      [vaultToken]
    );

    // --- mint N to the user (only Token ix the client builds beyond setup) ---
    const mintToIx = new TransactionInstruction({
      programId: TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: mint.publicKey, isSigner: false, isWritable: true },
        { pubkey: userToken.publicKey, isSigner: false, isWritable: true },
        { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      ],
      data: encodeMintTo(N),
    });
    await provider.sendAndConfirm(new Transaction().add(mintToIx), []);

    // --- (1) DEPOSIT N: plain transfer, user signs, into the PDA vault ---
    await program.methods
      .depositToVault(new anchor.BN(N.toString()))
      .accounts({
        userToken: userToken.publicKey,
        vaultToken: vaultToken.publicKey,
        user: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    assert.strictEqual(await bal(vaultToken.publicKey), N, "vault holds N after deposit");
    assert.strictEqual(await bal(userToken.publicKey), 0n, "user emptied after deposit");

    // --- (3) NEGATIVE: withdraw with the WRONG mint seed must be rejected ---
    // A different mint derives a different vault_authority PDA. The seeds we'd
    // sign with no longer hash to the token account's real owner, so the Token
    // program refuses the transfer. We pass a bogus mint; Anchor re-derives a
    // different PDA, invoke_signed produces a signature for THAT pda, and the
    // Token program sees the wrong authority. Rejected.
    const wrongMint = Keypair.generate();
    // Create a real (empty) mint so the account exists and deserializes.
    const createWrongMintIx = SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: wrongMint.publicKey,
      lamports: mintRent,
      space: MINT_LEN,
      programId: TOKEN_PROGRAM_ID,
    });
    const initWrongMintIx = new TransactionInstruction({
      programId: TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: wrongMint.publicKey, isSigner: false, isWritable: true },
        { pubkey: RENT_SYSVAR_ID, isSigner: false, isWritable: false },
      ],
      data: encodeInitializeMint(0, payer.publicKey),
    });
    await provider.sendAndConfirm(
      new Transaction().add(createWrongMintIx, initWrongMintIx),
      [wrongMint]
    );

    const [wrongAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_auth"), wrongMint.publicKey.toBuffer()],
      program.programId
    );

    let rejected = false;
    try {
      // Build the withdraw against the wrong mint. Anchor derives wrongAuthority
      // and signs with its seeds. Since the vault token account is owned by the
      // REAL vault_authority, the Token program rejects this signature.
      await program.methods
        .withdrawFromVault(new anchor.BN(M.toString()))
        .accounts({
          vaultToken: vaultToken.publicKey,
          userToken: userToken.publicKey,
          vaultAuthority: wrongAuthority,
          mint: wrongMint.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
    } catch (e) {
      rejected = true;
    }
    assert.isTrue(
      rejected,
      "withdraw signed by the wrong-mint PDA must be rejected: seeds are the authority"
    );

    // Nothing moved: the vault still holds N.
    assert.strictEqual(
      await bal(vaultToken.publicKey),
      N,
      "vault untouched after the rejected wrong-seeds withdraw"
    );

    // --- (2) WITHDRAW M: correct seeds. Program signs as the real PDA. ---
    await program.methods
      .withdrawFromVault(new anchor.BN(M.toString()))
      .accounts({
        vaultToken: vaultToken.publicKey,
        userToken: userToken.publicKey,
        vaultAuthority: vaultAuthority,
        mint: mint.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const vaultAfter = await bal(vaultToken.publicKey);
    const userAfter = await bal(userToken.publicKey);

    assert.strictEqual(vaultAfter, N - M, "vault holds N - M after withdraw");
    assert.strictEqual(userAfter, M, "user received M back");
    assert.strictEqual(vaultAfter + userAfter, N, "supply conserved across all transfers");
  });
});

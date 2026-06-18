import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

// SPL token transfer, proven WITHOUT @solana/spl-token.
//
// Everything below is built by hand: the program ID, the account layout sizes,
// and the instruction data (1-byte tag + little-endian u64 amounts). The only
// outside help is @solana/web3.js, which Anchor already depends on. If this test
// goes green, the SPL Token program accepted instructions I encoded from scratch.

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
// Rent sysvar. InitializeMint / InitializeAccount want it in the account list.
const RENT_SYSVAR_ID = new PublicKey(
  "SysvarRent111111111111111111111111111111111"
);

// Fixed on-chain sizes for the legacy Token program.
const MINT_LEN = 82;
const ACCOUNT_LEN = 165;

// --- hand-rolled instruction-data encoders ---------------------------------
//
// Tags come straight from the SPL Token instruction enum (in order):
//   0 InitializeMint, 1 InitializeAccount, 7 MintTo, 3 Transfer.

function u64le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

// InitializeMint { decimals: u8, mint_authority: Pubkey, freeze_option: u8 (0=None) }
function encodeInitializeMint(
  decimals: number,
  mintAuthority: PublicKey
): Buffer {
  return Buffer.concat([
    Buffer.from([0]),
    Buffer.from([decimals]),
    mintAuthority.toBuffer(),
    Buffer.from([0]), // freeze authority COption = None
  ]);
}

// InitializeAccount takes no data beyond the tag.
function encodeInitializeAccount(): Buffer {
  return Buffer.from([1]);
}

// MintTo { amount: u64 }
function encodeMintTo(amount: bigint): Buffer {
  return Buffer.concat([Buffer.from([7]), u64le(amount)]);
}

// Transfer { amount: u64 }
function encodeTransfer(amount: bigint): Buffer {
  return Buffer.concat([Buffer.from([3]), u64le(amount)]);
}

describe("spl token :: raw, no @solana/spl-token", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection: Connection = provider.connection;
  const payer = (provider.wallet as anchor.Wallet).payer;

  it("(0) confirms @solana/spl-token is genuinely absent from resolution", () => {
    // Walk up looking for a node_modules/@solana/spl-token. The point is to
    // prove I'm not quietly leaning on the lib. web3.js, by contrast, resolves.
    let found = false;
    let dir = __dirname;
    for (let i = 0; i < 6; i++) {
      const candidate = path.join(dir, "node_modules", "@solana", "spl-token");
      if (fs.existsSync(candidate)) {
        found = true;
        break;
      }
      dir = path.dirname(dir);
    }
    // require.resolve should also fail for the package.
    let resolvable = true;
    try {
      require.resolve("@solana/spl-token");
    } catch {
      resolvable = false;
    }
    console.log(
      `[finding] @solana/spl-token on disk: ${found}, resolvable: ${resolvable}`
    );
    assert.isFalse(found, "@solana/spl-token must not be installed");
    assert.isFalse(resolvable, "@solana/spl-token must not be resolvable");

    // Sanity: web3.js IS available (we imported it above without throwing).
    assert.ok(SystemProgram.programId, "web3.js must be present");
  });

  it("mints N, transfers M, conserves supply (N-M | M | sum=N)", async () => {
    const N = 1000n;
    const M = 350n;

    const mint = Keypair.generate();
    const accA = Keypair.generate();
    const accB = Keypair.generate();

    // Rent for each account class.
    const mintRent = await connection.getMinimumBalanceForRentExemption(
      MINT_LEN
    );
    const acctRent = await connection.getMinimumBalanceForRentExemption(
      ACCOUNT_LEN
    );

    // --- create + init the mint -------------------------------------------
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

    // --- create + init token accounts A and B -----------------------------
    function createAndInitAccount(acc: Keypair): TransactionInstruction[] {
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
          { pubkey: payer.publicKey, isSigner: false, isWritable: false }, // owner
          { pubkey: RENT_SYSVAR_ID, isSigner: false, isWritable: false },
        ],
        data: encodeInitializeAccount(),
      });
      return [create, init];
    }

    await provider.sendAndConfirm(
      new Transaction().add(...createAndInitAccount(accA)),
      [accA]
    );
    await provider.sendAndConfirm(
      new Transaction().add(...createAndInitAccount(accB)),
      [accB]
    );

    // --- mint N into A ----------------------------------------------------
    const mintToIx = new TransactionInstruction({
      programId: TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: mint.publicKey, isSigner: false, isWritable: true },
        { pubkey: accA.publicKey, isSigner: false, isWritable: true },
        { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // mint authority
      ],
      data: encodeMintTo(N),
    });
    await provider.sendAndConfirm(new Transaction().add(mintToIx), []);

    // --- transfer M from A to B ------------------------------------------
    const transferIx = new TransactionInstruction({
      programId: TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: accA.publicKey, isSigner: false, isWritable: true }, // source
        { pubkey: accB.publicKey, isSigner: false, isWritable: true }, // dest
        { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // owner of source
      ],
      data: encodeTransfer(M),
    });
    await provider.sendAndConfirm(new Transaction().add(transferIx), []);

    // --- assert via plain RPC, no spl-token lib --------------------------
    const balA = await connection.getTokenAccountBalance(accA.publicKey);
    const balB = await connection.getTokenAccountBalance(accB.publicKey);

    const a = BigInt(balA.value.amount);
    const b = BigInt(balB.value.amount);

    assert.strictEqual(a, N - M, "A holds N - M");
    assert.strictEqual(b, M, "B holds M");
    assert.strictEqual(a + b, N, "supply conserved: A + B == N");
  });
});

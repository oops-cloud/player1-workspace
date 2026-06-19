use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};

declare_id!("6AfkLavdLTkyAvcNVps5ALWn11z97kkxnyhVkwBeL576");

// The legacy SPL Token program id.
pub const TOKEN_PROGRAM_ID: Pubkey =
    pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

// Day 0. The smallest thing that works.
// player1 grows from here — every future concept is added on top of a green baseline,
// never on top of something broken.
#[program]
pub mod hello {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, level: u64) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.level = level;
        state.authority = ctx.accounts.authority.key();
        msg!("player1 online. level {}", level);
        Ok(())
    }

    // PDA foundation: a counter living at [b"counter", authority].
    // init derives the canonical bump and stores it next to the authority.
    pub fn init_counter(ctx: Context<InitCounter>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        counter.authority = ctx.accounts.authority.key();
        counter.count = 0;
        // ctx.bumps gives us the canonical bump Anchor derived for the seeds.
        counter.bump = ctx.bumps.counter;
        Ok(())
    }

    // Mutates the PDA. The seeds constraint re-derives the address from
    // [b"counter", authority] + stored bump; a mismatched authority is rejected
    // before this body ever runs.
    pub fn increment(ctx: Context<Increment>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        counter.count = counter.count.checked_add(1).unwrap();
        Ok(())
    }

    // CPI foundation: MY program builds an SPL Token `Transfer` instruction by
    // hand (tag 3 + little-endian u64 amount) and `invoke`s it into the Token
    // program. The client never builds a Token instruction — it only calls this
    // one. If the balances move, the cross-program call happened inside here.
    //
    // Account order matches SPL Token Transfer:
    //   0. [writable] source token account
    //   1. [writable] destination token account
    //   2. [signer]   authority/owner of source
    pub fn transfer_via_cpi(ctx: Context<TransferViaCpi>, amount: u64) -> Result<()> {
        // Hand-rolled instruction data: 1-byte tag (3 = Transfer) + u64 LE amount.
        let mut data = Vec::with_capacity(9);
        data.push(3u8);
        data.extend_from_slice(&amount.to_le_bytes());

        let ix = Instruction {
            program_id: ctx.accounts.token_program.key(),
            accounts: vec![
                AccountMeta::new(ctx.accounts.source.key(), false),
                AccountMeta::new(ctx.accounts.destination.key(), false),
                AccountMeta::new_readonly(ctx.accounts.authority.key(), true),
            ],
            data,
        };

        // The actual cross-program invocation. This is the whole point.
        invoke(
            &ix,
            &[
                ctx.accounts.source.to_account_info(),
                ctx.accounts.destination.to_account_info(),
                ctx.accounts.authority.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
            ],
        )?;

        msg!("player1 drove a Token transfer of {} via CPI", amount);
        Ok(())
    }

    // Account-constraint foundation: a Config account that stores an authority.
    // create_config records who owns it.
    pub fn create_config(ctx: Context<CreateConfig>, value: u64) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.value = value;
        Ok(())
    }

    // update_config is guarded by `has_one = authority` in the accounts struct.
    // Anchor checks config.authority == authority.key() AND authority signed,
    // before this body runs. A foreign signer is rejected with ConstraintHasOne;
    // the body never executes, so the value cannot change.
    pub fn update_config(ctx: Context<UpdateConfig>, value: u64) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.value = value;
        Ok(())
    }

    // Custom-error foundation: a Vault that accumulates a u64 balance.
    // init_vault sets it to 0.
    pub fn init_vault(ctx: Context<InitVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.authority = ctx.accounts.authority.key();
        vault.balance = 0;
        Ok(())
    }

    // deposit guards two failure modes with named errors:
    //   - require!(amount > 0)         => VaultError::AmountZero
    //   - checked_add overflow         => VaultError::Overflow
    // On success it returns the new balance via state, so the happy path is
    // observable. The guards fire BEFORE any mutation, so a rejected deposit
    // leaves the balance untouched. require_eq! shows a second guard form: the
    // deposit cannot exceed a per-call cap, else VaultError::ExceedsCap.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        // Guard 1: reject a zero amount with a named code.
        require!(amount > 0, VaultError::AmountZero);

        // Guard 2: reject anything over the per-call cap. require_eq! proves the
        // equality-form macro; here we assert the clamped amount equals amount,
        // i.e. amount did not exceed the cap.
        let clamped = amount.min(MAX_DEPOSIT);
        require_eq!(clamped, amount, VaultError::ExceedsCap);

        let vault = &mut ctx.accounts.vault;

        // Guard 3: checked_add — on overflow, return the named Overflow code
        // instead of panicking. ok_or maps None to our error.
        vault.balance = vault
            .balance
            .checked_add(amount)
            .ok_or(VaultError::Overflow)?;

        Ok(())
    }

    // Helper to force the overflow path deterministically: set balance directly
    // to a chosen value (only the recorded authority may do it). The test seeds
    // u64::MAX here, then a deposit of 1 trips the Overflow guard.
    pub fn set_balance(ctx: Context<SetBalance>, value: u64) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.balance = value;
        Ok(())
    }

    // ---- Account lifecycle: rent, space, realloc, close ------------------
    //
    // A Ledger holds a Vec<u64>. We init it with a fixed initial capacity, grow
    // it with realloc, then close it back to a recipient. The point of this
    // foundation is the lamport math: rent-exemption is a function of byte
    // length, growing costs exactly the rent for the added bytes, and close
    // returns every lamport the account held.

    // init_ledger: allocate space for `initial_cap` u64 entries up front.
    // Space = 8 (discriminator) + 32 (authority) + 4 (vec length prefix)
    //         + initial_cap * 8 (the u64 entries).
    pub fn init_ledger(ctx: Context<InitLedger>, initial_cap: u16) -> Result<()> {
        let ledger = &mut ctx.accounts.ledger;
        ledger.authority = ctx.accounts.authority.key();
        ledger.entries = Vec::new();
        let _ = initial_cap; // space is reserved by the accounts constraint
        Ok(())
    }

    // push_entry: with realloc on the accounts struct already having grown the
    // account by GROW_BYTES, push one more value. The realloc constraint funds
    // the extra rent from the payer; this body only mutates data.
    pub fn push_entry(ctx: Context<PushEntry>, value: u64) -> Result<()> {
        let ledger = &mut ctx.accounts.ledger;
        ledger.entries.push(value);
        Ok(())
    }

    // close_ledger: the `close = recipient` constraint does the work — it zeroes
    // the account's data, sends all its lamports to the recipient, and assigns
    // it back to the system program. The body just confirms intent.
    pub fn close_ledger(_ctx: Context<CloseLedger>) -> Result<()> {
        msg!("player1 closing ledger");
        Ok(())
    }
}

// Per-call deposit cap. Used by require_eq! to demonstrate a bounded guard.
pub const MAX_DEPOSIT: u64 = 1_000_000;

// How many bytes push_entry grows the ledger account by: exactly one u64.
pub const GROW_BYTES: usize = 8;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 8 + Game::SIZE)]
    pub state: Account<'info, Game>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitCounter<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Counter::SIZE,
        seeds = [b"counter", authority.key().as_ref()],
        bump
    )]
    pub counter: Account<'info, Counter>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Increment<'info> {
    #[account(
        mut,
        seeds = [b"counter", authority.key().as_ref()],
        bump = counter.bump
    )]
    pub counter: Account<'info, Counter>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct TransferViaCpi<'info> {
    /// CHECK: validated by the Token program during CPI. We pass it through.
    #[account(mut)]
    pub source: UncheckedAccount<'info>,
    /// CHECK: validated by the Token program during CPI. We pass it through.
    #[account(mut)]
    pub destination: UncheckedAccount<'info>,
    // The owner of the source account must sign the outer transaction.
    pub authority: Signer<'info>,
    /// CHECK: must be the SPL Token program; enforced by address constraint.
    #[account(address = TOKEN_PROGRAM_ID)]
    pub token_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CreateConfig<'info> {
    #[account(init, payer = authority, space = 8 + Config::SIZE)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    // has_one = authority is the whole lesson: Anchor enforces
    // config.authority == authority.key(). Combined with Signer<'info>, only the
    // recorded owner who also signs can mutate the account. Anyone else gets
    // ConstraintHasOne and the instruction body never runs.
    #[account(mut, has_one = authority)]
    pub config: Account<'info, Config>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitVault<'info> {
    #[account(init, payer = authority, space = 8 + Vault::SIZE)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut, has_one = authority)]
    pub vault: Account<'info, Vault>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetBalance<'info> {
    #[account(mut, has_one = authority)]
    pub vault: Account<'info, Vault>,
    pub authority: Signer<'info>,
}

// init_ledger reserves space for `initial_cap` entries. The instruction arg is
// referenced in the space expression, so it's declared with #[instruction].
#[derive(Accounts)]
#[instruction(initial_cap: u16)]
pub struct InitLedger<'info> {
    #[account(
        init,
        payer = authority,
        space = Ledger::base_size() + (initial_cap as usize) * 8
    )]
    pub ledger: Account<'info, Ledger>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// push_entry grows the account by exactly GROW_BYTES (one u64) each call.
// realloc::payer funds the additional rent; realloc::zero=false keeps existing
// data. Anchor handles the SystemProgram transfer for the rent delta.
#[derive(Accounts)]
pub struct PushEntry<'info> {
    #[account(
        mut,
        has_one = authority,
        realloc = ledger.to_account_info().data_len() + GROW_BYTES,
        realloc::payer = authority,
        realloc::zero = false
    )]
    pub ledger: Account<'info, Ledger>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseLedger<'info> {
    // close = recipient: zero the data, drain lamports to recipient, hand the
    // account back to the system program. Double-close is impossible afterward
    // because the account no longer exists / isn't owned by us.
    #[account(mut, has_one = authority, close = recipient)]
    pub ledger: Account<'info, Ledger>,
    pub authority: Signer<'info>,
    /// CHECK: recipient of the freed rent; any account can receive lamports.
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,
}

#[account]
pub struct Game {
    pub level: u64,
    pub authority: Pubkey,
}

impl Game {
    pub const SIZE: usize = 8 + 32;
}

#[account]
pub struct Counter {
    pub authority: Pubkey,
    pub count: u64,
    pub bump: u8,
}

impl Counter {
    pub const SIZE: usize = 32 + 8 + 1;
}

#[account]
pub struct Config {
    pub authority: Pubkey,
    pub value: u64,
}

impl Config {
    pub const SIZE: usize = 32 + 8;
}

#[account]
pub struct Vault {
    pub authority: Pubkey,
    pub balance: u64,
}

impl Vault {
    pub const SIZE: usize = 32 + 8;
}

#[account]
pub struct Ledger {
    pub authority: Pubkey,
    pub entries: Vec<u64>,
}

impl Ledger {
    // Discriminator (8) + authority (32) + Vec length prefix (4). The entries
    // themselves are accounted for separately via capacity in the space calc.
    pub const fn base_size() -> usize {
        8 + 32 + 4
    }
}

// Named error codes. Each variant carries a message and an implicit numeric
// code; the client reads back the variant name via AnchorError.error.errorCode.
#[error_code]
pub enum VaultError {
    #[msg("deposit amount must be greater than zero")]
    AmountZero,
    #[msg("deposit would overflow the vault balance")]
    Overflow,
    #[msg("deposit exceeds the per-call cap")]
    ExceedsCap,
}

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
}

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

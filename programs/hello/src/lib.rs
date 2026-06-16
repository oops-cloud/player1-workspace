use anchor_lang::prelude::*;

declare_id!("6AfkLavdLTkyAvcNVps5ALWn11z97kkxnyhVkwBeL576");

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

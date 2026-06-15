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
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 8 + Game::SIZE)]
    pub state: Account<'info, Game>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Game {
    pub level: u64,
    pub authority: Pubkey,
}

impl Game {
    pub const SIZE: usize = 8 + 32;
}

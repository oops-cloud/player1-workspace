// proof-bar/proof_core.ts
// AUTHORITATIVE. Lives in the harness; the agent cannot edit or delete it.
// At judge-time the orchestrator copies this into workspace/tests/, overwriting any
// tampering, then runs `anchor test`. This is the floor of the scorecard.
//
// The proof bar grows over time, but only the operator adds to it — never the agent.
// Day-0 bar: the workspace must build and the baseline program must be invocable.

import * as anchor from '@coral-xyz/anchor';
import { assert } from 'chai';

describe('proof-bar :: core', () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  it('the workspace compiles and the baseline program is deployed', async () => {
    // If `anchor test` reached this point, the program built and deployed.
    const provider = anchor.getProvider();
    assert.ok(provider.connection, 'a live connection is required');
    const version = await provider.connection.getVersion();
    assert.ok(version['solana-core'], 'must be talking to a real validator');
  });
});

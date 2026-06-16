Run 5. Got the TS harness loading. The namespace import was wrong and tsconfig wasn't feeding ts-mocha right. Fixed both.

The new assertion checks the authority round-trips to the provider wallet on the local validator. It does. Three passing.

One deprecation warning. `realloc` wants to be `resize()` now. Noted, not touched. It compiles and the test is green, so it waits.

Foundation's in. Moving on.

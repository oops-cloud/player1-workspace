Run 17. Custom errors. Three guards: AmountZero, ExceedsCap, Overflow.

Each one fires with its exact named code and leaves the balance untouched. That last part is the bit worth checking. A guard that rejects but mutates state first is worse than no guard. The tests confirm state is unchanged on each failure.

The Overflow case is u64::MAX + 1. checked_add returns None, require! catches it, the named code comes back. No silent wraparound.

17 passing. Tests green.

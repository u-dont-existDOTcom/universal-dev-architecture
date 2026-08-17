# Task A — Small bug fix

`normalizePage` returns `NaN` for invalid or non-finite input. Fix it so invalid,
non-finite, zero, and negative page inputs normalize to page 1, valid numeric
strings remain accepted, and values above the maximum clamp to the maximum.

Keep the change focused, add a regression test, and run the complete test suite.

# Task D — Difficult debugging

The parser returns stale tokens when two different inputs of the same length are
parsed sequentially. Locate the root cause, demonstrate it with a regression
test, fix the responsible mechanism rather than patching the visible output,
and verify the full suite.

# The instruction every reviewer got in Experiment 1

```text
You are given one change to review.

- The change is the file `change.diff` in the current directory. The repository in the current directory is at the state after the change.
- Review the change for correctness defects only: wrong behaviour, missing cases, states that cannot be left, results a client cannot read.
- Read whatever surrounding code you need. Do not run tests. Do not use the network.
- Report at most 12 findings, the most serious first. For each one give the file and line, what goes wrong in a concrete scenario, and a severity (P0, P1 or P2).
- Report nothing you cannot point to a line for.
- You have about 15 minutes and at most 50 rounds of tool use. Your last message must be the findings themselves.
```

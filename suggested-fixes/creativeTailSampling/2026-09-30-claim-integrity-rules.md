# Decide on claim-integrity rules for the Creative Tail Sampling protocol

- For: `u-dont-existDOTcom/creativeTailSampling`
- Filed: 2026-09-30, by the Claude session maintaining this architecture's rules
- From: this architecture's claim-integrity pack, `portable/claim-integrity/CHECKS.md`
- Owner request: no. The pack is required only in the owner's declared public apps (`portable/PUBLIC-APPS.json`), and this repository isn't one. On 2026-09-28 the owner said the pull request did not need to be undone.
- Existing pull request: https://github.com/u-dont-existDOTcom/creativeTailSampling/pull/8
- Supersedes: none

## What to do

Pull request #8 adds claim-integrity rules to the Creative Tail Sampling protocol. It merges cleanly today. Decide with your other fixes: merge it, keep only what the protocol doesn't already cover, or close it with a reason.

Record the outcome in `docs/suggested-fixes-ledger.md`.

## Why

When the protocol reports on sources or on the texts it samples, the rules keep those claims tied to passages that were checked and keep quotation marks for exact words.

## Check first

- Whether the protocol's own rules already cover these checks.
- Whether the added text changes the protocol's outputs in a way that makes earlier and later runs differ.

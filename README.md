# csv-reader-21nov-b

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/prellxz-gm/csv-reader-21nov-b/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/prellxz-gm/csv-reader-21nov-b/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

Line-Fast: a faster drop-in for make.fun's csv-reader 1.0.0. It answers exactly as csv-reader does on every input, and reads broken CSV files faster by taking a record-level fast path: plain records with no quotes and no stray carriage returns are split with native indexOf/split, while any record holding a quote or a stray CR falls back to a careful scanner that reproduces csv-reader's broken-row policy exactly (stray_cr, unterminated_quote, quote_junk, short_row, long_row).

## Run it

```sh
MAKEFUN_INPUT_DIR=<input-dir> MAKEFUN_OUTPUT_DIR=<output-dir> node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=jyrqfb5w&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>

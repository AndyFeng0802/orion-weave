# Orion Weave — public edition

Find the threads between ideas. 在浩瀚文獻中，看見知識的連結。

This repository contains the public introduction page and a separate **read-only interactive demo**. The full research edition is maintained locally in a separate directory and is not part of this repository.

- Introduction: https://andyfeng0802.github.io/orion-weave/
- Demo: https://andyfeng0802.github.io/orion-weave/demo/

## What the demo includes

Topic circles scaled by supported sample counts; 2023–2026 annual breakdowns; recursive topic / technique / method / architecture expansion; search; zoom and pan; inspectable topic-pair evidence. Counts and links use only the included arXiv sample. They are not whole-library totals or citation links, and metadata evidence is not full-text verification.

## What stays local

The full edition retains arXiv + IEEE source records, collection scripts, private API configuration, complete audit trails, uncertain assignments, JSON/CSV import and export, and the offline single-file edition. None of those local-only files should be copied into this repository.

The public app has no file upload/download controls, CSV import, API-key fields, backend, telemetry, or live API collection. Displayed frontend content can still be saved; this is not a copy-protection mechanism.

## Data and licensing

The compact snapshot contains only arXiv descriptive metadata under CC0 1.0 plus Orion Weave topic classifications. It excludes IEEE records and counts, full abstracts, full-text PDFs, raw query/audit payloads, and private configuration. Supported evidence excerpts are retained for traceability. See [DATA_NOTICE.md](DATA_NOTICE.md) for scope and licensing sources.

## Structure

```text
index.html        Project introduction
.nojekyll         Buildless GitHub Pages configuration
demo/             Self-contained read-only application and compact snapshot
DATA_NOTICE.md    Data scope, provenance and licensing
check_public.mjs  Public artifact validation
package.json      Validation commands; no dependencies
```

## Local preview and validation

```sh
npm test
python3 -m http.server 8767 --bind 127.0.0.1
```

Open http://127.0.0.1:8767/demo/ . No dependency installation is needed.

## Updates and publication

Generate a new public snapshot with `scripts/build_public_snapshot.py` in the **full local edition**, targeting this repository's `demo/dataset.json`. That builder uses an explicit arXiv-only field allowlist and is tested against the full edition's arXiv-supported graph. Never copy the full edition's dataset or standalone HTML into this repository. Run `npm test`, review the diff, and publish only this repository.

GitHub Pages serves the `main` branch from `/ (root)`. The introduction and `/demo/` are independent pages. Updating the public repository does not change the local full edition.

Thank you to arXiv for use of its open access interoperability. Orion Weave is an independent project, not affiliated with or endorsed by arXiv or IEEE.

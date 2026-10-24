# Orion Weave

**Find the threads between ideas.**  
在浩瀚文獻中，看見知識的連結。

This repository contains the public introduction page for Orion Weave, a non-commercial research prototype for exploring thematic relationships in scientific literature from 2023–2026.

The application represents topics as circles whose areas reflect paper counts. Users can inspect annual counts and recursively explore topics, techniques, methods, and architectures. Technical refinements have dashed boundaries. Relationships describe taxonomy and sampled thematic co-occurrence, not citation links.

An arXiv snapshot is implemented. IEEE Xplore Metadata Search API access is pending. The application currently runs locally. This repository contains only the description page: no research dataset, API credentials, or application backend.

## Preview

Open `index.html` in a browser. It is a self-contained page with inline styles and SVG, no external assets, and no tracking.

## GitHub Pages configuration reference

The site requires no build step. Its files are served from the root of the default branch, with `.nojekyll` bypassing Jekyll processing.

The intended repository configuration is **Settings → Pages → Build and deployment → Deploy from a branch**, using the default branch and **/ (root)**. GitHub's Pages settings show the actual URL and deployment status.

A project repository usually receives `https://<username>.github.io/<repository>/`. The deployed, verified URL can be used in an API application.

## Source documentation

- [arXiv API](https://info.arxiv.org/help/api/index.html)
- [IEEE Xplore API](https://developer.ieee.org/docs)

Source names identify intended data providers and do not imply affiliation or endorsement.

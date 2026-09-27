# The Future of Crowd Work, revisited — CrowdCamp 2026

Material from the CrowdCamp 2026 team revisiting *The Future of Crowd Work* (Kittur et al., CSCW 2013), which itself came out of a CrowdCamp.

| Folder | What it holds |
| --- | --- |
| `transcripts/` | Transcripts of the team's working sessions. |
| `wall/` | The *Future of Crowd Work* wall: printable dot-voting sheets, one per research area (the 12 from 2013 plus governance), each asking whether the 2013 vision happened, was changed by AI, or is still open, and a closing “What’s missing?” sheet. HTML source and PDF. |
| `journeys/` | **Tokens of the Future**, a Cloudflare Pages app that routes attendees through HCOMP + CI 2026 (Sep 28–30) by research area and collects their notes on talks. See [`journeys/README.md`](journeys/README.md). |

## Quick start (journeys)

```sh
cd journeys
npm install
npx wrangler d1 migrations apply crowdwork-journeys --local
npx wrangler pages dev --port 8792
```

Local secrets go in `journeys/.dev.vars` (`ADMIN_TOKENS`, `SESSION_SECRET`, `DEV_BYPASS`), which is not committed. Generate admin tokens with `node build/make-admin-tokens.mjs` (see `journeys/README.md`).

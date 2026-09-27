# Crowd Work Journeys

Pick one of the 12 research areas from *The Future of Crowd Work* (Kittur et al., CSCW 2013), plus governance, and get a route through HCOMP + CI 2026 (Sep 28–30).

- `site/` is the static site to deploy (`index.html`, `app.js`, `styles.css`, `data.json`).
- `build/` holds the program export, the 13 topics and the topic tags.
- `print/` holds the flyer (US Letter) and the poster (24×36 in), each with a QR code.

## Change topic matches

Edit `build/tags.json` (program content id → topic keys, strongest first), then:

```sh
python3 build/build.py
```

To refresh the program from SIGCHI first:

```sh
curl -sL https://files.sigchi.org/conference/program/CI/2026 -o build/program.json
```

## Sign-in

A splash page asks for **name, affiliation, and an email or phone number** (with a country picker), plus an optional follow-up consent. Ported from the computational-diplomacy workshop app (Tsinghua SEM, Geneva, 9 Sept 2026):

- The contact is the identity: the same email or number on another device signs back in. National and international phone forms (`079…`, `+41 79…`, `0041 79…`) are one person. Contacts are not verified, which is the accepted limit of a no-password tool.
- A signed, HttpOnly session cookie lasts five days. IPs are stored only as keyed hashes.
- “Your details” lets people sign out, or erase themselves by typing their name: name, affiliation and contact are deleted; notes stay as “Anonymous”.
- `site/privacy.html` describes exactly this. **Before launch, fill in the organizer contact and confirm the retention date (31 March 2027).**

## Notes from attendees

People add a comment, question or criticism to any talk, poster or panel. The form follows *Nudge for Deliberativeness* (Menon, Zhang & Perrault, CHI 2020; PDF in `build/refs/`):

- **Partitioned text fields**: point, why, and evidence from the talk, each with a sentence opener. Only the first is required. Stored separately (`point`, `why`, `evidence`).
- **Word-count anchor**: a live bar under the fields (fills at 120 words, no limit, no instruction to fill it).
- **No social-judgment prompts before writing**: the paper's reply-choice prompt reduced writing, likely through fear of evaluation. Notes are signed with a **pseudonym**, never a name.

### Pseudonyms

Everyone gets a random pseudonym at sign-up, kept across devices: 20 adjectives × 15 nouns = 300 HCOMP + CI themed names (“Calibrated Starling”, “Gold-Standard Oracle”, “Stigmergic Termite”), in `functions/api/_pseudos.js`. After 300, a number is added. Other attendees see only the pseudonym; names and affiliations appear in the console for admins, and contacts for the super admin only. Erasing your details removes the pseudonym too.

Each note also records how the talk relates to the topic (came true / AI changed it / still open / not related) and, optionally, when the person expects to live in that future: a slider from “already happened” to 5 years, with a short reason. Choosing “It came true” moves the slider to “already happened”. Each topic page summarizes the answers.

- Rate limits: 8 notes per person and 200 per network every 10 minutes (venue Wi-Fi shares one IP).
- Export notes with authors: `curl -H "Authorization: Bearer $MY_TOKEN" https://<site>/api/admin`
- Export participants (contacts for the super admin only): `curl -H "Authorization: Bearer $MY_TOKEN" "https://<site>/api/admin?table=participants"`
- Hide a note: `curl -X POST -H "Authorization: Bearer $MY_TOKEN" -d '{"id": 12}' https://<site>/api/admin`

## Feedback on the app

**Admins only.** When an admin opens `/console` with their token, the server sets an admin cookie, and a **Feedback** button then appears on every page of the app in that browser (until they lock the console). It opens `#feedback`: pick Bug, Idea, Wording or Other, write what should change, and it is saved with the admin's email, the page they came from and their screen size. Admins see the whole list, most +1s first, and can +1 items (one per admin, click again to undo). Participants who open `#feedback` are told it is for the organizing team, and the API refuses them. The cookie records which token it came from, so rotating `ADMIN_TOKENS` signs everyone out.

- Export: `curl -H "Authorization: Bearer $MY_TOKEN" "https://<site>/api/admin?table=feedback"`
- Set a status (shown to everyone): `curl -X POST -H "Authorization: Bearer $MY_TOKEN" -d '{"feedback_id": 3, "status": "planned"}' https://<site>/api/admin` (open, planned, done, wontfix)

## Organizer console

`/console` shows feedback, notes and participants as tables. Set feedback status from a dropdown, hide or restore notes, filter rows, and download each table as CSV. The page is `noindex`.

### Admins and tokens

Each admin has a **personal token** and a role:

| Role | Can see and do |
| --- | --- |
| `admin` | Feedback and statuses, notes and hide/restore, participants' names, affiliations and follow-up consent |
| `super` | All of the above, plus participants' email and phone numbers (console and CSV) |

The server keeps only the SHA-256 of each token, in the `ADMIN_TOKENS` secret (JSON list of `{email, role, hash}`), and enforces roles itself. Generate or rotate all tokens at once; old ones stop working when the new secret is set:

```sh
node build/make-admin-tokens.mjs super:<you> admin:<colleague> admin:<colleague>
npx wrangler pages secret put ADMIN_TOKENS --project-name crowdwork-journeys < admin-tokens.secret.json
# hand each person their line from admin-tokens.local.txt, then delete both files
```

Add `--dev` to write local tokens into `.dev.vars` instead. Both files are git-ignored. Admin emails are kept out of the repo on purpose.

Optional extra layer: put `/console` and `/api/admin*` behind **Cloudflare Access** (Zero Trust → Access → Applications, one-time PIN to the admins' emails), then set `ACCESS_TEAM_DOMAIN` (e.g. `yourteam.cloudflareaccess.com`) and `ACCESS_AUD` (the application's audience tag). The server verifies Access's signed JWT and maps the email to the same list and role.

## Theme

The look follows the light content area of the SIGCHI program app (programs.sigchi.org/ci/2026): white header and cards on a pale page, accent `#497CFF`, a coloured stripe per session type. The site, the organizer console and the privacy notice all share `site/styles.css`, and stay light when the device is in dark mode.

All colours live in the `:root` block at the top of `site/styles.css`, in two layers:

- `--sigchi-*`: SIGCHI's own token names and values, copied from its light theme. Look up a missing one in the program app's stylesheet (for example `--sigchi-color-label-purple-surface`) and add it here under the same name.
- Semantic tokens (`--paper`, `--surface`, `--ink`, `--muted`, `--rule`, `--now`, `--danger`, …): what the components use. Each points at a `--sigchi-*` token, or holds our own value where SIGCHI has none (`--then`, `--ink-2`, `--match`).

To retune the look, edit that block; the component rules below it contain no raw colours.
Screenshots of the program app look purple on some Macs because they are saved in the display's colour profile. Convert to sRGB before sampling a colour, or read the value from SIGCHI's stylesheet.

## Preview locally (site and API)

```sh
npm install
npx wrangler d1 migrations apply crowdwork-journeys --local
npx wrangler pages dev --port 8792
```

Local secrets are in `.dev.vars` (`ADMIN_TOKENS`, `SESSION_SECRET`, `DEV_BYPASS`).

### Local bypass for checking pages

With `DEV_BYPASS=1` in `.dev.vars`, and only on `localhost` / `127.0.0.1`:

- `/api/dev/login?next=%23platforms` signs you in as “Demo Visitor” and opens that page (any `#topic`, `#feedback`, `#me`).
- `/console?dev` opens the console without the token.
- `/api/dev/seed` adds three demo people with notes and feedback (runs once).

Both conditions are checked on the server (`devBypass()` in `functions/api/_lib.js`), and `.dev.vars` is never deployed, so none of this works on pages.dev.

Tests, with the local server running:

```sh
node build/tests/api-smoke.mjs     # 44 API checks: sign-in, pseudonyms, notes, erase, admin-only feedback, roles (needs admin-tokens.local.txt from --dev)
node build/tests/ui-shots.mjs      # phone-width screenshots into build/tests/shots/
node build/tests/console-shot.mjs  # console screenshots (needs DEV_BYPASS)
node build/tests/notes-shot.mjs    # what attendees see on a talk's notes
```

## Deploy to Cloudflare Pages (when ready)

```sh
npx wrangler login
npx wrangler d1 create crowdwork-journeys          # paste the database_id into wrangler.toml
npx wrangler d1 migrations apply crowdwork-journeys --remote
npx wrangler pages project create crowdwork-journeys --production-branch main
node build/make-admin-tokens.mjs super:<you> admin:<a> admin:<b>
npx wrangler pages secret put ADMIN_TOKENS --project-name crowdwork-journeys < admin-tokens.secret.json
npx wrangler pages secret put SESSION_SECRET --project-name crowdwork-journeys   # a long random string
npx wrangler pages deploy
```

If `crowdwork-journeys.pages.dev` is taken or you pick another name, rebuild the QR codes with the real URL:

```sh
python3 print/build_print.py https://<your-project>.pages.dev
```

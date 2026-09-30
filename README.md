# The Future of Crowd Work, revisited — CrowdCamp 2026

Material from the CrowdCamp 2026 team revisiting *The Future of Crowd Work* (Kittur et al., CSCW 2013), which itself came out of a CrowdCamp.

**Status: not run.** The team decided not to run the experiment at the conference. The app was retired on 30 September 2026: its Cloudflare project and database were deleted. The code and materials stay here as a record of the design and as a starting point for anyone who wants to run something similar.

## Aims

The team (Brian McInnis, Thomas Maillart, Tony Li) set out to:

1. **Take stock of a 2013 vision.** Read *The Future of Crowd Work* again, area by area, and ask what came true, what AI changed, and what is still open thirteen years later.
2. **Use the conference as a mission.** Spend three days at HCOMP + CI 2026 (Alexandria, VA, 28–30 September) doing something operational with the researchers on site: generate questions, give people reasons to talk to each other, and collect their judgments.
3. **Add what 2013 left out.** Governance and the social contract become a thirteenth area next to the original twelve.
4. **Be good requesters.** Treat attendees as the crowd and the team as their requesters, and hold ourselves to what crowd workers asked of academic requesters.

## The reflection behind it

**What happened to the 2013 vision.** Kittur et al. pictured crowd work as complex, creative and fulfilling: tasks divided into meaningful sequences, guilds with mentorship, fair and transparent labor markets. In practice crowd work stayed at micro-tasks. The market built around some of those ideas fell apart over politics, fairness and transparency; worker tools such as Turkopticon have few contributors left; and machine learning absorbed many of the original tasks. Requesters invested in replacing people more than in the careers the paper hoped for. MTurk itself sunsets on 30 September 2026, the last day of the conference. The team wanted to learn from that before writing a new, equally hopeful agenda that could stall the same way: stay forward-looking and hopeful, without being utopian.

**What changed with generative AI.** Our working sessions (in `transcripts/`) kept returning to a few observations:

- *Humans are needed where technology fails.* Bug bounty programs show people finding what automated systems miss. AI still gets software "70 to 80% of the way", and someone has to catch failures, steer, and decide what makes sense. Teams also need ways to calibrate their trust in AI output when there is too much of it to check.
- *One person can now match a team.* Hackathon data on GitHub suggests that individuals with agentic AI reach the productivity of small groups. That is enabling, and it also raises the question of why people should still work together, which was the heart of the 2013 paper.
- *What is the technology for?* A technology that does not serve people, and people together, makes little sense. The economics are unsettled too: tokens are priced below their cost, and a correction, regulation or environmental pushback could change who can afford to oversee AI.
- *Governance and the social contract.* Rousseau wrote the social contract in and about Geneva, at a time when technology and the environment seemed steady. Both now change within a few years. Civil engineers assess a bridge's impact on society and the environment before building it; software, far more powerful, has few such guardrails. If engineering gets easier, more human effort will go into governing: deciding together, reviewing, organizing.
- *Collective action as a counterweight.* Workers in the 19th century changed their conditions once they organized. Crowd workers, and everyone who works beside AI, may need new forms of collective action to keep powerful technology in the service of people.
- *Doubt.* Enthusiasm alone will not get us there. Doubting the technology, and our relationship to it, is what makes the thinking stronger.

These threads became the questions of the thirteen areas. Each question opens with a finding from a paper or panel in this year's program (for example, "Fluent AI explanations lead moderators to follow the AI even when it errs. Who catches AI failures, and how do teams calibrate trust?"), so that attendees meet the question in the talk that raised it.

## The operational crowdsourcing aim

The plan was to turn the conference into a small, live crowdsourcing exercise, with attendees as the crowd:

- **Tasks.** An attendee picks one of the thirteen areas and gets a route through the program: the talks, posters and panels that match it. At each stop the task is a short note on the talk: the point, why it matters, and evidence from the talk, in separate fields with a word-count bar, a design taken from research on deliberative writing (Menon, Zhang & Perrault, CHI 2020).
- **Judgments.** Every note also records how the talk relates to the 2013 vision (came true, AI changed it, still open, not related) and when the writer expects to live in that future, from "already happened" to "more than five years" or "never". Topic pages aggregate the answers as the conference goes on, so participants see the results while they contribute.
- **The wall.** In the room, printed dot-voting sheets (`wall/`) ask the same question for each area, plus "What's missing?", for people who prefer paper.
- **Output.** A crowdsourced picture of where crowd work stands in the age of AI, area by area, with the reasoning behind each judgment, to feed the team's revisit of the 2013 paper.
- **Obligations.** Following the Dynamo guidelines for academic requesters (Salehi et al., CHI 2015), the privacy notice says who runs the project, what the task is for, how long it takes and what participants get (no pay; a route and the results shown back). No work is rejected, and anyone can leave and erase their details at any time. Access is by a personal token sent on the conference Slack; nothing personal is asked, notes are signed with pseudonyms, and the token list was to be deleted by 31 March 2027.

The app itself, how it works and how to deploy it are described in [`journeys/README.md`](journeys/README.md).

## What's here

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

## License

The code is released under the [MIT License](LICENSE). Third-party material keeps its own terms: the CHI 2026 program data in `journeys/build/program.json` and `journeys/site/data.json` comes from SIGCHI under CC BY-NC-SA 4.0, and the paper in `journeys/build/refs/` belongs to its authors.

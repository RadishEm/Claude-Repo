# Lagos Life: how the earning tasks work, plus a proposed automation

Explored 2026-10-03 as `@ricky`, signed in with headless Chromium through Playwright.
This was read-only: I didn't click work, claim, buy, bet, top-up or send. Screenshots are in `screenshots/`.

## The big caveat

Lagos Life is a life-sim game. Its ₦ is **play money**. The app says so itself:
*"Just for fun: Lagos Life money can't be withdrawn."* Real money can only go **in**,
through "💳 Top up wallet" (`/api/wallet/checkout`, which sells coin packs). Nothing comes out.
The account also has one **pending top-up checkout** (`/api/wallet/pending` →
`topups: ["chk_…"]`) that someone started earlier. I left it alone.

## How game time works

The game clock is **Lagos wall-clock time (WAT, UTC+1), running at real speed**.
In the code, game minutes are counted from `2023-12-30T23:00Z`, and the days follow the real calendar.
So anything that unlocks "at 08:00 in game" unlocks at 08:00 in Lagos (07:00 UTC).

## Earning sources

| Source | Free? | When it unlocks | Pays | How you complete it |
|---|---|---|---|---|
| **Job shift** (current job: Teaching, *Lesson Teacher*) | Yes. Costs ₦150 transport per shift. | Once per game day, on work days. Teaching runs **Mon–Fri**. Auto-start window is **08:00–14:00 Lagos**; a manual start works 06:00–22:00 on a work day. Resets at midnight Lagos. | **₦3,000** per shift at level 1. Promotions raise it: ₦6,300 → ₦12,000 → ₦21,000 → ₦42,000. | The sim travels to the job's venue (The Library) and works **60 game minutes, which is 60 real minutes**. With **"Go automatically"** on in Phone → Jobs (it already is), the game sends the sim by itself whenever the page is open inside the window. |
| **Daily gem hunt** 💎 | Yes | Fixed time: a new gem every day at **00:00 Lagos**. The HUD shows a countdown ("New gem in 1h 9m"). | Depends on finishing rank. You got **₦3,000** today at rank #24,257. The API returns `nextReward` for the next finder. | 1. `GET /api/hunt` gives a riddle clue (today: *"Lekki's big shopping house, cold AC and all."*). 2. Move the sim to that venue. 3. When `here: true`, a claim button appears. 4. Tapping it sends `POST /api/hunt`. |
| Spray pickups ("money on the floor") | Yes | Not scheduled. Happens when another player sprays cash at a party you're at. | Varies | Tap notes within 60 seconds. Not schedulable. |
| Family "claim" | n/a | Runs automatically on every page load (`POST /api/family {"action":"claim"}`) | Money other players sent you | Nothing to do |
| Governor's allowance | No | Only if you win the weekly election | ₦25,000/day | Not a free task |
| Businesses, Invest, LagosBet, Sea Plots, Houses | No | n/a | n/a | These cost money or are bets. Excluded. |
| Salary Index, Games, Nollywood, etc. | n/a | n/a | n/a | Sponsored links to outside sites, not tasks |

Other money facts: weekly rent is ₦6,000, due Saturday. Income tax is 0% on the first ₦1,000,000 of pay per week.
The first page shows ₦47,550 balance, ₦63,100 earned today and a net worth of ₦119k.

So there are **two free, schedulable tasks**: the weekday **job shift** and the **daily gem hunt**.

## Proposed skill: `lagoslife-free-tasks`

`.claude/skills/lagoslife-free-tasks/` containing:

- `SKILL.md`: when to use it, the guardrails below, and how to run each mode.
- `scripts/lagoslife.js`: a Playwright script with two modes:
  - `--mode gem`
    1. Log in from the env vars and press **Continue**.
    2. Call `GET /api/hunt`. If `mine` is already set, exit with "already found".
    3. Otherwise, print the clue and the venue list. Claude matches the riddle to a venue, which needs judgement because clues are riddles.
    4. Move the sim there with **Map → venue** (walking on the free road, never a paid Ride).
    5. Poll until `here: true`, then press the gem claim button.
    6. Report the rank and reward.
  - `--mode shift`
    1. Log in and press **Continue**.
    2. Check that it's a work day, the shift isn't already done, and "Go automatically" is on.
    3. Keep the page open until the game starts the shift and the 60-minute shift finishes. Max 75 minutes.
    4. Report the pay from the in-game notice and the Bank screen.
- `scripts/launch-chromium.js`: the browser launcher from this exploration (`launch-chromium.js` here). In this sandbox, Chromium only trusts the proxy's interception CA through an SPKI pin. Normal certificate checks stay on.

### Guardrails (enforced in code, not just in the prompt)

- **Request allowlist.** `page.route` aborts any non-GET request except:
  - `/api/auth/login`
  - `/api/save`
  - `/api/world`
  - `/api/visit`
  - `/api/family` with `{"action":"claim"}`, which the app sends by itself
  - `POST /api/hunt`
- **Always blocked:**
  - `/api/wallet/*`, `/api/ads` (POST), `/api/send`, `/api/bail`, `/api/sea`, `/api/gov/*`
  - LagosBet and any buy, purchase or top-up flows
- The script never clicks "Top up wallet", "Switch to this job", "Quit job", Buy, Ride or Chowdeck.
- The password comes only from `LAGOSLIFE_PASSWORD`. It's never logged, and it's masked out of any page-text dumps.
- The session cookie is written only to the run's temp directory, never to the repo.

## Proposed Routines

Each Routine starts a fresh session in this same environment, which already has the `LAGOSLIFE_*` env vars:

| Routine | Cron | Why |
|---|---|---|
| **Lagos Life gem hunt** | `CRON_TZ=Africa/Lagos 5 0 * * *` | Shortly after the gem resets at midnight. Earlier finders get a better rank, and possibly more pay. |
| **Lagos Life work shift** | `CRON_TZ=Africa/Lagos 52 8 * * 1-5` | Inside the Mon–Fri 08:00–14:00 auto-work window for Teaching. |

Prompt, for either one: *"Run the lagoslife-free-tasks skill in `<mode>` mode. Never spend, buy, bet, top up, send or withdraw. Report the reward, or why nothing was earned."*

## Open questions and risks

1. **Does a shift finish if the page closes partway through?** The game catches up on time missed while away for businesses, but I haven't confirmed it does that for shifts. The plan keeps the page open for the whole 60 minutes to be safe.
2. **Matching the gem clue to a venue** is the fragile step. If Claude isn't confident, the run should stop and report the clue rather than guess.
3. **Automating play may break the game's terms.** Check before switching it on.
4. If you switch jobs, the shift days and window change. The script should read them from the Jobs screen rather than hard-coding Teaching.

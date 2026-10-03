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

Free schedulable tasks: the weekday **job shift**, the **daily gem hunt**, and the **gigs** below. The gigs are the main repeatable income.

## Gigs (added after your feedback): the main repeatable income

These are timed actions on objects or at venues. Pay depends on skill. ricky's skills are **Coding 10, Hustle 10, Fitness 10**, Charisma 4.9 and Music 3.

**How the timing works (from the game code):**
- An action finishes in **seconds of real time**. The menu shows it, e.g. "24s".
- When it finishes, it **pays and then rests for 20 real minutes**: `gigRest = now + 20 min`, or 45 minutes if it paid ₦10k or more. The card shows "Back in N min ⏳" until then.
- Every gig has its **own** rest timer, so all of them can run in the same 20-minute cycle.
- Only `pitch`, `hackathon`, `atmHack` and `fakeBags` are **once a day**. They reset at midnight Lagos time.

| Gig | Where / how | Open | Takes | Pays (ricky) | Cost | Rest |
|---|---|---|---|---|---|---|
| **Freelance Gig** 💸 | Home → tap the **Laptop Desk** | always | ~24 s | **₦6,200** (600 + 560 × coding) | free (−Fun) | 20 min |
| **Run Instagram Shop** 🛍️ | Home → **Laptop Desk** | always | ~14 s | **₦2,960** (160 + 280 × hustle) | free | 20 min |
| **WhatsApp Hustle** 💬 | Tap your character (works anywhere) | always | ~11 s | **₦1,900** (100 + 180 × hustle) | free | 20 min |
| **Freelance Gig** 🧾 | **CcHub** → Hot desks | **08:00–23:00** | ~16 s | **₦3,400** (400 + 300 × coding) | free (−Fun) | 20 min |
| **Pitch Your Startup** 🚀 | **CcHub** → Event stage | 08:00–23:00 | ~8 s | about a **50% chance of ₦100k / 250k / 500k / 1M**. Expected value is about ₦160k/day. | free | **once a day** |
| **Buy & Resell Goods** 📦 | **Balogun** → Wholesale depot | always | ~16 s | ₦4,250–5,250 back, so **about ₦3.5–4.5k profit** | **₦800 stake** | 20 min |
| **Carry Load (Alabaru)** 🧺 | **Balogun** → Loading bay | always | ~16 s | **₦900** | free (−Energy, −Hygiene) | 20 min |
| Report a Crime 📝 | Eko Police Division | 24 h | ~4 s | ₦2,000 | free | 20 min |

Other paying actions that pay less at your skill levels:
- Write a Banger: ₦2,300
- Paid Beach Photoshoot (Elegushi): ₦2,200
- Open Mic (Shrine): ₦1,720
- Comedy Night (Freedom Park): ₦1,600
- Paid Skit and Edit Photos: these need electricity

**Travel:** Phone → **Ride** → pick a venue → choose a mode. **Trek is free**; Keke, Danfo, Okada and Cab cost ₦100–₦450.
The panel **preselects Danfo**, so the script has to pick Trek on purpose.
Balogun isn't on the 3D map's buttons, so it can only be reached through Ride.

**Needs:** gigs drain Fun, Energy and Hygiene. If needs get low, the sim gets unhappy and may refuse or slow down.
The loop should top them up with free actions at home: sleep, bucket bath, toilet, Scroll Naija Twitter, Sing.

**Rough income per hour** if every free gig runs about 3 times an hour:
- At home only (Freelance + IG + WhatsApp): about **₦33k/hour**
- Adding the CcHub freelance gig: about **₦43k/hour**, less travel time
- Pay above **₦1M a week is taxed** at 20%. Bets, sales and gifts are not taxed.

**Everything runs in the browser:** the page computes progress and pay, then saves to `/api/save`. So the page has to stay open while a gig runs, but only for seconds at a time.


## Proposed skill: `lagoslife-free-tasks` (v2)

The script is `scripts/lagoslife.js`. It's plain Node and Playwright with no model calls in the loop, so a run uses very few tokens.

### Modes

**`--mode gigs --minutes 55`** (the main one)
1. Log in and press Continue.
2. Read `gigRest` from the save to know which gigs are ready.
3. Loop until the time is up. On each pass:
   - At home: run Laptop → Freelance Gig, then Laptop → Run Instagram Shop, then tap the character → WhatsApp Hustle.
   - If CcHub is open (08:00–23:00), trek there (free) and run Freelance Gig; on the first visit of the day, also run Pitch Your Startup.
   - Optionally, trek to Balogun for Resell (₦800 stake) and Alabaru.
   - Before each gig, check needs. If any is below 35, do the free home fix: sleep, bath, toilet or scroll.
   - Then wait until the next timer ends.
4. Report the ₦ earned and the gigs done.

**`--mode gem`**: the daily gem hunt. Claude solves the clue, then the script treks there and claims.

**`--mode shift`**: the weekday job shift, as described above.

### Guardrails (enforced in code)
- **Write allowlist.** Only these writes go through:
  - `/api/auth/login`
  - `/api/save`
  - `/api/world`
  - `/api/visit`
  - `/api/family {"action":"claim"}`, which the app sends by itself
  - `POST /api/hunt`
- **Blocked:** `/api/wallet/*`, `/api/send`, `/api/ads` (POST), `/api/bail`, `/api/sea`, `/api/gov/*`, `/api/squads`.
- **Never clicked:**
  - Top up wallet, Buy, Boutique, Houses, Cars, Invest, LagosBet, Chowdeck
  - Any paid ride; the script always picks **Trek**
  - Switch/Quit job
  - Anything tagged as a crime (Pickpocket, Fake Bags, Hack an ATM)
- **Spending:** the only spend the script may make is the ₦800 resell stake, and only with `--resell` on, with a daily cap.
- **Secrets:** the password stays in the env var and is masked in all logs. The cookie stays in the run's temp directory.

## Proposed Routines

Each Routine starts a fresh session in this environment. All times are Lagos time.

| Routine | Cron | Does |
|---|---|---|
| **Gigs** | `CRON_TZ=Africa/Lagos 3 7-22 * * *` (hourly, 07:03–22:03) | `--mode gigs --minutes 55`, which covers about 3 gig cycles an hour |
| **Gem hunt** | `CRON_TZ=Africa/Lagos 5 0 * * *` | `--mode gem` |
| **Work shift** | none | Handled inside the gigs run: from 08:00, "Go automatically" sends the sim to work, so it isn't a separate Routine |

The gigs schedule leaves 23:00–07:00 for the sim to sleep and recover. Hourly is the shortest interval a Routine allows. Each fire keeps a session busy for about 55 minutes, which counts toward usage.

## Open questions and risks

0. Gig pay is **play money**, like everything else in the game. Can't be withdrawn.

1. **Does a shift finish if the page closes partway through?** The game catches up on time missed while away for businesses, but I haven't confirmed it does that for shifts. The plan keeps the page open for the whole 60 minutes to be safe.
2. **Matching the gem clue to a venue** is the fragile step. If Claude isn't confident, the run should stop and report the clue rather than guess.
3. **Automating play may break the game's terms.** Check before switching it on.
4. If you switch jobs, the shift days and window change. The script should read them from the Jobs screen rather than hard-coding Teaching.

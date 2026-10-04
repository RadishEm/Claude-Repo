---
name: lagoslife-free-tasks
description: Run the free money-earning tasks in the Lagos Life game (lagoslife.eliysites.com) for the user's account — home laptop gigs, WhatsApp Hustle, CcHub freelance + daily pitch, Balogun resell/alabaru, and the daily gem hunt. Use when a Routine or the user asks to "do the Lagos Life gigs/tasks", "farm Lagos Life", or "do the gem hunt". Never spends beyond the ₦800 resell stake, never tops up, bets, buys, sends or withdraws.
---

# Lagos Life free tasks

**Earning first.** This skill does gigs and the gem hunt, plus walking between venues when a gig needs it.
The only other thing it does is keep the Sim able to work. When it's at home and a need drops below 35, it uses one free action:

| Need | Free action |
|---|---|
| Hunger | Indomie & Egg (from the pantry) |
| Energy | Take a Nap |
| Hygiene | Shower |
| Bladder | Use Toilet |
| Fun | Scroll Naija Twitter |
| Social | Call Mummy |

It never orders groceries or buys anything to do this. Leave upkeep to the script; don't click anything yourself.

Lagos Life ₦ is **play money**: it can't be withdrawn. Real money only goes in, through "Top up wallet".
This skill only earns. It never pays for anything except the ₦800 Balogun resell stake.

## Setup (each fresh session)

```bash
cd .claude/skills/lagoslife-free-tasks/scripts
npm ci --silent        # playwright 1.63; uses the preinstalled /opt/pw-browsers/chromium
```

Needs `LAGOSLIFE_USERNAME` and `LAGOSLIFE_PASSWORD` in the environment. **Never print, echo or log the password.**
The script masks it in errors and caches the session cookie in `$TMPDIR/lagoslife-session.json`, which is outside the repo.

## Commands

| Command | What it does |
|---|---|
| `node lagoslife.js status` | Read-only: balance, location, needs, skills, gig cooldowns, today's gem clue |
| `node lagoslife.js gigs --minutes 55 --resell-per-run 3` | Loops gigs until time is up, then confirms the cloud save |
| `node lagoslife.js gem-clue` | Prints today's gem clue, whether it's already found, and every Ride destination |
| `node lagoslife.js gem --venue "<Ride destination name>"` | Treks there, waits for "Tap to pick it up", claims |

Other flags:
- `--home-only`: skip CcHub and Balogun.
- `--skip-cchub`: skip CcHub only (its freelance gig and the pitch).
- `--resell-per-run 0`: never spend the ₦800 stake.
- `--active-window 3`: skip the run if the account's save changed within this many minutes, meaning someone is playing.
- `--force`: ignore the active-player check.

Exit codes: 0 ok · 1 error (screenshot in `scripts/out/`) · 2 cloud save not confirmed · 3 gem not found at the guessed venue · 4 left the site.

## Gem hunt procedure

1. Run `gem-clue`. If `alreadyFound` is true, stop.
2. Read the riddle and pick the **one** venue from `venues` that it describes. Example: "Lekki's big shopping house, cold AC and all" → **The Palms**.
3. If you're not reasonably sure, don't guess. Report the clue and stop.
4. Run `gem --venue "<exact name>"`. If it exits with code 3, you may try **one** more best guess. Then stop and report.

## How the game works (so you can debug)

- **Game clock:** Lagos wall-clock time (WAT), running at real speed.
- **Gigs:** a gig takes seconds. When it finishes, it pays and sets `gigRest[id] = now + 20 min` (45 minutes if it paid ₦10k or more). Pitch is once per game day.
- **Pay at Coding/Hustle 10:**

  | Gig | Pay |
  |---|---|
  | Laptop Freelance | ₦6,200 |
  | Instagram Shop | ₦2,950 |
  | WhatsApp Hustle | ₦1,900 |
  | CcHub Freelance | ₦3,400 |
  | Resell | about ₦4.3–5.3k back on the ₦800 stake |
  | Alabaru | ₦900 |
  | Pitch | about a 50% chance of ₦100k–₦1M |

- **CcHub hours:** 08:00–23:00 Lagos. Balogun and home are always open.
- **Where the state lives:** the game runs in the browser. State is in `localStorage['lagos-life-save'].state.game`, and the browser uploads it to `/api/save` every 45 seconds.
  If two browsers play at once, the newer save wins. That's why the script skips its run when a human was active recently.
- **Opening a menu:** you open an object's menu by tapping it in the 3D scene.
  - The script finds each object by tapping a grid until a dialog with the right title opens.
  - Missed taps make the Sim walk, which shows up as harmless "Can't reach…" notices.
  - To tap the Sim itself, the script first sends it to an empty floor spot, then taps about 10px left and 30px above that spot.
- **Travel:** Phone → Ride → venue → **Trek** (free) → Go. The script refuses any Go button that shows ₦.
- **Job shift:** handled by the game. With "Go automatically" on, weekday shifts start between 08:00 and 14:00 while the page is open. Gig runs wait while the Sim is at work.

## Guardrails (in code — don't remove)

- **Write allowlist.** Only these writes go out:
  - `/api/auth/login`
  - `/api/save`
  - `/api/world`
  - `/api/visit`
  - `/api/hunt`
  - `/api/client-error`
  - `/api/family` with `{"action":"claim"}`
- Everything else is aborted and logged as `BLOCKED`. That covers wallet, send, ads, bail, sea, gov, squads and spray.
- Third-party requests and popups are blocked.
- If the page navigates off the site, for example to a payment page, the run stops.
- Crime actions are never in the gig list.

If you see `BLOCKED` lines in the output, report them. Don't widen the allowlist.

## Report format

End with the script's `SUMMARY` line plus anything unusual:
- `BLOCKED` lines
- "could not find …"
- an unconfirmed save
- a skipped run because someone was playing

#!/usr/bin/env node
// Lagos Life free-task runner. See ../SKILL.md.
//
//   node lagoslife.js status
//   node lagoslife.js gigs [--minutes 55] [--resell-per-run 3] [--home-only]
//   node lagoslife.js gem-clue
//   node lagoslife.js gem --venue "The Palms"
//
// Credentials come from LAGOSLIFE_USERNAME / LAGOSLIFE_PASSWORD and are never printed.
const fs = require('fs');
const path = require('path');
const { launch } = require('./browser');

const SITE = 'https://lagoslife.eliysites.com';
const OUT = path.join(__dirname, 'out');
const VIEW = { width: 414, height: 900 };
// Session cookie cache, outside the repo, so repeated runs in one container don't log in every time.
const SESSION_FILE = process.env.LAGOSLIFE_SESSION_FILE || path.join(require('os').tmpdir(), 'lagoslife-session.json');

// ---------- args ----------
const argv = process.argv.slice(2);
const MODE = argv[0] || 'status';
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return dflt;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const MINUTES = Number(opt('minutes', 55));
const RESELL_PER_RUN = Number(opt('resell-per-run', 3));
const HOME_ONLY = !!opt('home-only', false);
const ACTIVE_WINDOW_MIN = Number(opt('active-window', 3));

// ---------- gigs ----------
// where: 'home' object, a venue station, or 'self' (tap your Sim; works anywhere).
const GIGS = [
  { id: 'freelance', label: 'Freelance Gig', where: 'home', object: 'Laptop Desk' },
  { id: 'onlineBiz', label: 'Run Instagram Shop', where: 'home', object: 'Laptop Desk' },
  { id: 'whatsappHustle', label: 'WhatsApp Hustle', where: 'self' },
  { id: 'pitch', label: 'Pitch Your Startup', where: 'yabaHub', object: 'Event stage' },
  { id: 'freelanceGig', label: 'Freelance Gig', where: 'yabaHub', object: 'Hot desks' },
  { id: 'resell', label: 'Buy & Resell Goods', where: 'balogun', object: 'Wholesale depot', spends: 800 },
  { id: 'alabaru', label: 'Carry Load (Alabaru)', where: 'balogun', object: 'Loading bay' },
];
const VENUES = {
  yabaHub: { name: 'CcHub', open: [8, 23] },
  balogun: { name: 'Balogun Market', open: [0, 24] },
};
// Free home actions used to keep needs up between gigs. Card labels are matched loosely.
const NEED_FIXES = {
  hunger: { object: 'Gas Cooker', card: /Indomie & Egg|Fry Dodo|Cook Jollof|Titus Stew/ }, // free from the pantry
  energy: { object: 'Spring Bed', card: /Take a Nap/ },
  bladder: { object: 'WC Toilet', card: /Use Toilet/ },
  hygiene: { object: 'Rain Shower', card: /Shower/ },
  fun: { object: 'Laptop Desk', card: /scroll naija twitter/i },
  social: { self: true, card: /call mummy/i },
};
const NEED_LOW = 35;

// ---------- safety: only these writes may leave the browser ----------
const WRITE_ALLOW = [
  /\/api\/auth\/login$/,
  /\/api\/save(\?|$)/,
  /\/api\/world$/,
  /\/api\/visit$/,
  /\/api\/hunt$/, // gem claim
  /\/api\/client-error$/,
];
const blocked = [];
async function guard(context) {
  await context.route('**/*', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'GET' || req.method() === 'HEAD') return route.continue();
    if (url.origin !== SITE || url.pathname.startsWith('/cdn-cgi/')) return route.abort(); // analytics, third parties
    if (url.pathname === '/api/family' && /"action":"claim"/.test(req.postData() || '')) return route.continue(); // app's own auto-claim of gifts
    if (WRITE_ALLOW.some((re) => re.test(url.pathname))) return route.continue();
    blocked.push(`${req.method()} ${url.pathname}`);
    log(`BLOCKED ${req.method()} ${url.pathname}`);
    return route.abort();
  });
}

// ---------- helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const naira = (n) => `₦${Math.round(n).toLocaleString('en-NG')}`;
const lagosHour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', hour: 'numeric', hour12: false }).format(new Date())) % 24;
const isOpen = (venueId) => { const v = VENUES[venueId]; if (!v) return true; const h = lagosHour(); return h >= v.open[0] && h < v.open[1]; };

async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const f = path.join(OUT, `${new Date().toISOString().replace(/[:.]/g, '-')}-${name}.png`);
  await page.screenshot({ path: f }).catch(() => {});
  return f;
}

async function game(page) {
  return page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('lagos-life-save')).state.game; } catch { return null; }
  });
}

async function closeDialogs(page) {
  for (let i = 0; i < 3 && (await page.locator('[role=dialog]').count()); i++) {
    await page.keyboard.press('Escape');
    await sleep(300);
  }
}

async function login(page) {
  const user = process.env.LAGOSLIFE_USERNAME, pass = process.env.LAGOSLIFE_PASSWORD;
  if (!user || !pass) throw new Error('LAGOSLIFE_USERNAME / LAGOSLIFE_PASSWORD are not set');
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Essential only' }).click({ timeout: 15000 }).catch(() => {});
  const cont = page.getByRole('button', { name: 'Continue' });
  await Promise.race([cont.waitFor({ timeout: 20000 }), page.getByRole('button', { name: 'Log in' }).first().waitFor({ timeout: 20000 })]).catch(() => {});
  if (!(await cont.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Log in' }).first().click();
    await page.locator('input[name=username]').fill(user);
    await page.locator('input[name=password]').fill(pass);
    for (let attempt = 1; ; attempt++) {
      await page.locator('button[type=submit]', { hasText: 'Log in' }).click();
      try { await cont.waitFor({ timeout: 40000 }); break; } catch (e) {
        if (attempt >= 3) throw new Error('login failed after 3 attempts');
        log(`login attempt ${attempt} failed, retrying`); await sleep(10000);
      }
    }
  }
  await cont.waitFor({ timeout: 30000 });
  await page.context().storageState({ path: SESSION_FILE });
  fs.chmodSync(SESSION_FILE, 0o600);
  // Don't fight a human: if the cloud save changed in the last few minutes, someone is playing.
  if ((MODE === 'gigs' || MODE === 'gem') && !opt('force', false)) {
    const j = await (await page.request.get(`${SITE}/api/save`)).json().catch(() => null);
    const idleMin = j?.updatedAt && j?.now ? (j.now - j.updatedAt) / 60000 : Infinity;
    if (idleMin < ACTIVE_WINDOW_MIN) throw Object.assign(new Error(`account was active ${idleMin.toFixed(1)} min ago; someone is playing, skipping this run (--force overrides)`), { skip: true });
  }
  await cont.click();
  await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('lagos-life-save')).state.game.phase === 'play'; } catch { return false; } }, null, { timeout: 60000 });
  await sleep(5000); // let the 3D scene settle
  log('signed in as', user);
}

// Wait until the Sim is free: no queued action, not travelling, not at work.
async function waitIdle(page, maxMs = 15 * 60000) {
  const end = Date.now() + maxMs;
  while (Date.now() < end) {
    const g = await game(page);
    if (g && !g.queue?.length && !g.travel && !g.work && !g.jail) return g;
    await sleep(3000);
  }
  throw new Error('Sim stayed busy too long');
}

// Find where an object (or the Sim) is on screen by tapping a grid until its sheet opens.
const spots = new Map([['home:Laptop Desk', [240, 340]]]);
async function openSheet(page, matcher, location) {
  const test = async () => {
    const d = page.locator('[role=dialog]').first();
    if (!(await d.count())) return false;
    const t = await d.innerText().catch(() => '');
    return matcher(t.split('\n').filter(Boolean).slice(0, 3).join(' / '));
  };
  const key = `${location}:${matcher.key}`;
  const cached = spots.get(key);
  if (cached) {
    await page.mouse.click(...cached); await sleep(700);
    if (await test()) return true;
    await closeDialogs(page);
  }
  for (const step of [40, 20]) {
    for (let y = 200; y <= 740; y += step) for (let x = 20; x <= 394; x += step) {
      await page.mouse.click(x, y); await sleep(320);
      if (await page.locator('[role=dialog]').count()) {
        if (await test()) { spots.set(key, [x, y]); return true; }
        await closeDialogs(page);
      }
    }
  }
  return false;
}
const objectMatcher = (title) => Object.assign((t) => t.includes(title), { key: title });

// Tapping your Sim is hard because a missed tap on the floor makes the Sim walk there.
// So we use that: send the Sim to an open floor spot, then tap its body (about 10px left, 30px up).
const SUMMON_SPOTS = [[110, 440], [300, 480], [200, 400]];
async function openSelfSheet(page) {
  const isSelf = async () => {
    const d = page.locator('[role=dialog]').first();
    return (await d.count()) && /What should they do\?/.test(await d.innerText().catch(() => ''));
  };
  for (const [fx, fy] of SUMMON_SPOTS) {
    await page.mouse.click(fx, fy); await sleep(500);
    if (await page.locator('[role=dialog]').count()) { await closeDialogs(page); continue; } // spot is furniture here
    await sleep(7000);
    for (const [dx, dy] of [[-10, -30], [-10, -40], [0, -30], [-20, -30], [-10, -20], [0, -45]]) {
      await page.mouse.click(fx + dx, fy + dy); await sleep(450);
      if (await isSelf()) return true;
      if (await page.locator('[role=dialog]').count()) await closeDialogs(page);
      else { await page.mouse.click(fx, fy); await sleep(4000); } // missed: walk back to the spot
    }
  }
  return false;
}

// Click one action card in the open sheet. Returns 'ok' | 'resting' | 'missing' | 'locked'.
async function clickCard(page, label, root = page.locator('[role=dialog]')) {
  const card = root.locator('button').filter({ hasText: label }).filter({ hasNotText: /Risky/ }).first();
  if (!(await card.count())) return 'missing';
  const text = (await card.innerText()).replace(/\s+/g, ' ');
  if (/Back in/.test(text)) return 'resting';
  if (/Needs |🔒/.test(text) || (await card.isDisabled())) return 'locked';
  await card.click();
  return 'ok';
}

// Run one gig end to end and report what it paid.
async function runGig(page, gig) {
  const before = await waitIdle(page);
  let opened, root;
  if (gig.where === 'self') opened = await openSelfSheet(page);
  else if (gig.where === 'home') opened = await openSheet(page, objectMatcher(gig.object), before.location);
  else {
    // Venues list their stations as buttons along the bottom; tapping one shows its action cards inline.
    const chip = page.getByRole('button', { name: new RegExp(`^\\W*${gig.object}$`) }).first();
    opened = (await chip.count()) > 0;
    if (opened) { await chip.click(); await sleep(1200); root = page.locator('body'); }
  }
  if (!opened) { log(`could not find ${gig.object || 'your Sim'} on screen`); await shot(page, `notfound-${gig.id}`); return null; }
  const res = await clickCard(page, gig.label, root);
  if (res !== 'ok') { log(`${gig.label}: ${res}`); await closeDialogs(page); return res; }
  await sleep(800);
  await closeDialogs(page);
  // A gig is finished when its rest timer is set past the time we started.
  const end = Date.now() + 5 * 60000;
  while (Date.now() < end) {
    const g = await game(page);
    if ((g.gigRest?.[gig.id] ?? 0) > before.time) {
      const earned = g.money - before.money;
      log(`✅ ${gig.label} @ ${before.location}: ${earned >= 0 ? '+' : ''}${naira(earned)} (balance ${naira(g.money)})`);
      return { earned };
    }
    await sleep(2000);
  }
  log(`${gig.label}: did not finish in 5 min`);
  await shot(page, `stuck-${gig.id}`);
  return null;
}

async function fixNeeds(page) {
  const g = await waitIdle(page);
  if (g.location !== 'home') return;
  for (const [need, fix] of Object.entries(NEED_FIXES)) {
    if ((g.needs?.[need] ?? 100) >= NEED_LOW) continue;
    log(`${need} is low (${Math.round(g.needs[need])}), topping up`);
    const ok = fix.self ? await openSelfSheet(page) : await openSheet(page, objectMatcher(fix.object), 'home');
    if (!ok) continue;
    // Only free cards: skip anything priced, resting, or needing ingredients we don't have.
    const card = page.locator('[role=dialog] button').filter({ hasText: fix.card }).filter({ hasNotText: /Back in|₦|Need |Chowdeck/ }).first();
    if (await card.count()) await card.click(); else log(`no free way to fix ${need} right now`);
    await sleep(800); await closeDialogs(page);
    await waitIdle(page);
  }
}

// ---------- travel (always on foot: Trek is free) ----------
// A Ride destination's name starts with its emoji then the venue name (unlike "Share a link to …").
const rideButton = (page, name) => page.getByRole('button', { name: new RegExp(`^\\W*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`) }).first();
async function pickTrekAndGo(page) {
  await page.getByRole('button', { name: /Trek/ }).first().click({ timeout: 10000 });
  await sleep(400);
  const go = page.getByRole('button', { name: /^Go\b/ }).first();
  const label = (await go.innerText()).trim();
  if (/₦/.test(label)) throw new Error(`refusing paid ride ("${label}")`);
  await go.click();
}

async function travelTo(page, venueId) {
  const g = await waitIdle(page);
  if (g.location === venueId) return;
  log(`trekking to ${venueId === 'home' ? 'home' : VENUES[venueId].name}`);
  await closeDialogs(page);
  if (venueId === 'home') {
    await page.getByRole('button', { name: 'Go home' }).first().click({ timeout: 10000 });
    await sleep(800);
    if (await page.getByRole('button', { name: /Trek/ }).count()) await pickTrekAndGo(page);
  } else {
    await page.getByRole('button', { name: 'Phone' }).click();
    await sleep(1000);
    await page.getByText('Ride', { exact: true }).click();
    await sleep(1200);
    await rideButton(page, VENUES[venueId].name).click();
    await sleep(1200);
    await pickTrekAndGo(page);
  }
  await page.waitForFunction((id) => { try { const g = JSON.parse(localStorage.getItem('lagos-life-save')).state.game; return g.location === id && !g.travel; } catch { return false; } }, venueId, { timeout: 20 * 60000, polling: 2000 });
  for (const k of [...spots.keys()]) if (!k.startsWith('home:')) spots.delete(k);
  await sleep(4000);
  log(`arrived at ${venueId}`);
}

// The game uploads its save every 45 s. Before closing, wait until the server has our latest balance.
async function flushSave(page) {
  const end = Date.now() + 120000;
  while (Date.now() < end) {
    const local = await game(page);
    const server = await (await page.request.get(`${SITE}/api/save`)).json().catch(() => null);
    if (local && server?.game && server.game.money === local.money && server.game.time >= local.time - 2) return log('cloud save confirmed');
    await sleep(5000);
  }
  log('WARNING: cloud save not confirmed; last gigs may not be saved');
  process.exitCode = 2;
}

// ---------- modes ----------
async function status(page) {
  const g = await game(page);
  const rest = Object.fromEntries(GIGS.map((x) => [x.id, Math.max(0, Math.ceil((g.gigRest?.[x.id] ?? 0) - g.time))]));
  const hunt = await (await page.request.get(`${SITE}/api/hunt`)).json();
  console.log(JSON.stringify({
    money: g.money, location: g.location, needs: Object.fromEntries(Object.entries(g.needs).map(([k, v]) => [k, Math.round(v)])),
    skills: Object.fromEntries(Object.entries(g.skills).map(([k, v]) => [k, Math.floor(v)])),
    job: g.job && { career: g.job.career, level: g.job.level, autoWork: g.autoWork !== false },
    minutesUntilReady: rest, gem: { clue: hunt.clue, found: !!hunt.mine, reward: hunt.mine?.reward ?? hunt.nextReward },
  }, null, 2));
}

async function gigs(page) {
  const deadline = Date.now() + MINUTES * 60000;
  let total = 0, resells = 0;
  const done = [];
  const ready = (g, gig) => (g.gigRest?.[gig.id] ?? 0) <= g.time
    && !(gig.id === 'resell' && resells >= RESELL_PER_RUN)
    && (gig.spends ? g.money >= gig.spends + 5000 : true);
  const at = (g, gig) => (gig.where === 'self' ? g.location === 'home' : gig.where === g.location);
  const usable = (gig) => gig.where === 'self' || gig.where === 'home' || (!HOME_ONLY && isOpen(gig.where));

  while (Date.now() < deadline - 60000) {
    let g = await waitIdle(page, deadline - Date.now());
    await fixNeeds(page);
    g = await game(page);
    const here = GIGS.filter((x) => usable(x) && at(g, x) && ready(g, x));
    if (here.length) {
      for (const gig of here) {
        if (Date.now() > deadline - 60000) break;
        const r = await runGig(page, gig);
        if (r?.earned !== undefined) { total += r.earned; done.push(gig.id); if (gig.id === 'resell') resells++; }
      }
      continue;
    }
    // Nothing ready here. Go where something is ready (home first), else wait for the next timer.
    const elsewhere = GIGS.filter((x) => usable(x) && x.where !== 'self' && x.where !== g.location && ready(g, x));
    if (elsewhere.length) {
      const dest = elsewhere.some((x) => x.where === 'home') ? 'home' : elsewhere[0].where;
      await travelTo(page, dest);
      continue;
    }
    const next = Math.min(...GIGS.filter(usable).map((x) => (g.gigRest?.[x.id] ?? 0) - g.time).filter((m) => m > 0));
    const waitMs = Math.min((isFinite(next) ? next : 5) * 60000 + 5000, deadline - Date.now() - 60000);
    if (waitMs <= 0) break;
    log(`nothing ready; waiting ${Math.ceil(waitMs / 60000)} min`);
    await sleep(waitMs);
  }
  // Head home so the next run starts at the laptop.
  if (!HOME_ONLY && (await game(page)).location !== 'home') await travelTo(page, 'home').catch((e) => log('could not get home:', e.message));
  const g = await game(page);
  log(`SUMMARY gigs=${done.length} [${done.join(', ')}] earned=${naira(total)} balance=${naira(g.money)}${blocked.length ? ` blocked=${blocked.length}` : ''}`);
}

async function gemClue(page) {
  const hunt = await (await page.request.get(`${SITE}/api/hunt`)).json();
  await page.getByRole('button', { name: 'Phone' }).click(); await sleep(1000);
  await page.getByText('Ride', { exact: true }).click(); await sleep(1500);
  const venues = await page.getByRole('button').evaluateAll((bs) => bs.map((b) => b.innerText.split('\n').map((x) => x.trim()).filter(Boolean)).filter((l) => l.length >= 3 && l[2].length > 25).map((l) => `${l[1]} — ${l[2]}`));
  await closeDialogs(page);
  console.log(JSON.stringify({ clue: hunt.clue, alreadyFound: !!hunt.mine, nextReward: hunt.nextReward, resetsAt: new Date(hunt.endsAt).toISOString(), venues }, null, 2));
}

async function gem(page) {
  const venue = opt('venue');
  if (!venue || venue === true) throw new Error('gem needs --venue "<name from gem-clue>"');
  const hunt = await (await page.request.get(`${SITE}/api/hunt`)).json();
  if (hunt.mine) return log(`gem already found today (rank #${hunt.mine.rank}, ${naira(hunt.mine.reward)})`);
  await waitIdle(page);
  const pick = page.getByRole('button', { name: /Tap to pick it up/ });
  // The game re-checks the hunt every ~25 s at a venue, so give it time to show the button.
  if (await pick.waitFor({ timeout: 35000 }).then(() => true, () => false)) log(`clue: ${hunt.clue} → already at the gem`);
  else {
    log(`clue: ${hunt.clue} → trekking to ${venue}`);
    await page.getByRole('button', { name: 'Phone' }).click(); await sleep(1000);
    await page.getByText('Ride', { exact: true }).click(); await sleep(1500);
    await rideButton(page, venue).click(); await sleep(1200);
    await pickTrekAndGo(page);
  }
  try {
    await pick.waitFor({ timeout: 20 * 60000 });
  } catch {
    log(`no gem at ${venue} — wrong guess?`); await shot(page, 'gem-miss');
    process.exitCode = 3; return;
  }
  await pick.click({ force: true }); // it pulses, so it's never "stable"
  await sleep(4000);
  const after = await (await page.request.get(`${SITE}/api/hunt`)).json();
  log(after.mine ? `💎 gem claimed: rank #${after.mine.rank}, ${naira(after.mine.reward)}` : 'claim did not register');
  await sleep(2000);
  await travelTo(page, 'home').catch(() => {});
}

(async () => {
  const browser = await launch();
  const context = await browser.newContext({ viewport: VIEW, ...(fs.existsSync(SESSION_FILE) ? { storageState: SESSION_FILE } : {}) });
  await guard(context);
  const page = await context.newPage();
  context.on('page', (p) => { if (p !== page) p.close(); }); // no popups (ads, app stores)
  page.on('framenavigated', (f) => { if (f === page.mainFrame() && !f.url().startsWith(SITE)) { log('left the site, stopping'); process.exit(4); } });
  try {
    await login(page);
    if (MODE === 'status') await status(page);
    else if (MODE === 'gigs') await gigs(page);
    else if (MODE === 'gem-clue') await gemClue(page);
    else if (MODE === 'gem') await gem(page);
    else throw new Error(`unknown mode ${MODE}`);
    if (MODE !== 'status' && MODE !== 'gem-clue') await flushSave(page);
  } catch (e) {
    if (e.skip) { log(e.message); return; }
    const pass = process.env.LAGOSLIFE_PASSWORD;
    log('ERROR', pass ? String(e.message).split(pass).join('***') : e.message, '→', await shot(page, 'error'));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();

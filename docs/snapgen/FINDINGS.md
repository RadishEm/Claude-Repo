# SnapGenAI vs Higgsfield Pro: findings and setup

Researched 2026-10-16 by rendering snapgen.ai/pricing, docs.snapgen.ai and snapgen.ai/terms in headless Chromium.

## Verdict

**Go with SnapGenAI Premium (pay as you go).** It is cheaper than Higgsfield's ~$1.07/video at every Seedance 2.0 tier, it has no monthly fee or use-it-or-lose-it month, and its API works with a plain HTTP client. Start with a single $10 top-up. Refunds are only possible within 7 days, and the "Lower" tiers have not been quality-checked yet.

## Credit costs (TODO 1)

The pricing page can show either credits or USD. Its USD figures assume the current **100% bonus** ($10 = 2,000 credits, so **1 credit = $0.005**). At the normal rate ($10 = 1,000 credits) every dollar figure below doubles.

| Model (API `model` / `mode`) | Credits | $ at bonus rate | $ at normal rate |
|---|---|---|---|
| Seedance 2.0 Lower 720p (`sd-2-lower` / `lower`) | 1 / sec | 5s $0.025 · 10s $0.05 · 15s $0.075 | ×2 |
| Seedance 2.5 Lower 720p (`sd-2-5-lower` / `lower`) | 2 / sec | 10s $0.10 | ×2 |
| Seedance 2.0 Mini 720p (`seedance-2-mini` / `business_mini_vip`) | 21 / sec | 5s $0.525 · 10s $1.05 | ×2 |
| Seedance 2.0 Omni Fast VIP (`seedance-2-omni` / `fast-vip`) | 27 / sec | 5s $0.675 · 10s $1.35 | ×2 |
| Seedance 2.0 Omni Pro VIP (`seedance-2-omni` / `pro-vip`) | 35 / sec | 5s $0.875 · 10s $1.75 | ×2 |
| Veo 3.1 Fast / Lite, HD or Full HD, 8s (`veo-3.1-fast`, `veo-3.1-lite`) | 4 / video | $0.02 | $0.04 |
| Veo 3.1 HD / Full HD, 8s (`veo-3.1`) | 100 / video | $0.50 | $1.00 |
| Grok Video 720p 10s | 45 / video | $0.225 | $0.45 |
| Nano Banana Pro / 2 / 2 Lite (`nano-banana-pro`, …) | 3 / image | $0.015 | $0.03 |

**Compared with Higgsfield Pro** (~$1.07 per Seedance 2.0 video, ~$0.10 per Nano Banana Pro image, and only if all 600 credits get used each month):
- Seedance 2.0 Lower costs about 1/20th as much. Quality is unverified: it is a reseller "95% cheaper" tier, so test it before relying on it.
- The full Seedance 2.0 Omni/Mini tiers cost about the same as Higgsfield for 10s clips and less for 5s clips. At the bonus rate there's no wasted subscription money either.
- Veo 3.1 Fast at $0.02 per 8s clip and Nano Banana Pro at $0.015 per image are far cheaper than Higgsfield.
- On the pricing page, "Free" next to Veo 3.1 Fast/Lite and Nano Banana refers to the Veo Max / Image Max subscriptions, and those plans **cannot use the API**. Through the API you pay the credit amounts above.
- Nano Banana Pro's API rate limit is 5 requests/min, 100/hour and 1,000/day.

## Credit expiry (TODO 2): not stated anywhere

- The pricing page doesn't mention expiry for pay-as-you-go credits. It only says "Only pay for what you use."
- The terms (section 3, "Payment and Credits") cover recharging and refunds (non-refundable except within 7 days of purchase) but say **nothing about credits expiring**.
- In the `/account` API response, only subscription *benefits* have an `expire_at`. The credit balance (`available_credit`, `locked_credit`) has none.
- So credits **probably don't expire**, but that isn't confirmed. Ask contact@snapgen.ai or the Discord before buying more than $10.
- **Generated files do expire**: history records show `expired_at` about 30 days after creation. Always download your outputs (the script below does this).

## API (TODO 3)

- Base URL: `https://api.snapgen.ai/uapi/v1`. Send the header `x-api-key: <key>`. Create the key at snapgen.ai → Service Integration.
- Image: `POST /generate_image` (multipart): `prompt`, `model`, `aspect_ratio`, `resolution` (1K/2K/4K), `style`, `files` / `file_urls`
- Seedance: `POST /video-gen/seedance` (multipart): `prompt`, `model`, `mode`, `duration`, `aspect_ratio`, `ref_images`, `ref_videos`, `ref_audios`
- Veo / Omni Flash: `POST /video-gen/veo` (multipart): `prompt`, `model`, `resolution`, `duration`, `aspect_ratio`, `mode_image`, `ref_images`
- Jobs run asynchronously. A submit returns a `uuid` and `estimated_credit`. To get the result, either poll `GET /history/{uuid}` (`status` 1 = processing, 2 = done, 3 = failed) or register a webhook. The media URL is in `generated_video[].video_url` or `generated_image[].image_url`.
- Balance: `GET /account` returns `user_credit.available_credit`.
- Cloudflare sits in front of the API and blocks the default `Python-urllib` User-Agent (error 1010). The script sends its own User-Agent; curl works as is.
- The docs are titled "GeminiGen AI", and the image docs mention "uuid of the image you created by geminigen". It is the same platform under a white-label name. The site is operated by A2ZAI LTD (UK company no. 16078579).

## Using it from Claude Code (TODO 3 and 4)

`api.snapgen.ai` **is reachable from the Claude Code cloud sandbox**: a test call reached the API and got back its own `API_KEY_NOT_FOUND`. It works from a local machine too.

```bash
export SNAPGEN_API_KEY=...            # in a cloud environment, add it as an environment variable/secret
python3 tools/snapgen/snapgen.py account
python3 tools/snapgen/snapgen.py image "a red fox in snow, golden hour" --aspect 16:9 -o out/
python3 tools/snapgen/snapgen.py seedance "neon city dance, tracking shot" --model sd-2-lower --duration 5 -o out/
python3 tools/snapgen/snapgen.py seedance "..." --model seedance-2-omni --mode fast-vip --duration 5 --ref ./frame.png
python3 tools/snapgen/snapgen.py veo "lake at sunset, slow dolly" --model veo-3.1-fast -o out/
python3 tools/snapgen/snapgen.py wait <uuid> -o out/   # resume a job that timed out
```

The script uses only the Python standard library. It submits the job, polls until it finishes, and downloads the result into `-o` (default `snapgen-out/`). The multipart encoding was checked against a local server; a real generation hasn't been run yet because that needs a funded key.

## Suggested first run (~$0.25 of credits at the bonus rate)

1. Buy $10 and check that `account` shows about 2,000 `available_credit`.
2. Run the same prompt through `sd-2-lower` (5s, about 5 credits) and `seedance-2-omni fast-vip` (5s, about 135 credits) and compare quality.
3. Make one `veo-3.1-fast` video (4 credits) and one `nano-banana-pro` image (3 credits).
4. Run `account` again to confirm the actual charges match this table.

#!/usr/bin/env python3
"""Minimal SnapGenAI (api.snapgen.ai) client for use from Claude Code.

Standard library only. Reads the key from SNAPGEN_API_KEY.

  snapgen.py account
  snapgen.py image "a red fox in snow" --model nano-banana-pro --aspect 16:9 -o out/
  snapgen.py seedance "neon city dance" --model sd-2-lower --duration 5 -o out/
  snapgen.py veo "lake at sunset" --model veo-3.1-fast --resolution 720p -o out/
  snapgen.py wait <uuid> -o out/          # resume polling a job
  snapgen.py history --filter video

Every generation command submits, polls /history/{uuid} until done, then
downloads the result. Generated files expire on SnapGen's side (~30 days),
so always keep the downloaded copy.
"""

import argparse
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
import uuid as uuidlib

BASE = os.environ.get("SNAPGEN_BASE_URL", "https://api.snapgen.ai/uapi/v1")
# Cloudflare in front of the API bans the default "Python-urllib/x.y" agent.
USER_AGENT = "snapgen-cli/1.0"


def api_key():
    key = os.environ.get("SNAPGEN_API_KEY")
    if not key:
        sys.exit("SNAPGEN_API_KEY is not set (create one under Service Integration on snapgen.ai)")
    return key


def request(method, path, fields=None, files=None):
    headers = {"x-api-key": api_key(), "Accept": "application/json", "User-Agent": USER_AGENT}
    body = None
    if fields is not None or files:
        boundary = uuidlib.uuid4().hex
        parts = []
        for name, value in (fields or {}).items():
            for v in value if isinstance(value, list) else [value]:
                if v is None:
                    continue
                parts.append(
                    f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{v}\r\n'.encode()
                )
        for name, path_ in files or []:
            ctype = mimetypes.guess_type(path_)[0] or "application/octet-stream"
            with open(path_, "rb") as f:
                data = f.read()
            parts.append(
                f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; '
                f'filename="{os.path.basename(path_)}"\r\nContent-Type: {ctype}\r\n\r\n'.encode()
                + data
                + b"\r\n"
            )
        parts.append(f"--{boundary}--\r\n".encode())
        body = b"".join(parts)
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    req = urllib.request.Request(BASE + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} on {method} {path}: {e.read().decode(errors='replace')}")


def split_refs(refs):
    """Local paths are uploaded as files; http(s) URLs are sent as form values."""
    urls = [r for r in refs or [] if r.startswith(("http://", "https://"))]
    paths = [r for r in refs or [] if r not in urls]
    for p in paths:
        if not os.path.isfile(p):
            sys.exit(f"reference file not found: {p}")
    return urls, paths


def result_urls(h):
    urls = [v.get("video_url") for v in h.get("generated_video") or []]
    for img in h.get("generated_image") or []:
        urls.append(img.get("file_download_url") or img.get("image_url") or img.get("image_uri"))
    urls = [u for u in urls if u]
    if not urls and h.get("generate_result", "") and str(h["generate_result"]).startswith("http"):
        urls.append(h["generate_result"])
    return urls


def wait(job_uuid, out_dir, interval=10, timeout=1800):
    deadline = time.time() + timeout
    while True:
        h = request("GET", f"/history/{job_uuid}")
        status = h.get("status")
        print(f"[{job_uuid}] status={status} {h.get('status_percentage')}%", file=sys.stderr)
        if status == 2:
            break
        if status == 3:
            sys.exit(f"generation failed: {h.get('error_code')} {h.get('error_message')}")
        if time.time() > deadline:
            sys.exit(f"timed out; resume with: snapgen.py wait {job_uuid}")
        time.sleep(interval)
    os.makedirs(out_dir, exist_ok=True)
    saved = []
    for i, url in enumerate(result_urls(h)):
        ext = os.path.splitext(url.split("?")[0])[1] or ".bin"
        dest = os.path.join(out_dir, f"{job_uuid}{'-' + str(i) if i else ''}{ext}")
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=600) as r, open(dest, "wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
        saved.append(dest)
    print(json.dumps({"uuid": job_uuid, "used_credit": h.get("used_credit"), "files": saved}, indent=2))
    if not saved:
        print("completed but no media URL found; raw record:\n" + json.dumps(h, indent=2), file=sys.stderr)


def submit_and_wait(path, fields, files, args):
    job = request("POST", path, fields, files)
    print(
        f"submitted {job.get('uuid')} (estimated_credit={job.get('estimated_credit')})",
        file=sys.stderr,
    )
    if args.no_wait:
        print(json.dumps(job, indent=2))
    else:
        wait(job["uuid"], args.out)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("account", help="show credit balance and benefits")

    hist = sub.add_parser("history", help="list recent generations")
    hist.add_argument("--filter", default="all")
    hist.add_argument("--n", type=int, default=10)

    w = sub.add_parser("wait", help="poll a job and download its output")
    w.add_argument("uuid")
    w.add_argument("-o", "--out", default="snapgen-out")

    def gen(name, **kw):
        s = sub.add_parser(name, **kw)
        s.add_argument("prompt")
        s.add_argument("--ref", action="append", help="reference image (path or URL); repeatable")
        s.add_argument("--aspect", default="16:9")
        s.add_argument("-o", "--out", default="snapgen-out")
        s.add_argument("--no-wait", action="store_true")
        return s

    im = gen("image", help="Nano Banana image")
    im.add_argument("--model", default="nano-banana-pro", choices=["nano-banana-pro", "nano-banana-2", "nano-banana-2-lite"])
    im.add_argument("--resolution", default="1K", choices=["1K", "2K", "4K"])
    im.add_argument("--style")

    sd = gen("seedance", help="Seedance video")
    sd.add_argument("--model", default="sd-2-lower",
                    choices=["sd-2-lower", "sd-2-5-lower", "seedance-2-omni", "seedance-2-mini", "seedance-2-5-omni"])
    sd.add_argument("--mode", help="default: lower / fast-vip / business_mini_vip / pro-vip per model")
    sd.add_argument("--duration", type=int, default=5)

    vo = gen("veo", help="Veo / Omni Flash video")
    vo.add_argument("--model", default="veo-3.1-fast",
                    choices=["veo-3.1", "veo-3.1-fast", "veo-3.1-lite", "veo-2", "omni-flash"])
    vo.add_argument("--resolution", default="720p", choices=["720p", "1080p"])
    vo.add_argument("--duration", type=int, default=8)
    vo.add_argument("--mode-image", default="frame", choices=["frame", "ingredient"])

    args = p.parse_args()

    if args.cmd == "account":
        print(json.dumps(request("GET", "/account"), indent=2))
    elif args.cmd == "history":
        print(json.dumps(request("GET", f"/histories?filter_by={args.filter}&items_per_page={args.n}&page=1"), indent=2))
    elif args.cmd == "wait":
        wait(args.uuid, args.out)
    elif args.cmd == "image":
        urls, paths = split_refs(args.ref)
        fields = {"prompt": args.prompt, "model": args.model, "aspect_ratio": args.aspect,
                  "resolution": args.resolution, "style": args.style, "file_urls": urls}
        submit_and_wait("/generate_image", fields, [("files", f) for f in paths], args)
    elif args.cmd == "seedance":
        default_mode = {"sd-2-lower": "lower", "sd-2-5-lower": "lower", "seedance-2-omni": "fast-vip",
                        "seedance-2-mini": "business_mini_vip", "seedance-2-5-omni": "pro-vip"}[args.model]
        urls, paths = split_refs(args.ref)
        fields = {"prompt": args.prompt, "model": args.model, "mode": args.mode or default_mode,
                  "duration": args.duration, "aspect_ratio": args.aspect, "ref_images": urls}
        submit_and_wait("/video-gen/seedance", fields, [("ref_images", f) for f in paths], args)
    elif args.cmd == "veo":
        urls, paths = split_refs(args.ref)
        fields = {"prompt": args.prompt, "model": args.model, "resolution": args.resolution,
                  "duration": args.duration, "aspect_ratio": args.aspect, "mode_image": args.mode_image,
                  "ref_images": urls}
        submit_and_wait("/video-gen/veo", fields, [("ref_images", f) for f in paths], args)


if __name__ == "__main__":
    main()

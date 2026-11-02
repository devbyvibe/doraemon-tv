#!/usr/bin/env python3
"""Rebuild episodes.json from the public Google Drive folder.

Run this whenever you add videos to the folder:
    python3 tools/update_episodes.py
"""
import html
import json
import re
import subprocess
from pathlib import Path

FOLDER_ID = "1zOniKECnS2sxO3a1bF9mwvUUpNB12kBh"
OUT = Path(__file__).resolve().parent.parent / "episodes.json"

# Versions found in filenames, best first. The first one present becomes the default.
TAG_ORDER = ["HQ", "HQ2", "Normal", "UNCUT", "SUB"]


def fetch_files():
    url = f"https://drive.google.com/embeddedfolderview?id={FOLDER_ID}"
    # curl uses the system certificates, which python.org builds of Python on macOS lack
    page = subprocess.run(["curl", "-sfL", "--max-time", "30", url],
                          check=True, capture_output=True, text=True).stdout
    pattern = re.compile(r'id="entry-([\w-]+)".*?class="flip-entry-title">([^<]*)<', re.S)
    return [(fid, html.unescape(name)) for fid, name in pattern.findall(page)]


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower().replace("in hindi", ""))


def parse(name):
    base = re.sub(r"\.mp4$", "", name, flags=re.I)
    tag = "Normal"
    m = re.search(r"_HIN(?:\.([A-Z0-9]+))?$", base)
    if m:
        tag = m.group(1) or "Normal"
        base = base[: m.start()]

    sp = re.match(r"SP\.E(\d+)\s*(.*)", base)
    ep = re.search(r"\bE(\d{3,4})(?:\((\d)\))?\s*(.*)", base)
    if sp:
        kind, num, part, rest = "special", int(sp.group(1)), 0, sp.group(2)
    elif ep:
        kind, num, part, rest = "episode", int(ep.group(1)), int(ep.group(2) or 0), ep.group(3)
    else:
        kind, num, part, rest = "special", 0, 0, base

    rest = re.sub(r"^(Doraemon( in hindi)?\s*-\s*)", "", rest, flags=re.I)
    rest = re.sub(r"(\s+in hindi|\s+episode \d{4}|\s+hd\d*)+$", "", rest, flags=re.I).strip()
    title, alt = rest, ""
    m = re.match(r"(.*?)\s*\((.+)\)\s*$", rest)
    if m:
        title, alt = m.group(1), m.group(2)
    return kind, num, part, title.strip(), alt.strip(), tag


def main():
    files = fetch_files()
    groups = {}
    for fid, name in files:
        if not name.lower().endswith(".mp4"):
            continue
        kind, num, part, title, alt, tag = parse(name)
        key = (kind != "episode", num, part, norm(title))
        g = groups.setdefault(key, {"kind": kind, "ep": num, "part": part,
                                    "title": title, "alt": alt, "versions": {}})
        g["versions"].setdefault(tag, fid)

    episodes = []
    for key in sorted(groups):
        g = groups[key]
        tags = sorted(g["versions"], key=lambda t: TAG_ORDER.index(t) if t in TAG_ORDER else 99)
        if g["kind"] == "episode":
            code = f"E{g['ep']}" + (f"·{g['part']}" if g["part"] else "")
        else:
            code = f"SP{g['ep']}" if g["ep"] else "SP"
        episodes.append({
            "code": code,
            "title": g["title"],
            "alt": g["alt"],
            "versions": [{"tag": t, "id": g["versions"][t]} for t in tags],
        })

    OUT.write_text(json.dumps(episodes, ensure_ascii=False, indent=1) + "\n")
    print(f"{len(files)} files -> {len(episodes)} episodes written to {OUT.name}")


if __name__ == "__main__":
    main()

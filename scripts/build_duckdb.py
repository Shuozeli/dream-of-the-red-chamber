#!/usr/bin/env python
"""Reconstruct ui/public/hongloumeng.duckdb from the public JSON files.

The published repo contains only `data/json/*.json` (human-readable, diffable)
and the React/UI sources. This script is the bridge: it turns the JSON into a
fresh .duckdb that the in-browser DuckDB-WASM can query — exactly the same
schema the UI expects, so no client changes are needed.

Run:
    # The version pin matters: the WASM client (@duckdb/duckdb-wasm 1.33.x)
    # reads DuckDB v1.3 format. Python `duckdb>=1.4` writes v1.5+ files
    # that the WASM client can't open. Always pin to a 1.3.x.
    uv run --with 'duckdb==1.3.2' scripts/build_duckdb.py

Inputs:  data/json/{stats,characters,events,poems,chapters}.json
         data/parsed/chapter-NNN.md
Output:  ui/public/hongloumeng.duckdb

Idempotent — deletes the output file first.
"""
import json
import os
import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
JSON_DIR = ROOT / "data" / "json"
PARSED_DIR = ROOT / "data" / "parsed"
OUT_PATH = ROOT / "ui" / "public" / "hongloumeng.duckdb"


def main() -> int:
    if OUT_PATH.exists():
        OUT_PATH.unlink()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    con = duckdb.connect(str(OUT_PATH))

    # ---- schema ----
    con.execute(
        """
        CREATE TABLE chapters (
            id INTEGER PRIMARY KEY,
            title VARCHAR NOT NULL,
            word_count INTEGER NOT NULL,
            parsed_path VARCHAR NOT NULL
        );
        CREATE TABLE poems (
            id INTEGER PRIMARY KEY,
            chapter INTEGER NOT NULL,
            scene_index INTEGER NOT NULL,
            text VARCHAR NOT NULL
        );
        CREATE TABLE poem_annotations (
            poem_id INTEGER PRIMARY KEY,
            form VARCHAR NOT NULL,
            title VARCHAR,
            author_id INTEGER,
            author_unresolved VARCHAR,
            occasion VARCHAR,
            dedicatee_ids INTEGER[] NOT NULL,
            themes VARCHAR[] NOT NULL,
            confidence DOUBLE
        );
        CREATE TABLE characters (
            id INTEGER PRIMARY KEY,
            canonical_slug VARCHAR NOT NULL,
            canonical_name VARCHAR NOT NULL,
            aliases VARCHAR[] NOT NULL,
            first_chapter INTEGER NOT NULL,
            chapters_count INTEGER NOT NULL,
            primary_role VARCHAR NOT NULL
        );
        CREATE TABLE canonical_events (
            id INTEGER PRIMARY KEY,
            chapter INTEGER NOT NULL,
            scene_index INTEGER NOT NULL,
            type VARCHAR NOT NULL,
            title VARCHAR NOT NULL,
            summary VARCHAR NOT NULL,
            participant_ids INTEGER[] NOT NULL,
            unresolved_participants VARCHAR[] NOT NULL,
            location_hint VARCHAR,
            evidence_quote VARCHAR
        );
        """
    )

    # ---- chapters (text not in JSON; read from data/parsed/*.md to compute
    # the parsed_path; UI fetches the actual MD file at /parsed/...md) ----
    with (JSON_DIR / "chapters.json").open() as f:
        chapters = json.load(f)
    for c in chapters:
        n = int(c["id"])
        parsed_path = f"data/parsed/chapter-{n:03d}.md"
        con.execute(
            "INSERT INTO chapters VALUES (?, ?, ?, ?)",
            [n, c["title"], int(c["word_count"]), parsed_path],
        )

    # ---- poems + poem_annotations (from one combined JSON; split here) ----
    with (JSON_DIR / "poems.json").open() as f:
        poems = json.load(f)
    for p in poems:
        con.execute(
            "INSERT INTO poems VALUES (?, ?, ?, ?)",
            [int(p["id"]), int(p["chapter"]), int(p["scene_index"]), p["text"]],
        )
        con.execute(
            "INSERT INTO poem_annotations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                int(p["id"]),
                p["form"],
                p.get("title"),
                p.get("author_id"),
                p.get("author_unresolved"),
                p.get("occasion"),
                [int(x) for x in p.get("dedicatee_ids", [])],
                list(p.get("themes", [])),
                float(p.get("confidence", 0.0)),
            ],
        )

    # ---- characters ----
    with (JSON_DIR / "characters.json").open() as f:
        characters = json.load(f)
    for c in characters:
        con.execute(
            "INSERT INTO characters VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                int(c["id"]),
                c["canonical_slug"],
                c["canonical_name"],
                list(c.get("aliases", [])),
                int(c["first_chapter"]),
                int(c["chapters_count"]),
                c["primary_role"],
            ],
        )

    # ---- canonical_events ----
    with (JSON_DIR / "events.json").open() as f:
        events = json.load(f)
    for e in events:
        con.execute(
            "INSERT INTO canonical_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                int(e["id"]),
                int(e["chapter"]),
                int(e["scene_index"]),
                e["kind"],
                e["title"],
                e["summary"],
                [int(x) for x in e.get("participant_ids", [])],
                list(e.get("unresolved_participants", [])),
                e.get("location_hint"),
                e.get("evidence_quote"),
            ],
        )

    # ---- sanity ----
    counts = {
        "chapters": con.execute("SELECT count(*) FROM chapters").fetchone()[0],
        "poems": con.execute("SELECT count(*) FROM poems").fetchone()[0],
        "poem_annotations": con.execute("SELECT count(*) FROM poem_annotations").fetchone()[0],
        "characters": con.execute("SELECT count(*) FROM characters").fetchone()[0],
        "canonical_events": con.execute("SELECT count(*) FROM canonical_events").fetchone()[0],
    }
    for k, v in counts.items():
        print(f"  {k:<20} {v}")
    con.close()

    size_mb = OUT_PATH.stat().st_size / 1024 / 1024
    print(f"\nWrote {OUT_PATH} ({size_mb:.1f} MB)")

    # Sanity check: a few key joins
    con = duckdb.connect(str(OUT_PATH), read_only=True)
    poems_joined = con.execute(
        "SELECT count(*) FROM poems p JOIN poem_annotations pa ON pa.poem_id = p.id"
    ).fetchone()[0]
    print(f"  poems × poem_annotations joined rows: {poems_joined}")
    if poems_joined != counts["poem_annotations"]:
        print("  ⚠ JOIN row count mismatch — ids didn't line up")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())

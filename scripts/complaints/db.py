"""Shared DB helpers for the complaints pipeline.

Connection: $VH_COMPLAINTS_PG (libpq URL/DSN or Npgsql "Host=..;Port=.." string). When it isn't set,
the dev API's user-secrets ConnectionStrings:valhelp is used, which points at the LAN dev DB (vance.host).
Complaint data is dev-only; nothing here ever writes to Supabase.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import sys
from pathlib import Path

import psycopg

# Titles/comments contain any script; a redirected Windows console defaults to cp1252 and would crash on print.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

USER_SECRETS_ID = "d1358828-85af-480d-9285-cf9e7898e8f3"  # api/ValHelpApi.csproj
SCHEMA_SQL = Path(__file__).with_name("schema.sql")

_NPGSQL_KEYS = {
    "host": "host", "server": "host", "port": "port", "database": "dbname",
    "username": "user", "user id": "user", "userid": "user", "user": "user",
    "password": "password", "pwd": "password",
}


def _npgsql_to_kwargs(cs: str) -> dict:
    out = {}
    for part in cs.split(";"):
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        key = _NPGSQL_KEYS.get(k.strip().lower())
        if key:
            out[key] = v.strip()
    return out


def user_secret(name: str, env: str | None = None) -> str:
    """A value from $env, or else from the api project's user-secrets (dotnet user-secrets set ... --project api)."""
    if env and os.environ.get(env):
        return os.environ[env]
    p = Path(os.environ["APPDATA"]) / "Microsoft" / "UserSecrets" / USER_SECRETS_ID / "secrets.json"
    secrets_json = json.loads(p.read_text(encoding="utf-8-sig"))  # dotnet writes a BOM
    if name not in secrets_json:
        raise SystemExit(f"missing secret {name!r}: dotnet user-secrets set \"{name}\" <value> --project api"
                         + (f" (or set ${env})" if env else ""))
    return secrets_json[name]


def _conn_kwargs() -> dict:
    cs = user_secret("ConnectionStrings:valhelp", "VH_COMPLAINTS_PG")
    if cs.startswith(("postgres://", "postgresql://")) or ("=" in cs and ";" not in cs):
        return {"conninfo": cs}
    return _npgsql_to_kwargs(cs)


def connect() -> psycopg.Connection:
    conn = psycopg.connect(**_conn_kwargs(), application_name="valhelp-complaints", autocommit=True)
    ensure_schema(conn)
    return conn


def ensure_schema(conn: psycopg.Connection) -> None:
    with conn.transaction():
        conn.execute(SCHEMA_SQL.read_text(encoding="utf-8"))


def author_hasher(conn: psycopg.Connection):
    """HMAC author ids with a salt kept in the DB, so the same author hashes the same on every
    machine and run, and raw platform ids never get stored."""
    with conn.transaction():
        conn.execute(
            "INSERT INTO complaints.settings (key, value) VALUES ('author_salt', %s) ON CONFLICT DO NOTHING",
            (secrets.token_hex(32),),
        )
        salt = conn.execute("SELECT value FROM complaints.settings WHERE key = 'author_salt'").fetchone()[0]
    key = bytes.fromhex(salt)

    def h(source: str, author_id) -> str | None:
        if author_id in (None, ""):
            return None
        return hmac.new(key, f"{source}:{author_id}".encode(), hashlib.sha256).hexdigest()[:32]

    return h


def load_state(conn: psycopg.Connection, source: str, key: str = "default") -> dict:
    row = conn.execute(
        "SELECT state FROM complaints.collector_state WHERE source = %s AND key = %s", (source, key)
    ).fetchone()
    return dict(row[0]) if row else {}


def save_state(conn: psycopg.Connection, source: str, state: dict, key: str = "default") -> None:
    conn.execute(
        """INSERT INTO complaints.collector_state (source, key, state, updated_at)
           VALUES (%s, %s, %s, now())
           ON CONFLICT (source, key) DO UPDATE SET state = excluded.state, updated_at = now()""",
        (source, key, json.dumps(state)),
    )


UPSERT_SQL = """
INSERT INTO complaints.raw_post
    (source, external_id, parent_external_id, url, author_hash, posted_at, edited_at, language,
     title, body, score, recommended, author_playtime_min, meta)
VALUES
    (%(source)s, %(external_id)s, %(parent_external_id)s, %(url)s, %(author_hash)s, %(posted_at)s,
     %(edited_at)s, %(language)s, %(title)s, %(body)s, %(score)s, %(recommended)s,
     %(author_playtime_min)s, %(meta)s)
ON CONFLICT (source, external_id) DO UPDATE SET
    url = excluded.url,
    edited_at = excluded.edited_at,
    language = excluded.language,
    title = excluded.title,
    body = excluded.body,
    score = excluded.score,
    recommended = excluded.recommended,
    author_playtime_min = excluded.author_playtime_min,
    meta = excluded.meta,
    fetched_at = now()
RETURNING (xmax = 0) AS inserted
"""


def upsert_posts(conn: psycopg.Connection, rows: list[dict]) -> tuple[int, int]:
    """Insert or refresh posts. Returns (inserted, updated)."""
    ins = upd = 0
    with conn.cursor() as cur:
        for r in rows:
            r = {**r, "meta": json.dumps(r.get("meta") or {})}
            cur.execute(UPSERT_SQL, r)
            if cur.fetchone()[0]:
                ins += 1
            else:
                upd += 1
    return ins, upd

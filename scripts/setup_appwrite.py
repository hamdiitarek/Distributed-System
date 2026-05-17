#!/usr/bin/env python3
"""
setup_appwrite.py — Idempotent provisioner for the auction system's Appwrite
                    database and collection schema.

Reads credentials from env vars (or a .env file next to this script):

    APPWRITE_ENDPOINT    e.g. https://cloud.appwrite.io/v1
    APPWRITE_PROJECT_ID  e.g. 6500abcdef...
    APPWRITE_API_KEY     Server API key with databases.write permission
    APPWRITE_DB_ID       Defaults to "auction"
    APPWRITE_RESULTS_ID  Defaults to "auction_results"

Usage:
    pip install appwrite python-dotenv
    python scripts/setup_appwrite.py
"""

from __future__ import annotations

import os
import sys
import time
import warnings
from pathlib import Path
from typing import Callable, Optional

warnings.filterwarnings("ignore", category=DeprecationWarning)

# ─── Optional .env loading ────────────────────────────────────────────────
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / "packages" / "frontend" / ".env.local")
    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

# ─── Appwrite SDK ─────────────────────────────────────────────────────────
try:
    from appwrite.client import Client
    from appwrite.services.databases import Databases
except ImportError as e:
    sys.stderr.write(
        f"Could not import Appwrite SDK ({e}).\n"
        "Install with:\n    pip install appwrite python-dotenv\n"
    )
    sys.exit(1)

# AppwriteException's module path varies by SDK major version.
AppwriteException: type = Exception
for _path in ("appwrite.exception", "appwrite.exceptions"):
    try:
        AppwriteException = __import__(_path, fromlist=["AppwriteException"]).AppwriteException  # type: ignore
        break
    except (ImportError, AttributeError):
        continue


ENDPOINT = os.environ.get("APPWRITE_ENDPOINT", "https://cloud.appwrite.io/v1")
PROJECT_ID = os.environ.get("APPWRITE_PROJECT_ID")
API_KEY = os.environ.get("APPWRITE_API_KEY")
DB_ID = os.environ.get("APPWRITE_DB_ID", "auction")
DB_NAME = os.environ.get("APPWRITE_DB_NAME", "Auction")
RESULTS_ID = os.environ.get("APPWRITE_RESULTS_ID", "auction_results")
RESULTS_NAME = os.environ.get("APPWRITE_RESULTS_NAME", "Auction Results")


def log(msg: str) -> None:
    print(f"[appwrite-setup] {msg}", flush=True)


def require_env() -> None:
    missing = [k for k, v in {"APPWRITE_PROJECT_ID": PROJECT_ID, "APPWRITE_API_KEY": API_KEY}.items() if not v]
    if missing:
        sys.stderr.write(
            "Missing env vars: " + ", ".join(missing) + "\n"
            "Set them, or put them in scripts/.env\n"
        )
        sys.exit(2)


def ignore_409(fn: Callable, label: str) -> Optional[dict]:
    """Run a create-* call, swallowing 'already exists' errors so the script
    is idempotent and re-runnable."""
    try:
        result = fn()
        log(f"created {label}")
        return result
    except AppwriteException as e:
        if getattr(e, "code", None) == 409 or "already exists" in str(e).lower():
            log(f"exists  {label}")
            return None
        sys.stderr.write(f"[FAIL] {label}: {e}\n")
        raise


def main() -> None:
    require_env()

    client = (
        Client()
        .set_endpoint(ENDPOINT)
        .set_project(PROJECT_ID)
        .set_key(API_KEY)
    )
    db = Databases(client)

    log(f"endpoint = {ENDPOINT}")
    log(f"project  = {PROJECT_ID}")
    log(f"db       = {DB_ID}")

    # ── 1. Database ───────────────────────────────────────────────────
    ignore_409(
        lambda: db.create(database_id=DB_ID, name=DB_NAME),
        f"database '{DB_ID}'",
    )

    # ── 2. Collection ─────────────────────────────────────────────────
    ignore_409(
        lambda: db.create_collection(
            database_id=DB_ID,
            collection_id=RESULTS_ID,
            name=RESULTS_NAME,
            permissions=[
                'read("any")',         # public results board
                'create("users")',     # any signed-in user can create (peer server uses API key anyway)
            ],
            document_security=False,
        ),
        f"collection '{RESULTS_ID}'",
    )

    # ── 3. Attributes ─────────────────────────────────────────────────
    # Each helper is idempotent via ignore_409.

    def str_attr(key: str, size: int, required: bool, default: Optional[str] = None):
        kwargs = dict(
            database_id=DB_ID,
            collection_id=RESULTS_ID,
            key=key,
            size=size,
            required=required,
        )
        if not required and default is not None:
            kwargs["default"] = default
        ignore_409(
            lambda: db.create_string_attribute(**kwargs),
            f"string  {key}({size}){' required' if required else ''}",
        )

    def int_attr(key: str, required: bool, default: Optional[int] = None, min_: int = 0):
        # Appwrite forbids `default` on required attributes.
        kwargs = dict(
            database_id=DB_ID,
            collection_id=RESULTS_ID,
            key=key,
            required=required,
            min=min_,
            max=2_147_483_647,
        )
        if not required and default is not None:
            kwargs["default"] = default
        ignore_409(
            lambda: db.create_integer_attribute(**kwargs),
            f"integer {key}{' required' if required else ''}",
        )

    def float_attr(key: str, required: bool, default: Optional[float] = None):
        kwargs = dict(
            database_id=DB_ID,
            collection_id=RESULTS_ID,
            key=key,
            required=required,
        )
        if not required and default is not None:
            kwargs["default"] = default
        ignore_409(
            lambda: db.create_float_attribute(**kwargs),
            f"float   {key}{' required' if required else ''}",
        )

    def datetime_attr(key: str, required: bool):
        ignore_409(
            lambda: db.create_datetime_attribute(
                database_id=DB_ID,
                collection_id=RESULTS_ID,
                key=key,
                required=required,
            ),
            f"datetime {key}{' required' if required else ''}",
        )

    # The schema documented in README.md
    str_attr("auctionId", 64, True)
    str_attr("winnerId", 64, False)
    str_attr("winnerName", 128, False)
    float_attr("finalBid", False)
    float_attr("reservePrice", True)
    float_attr("startingBid", True)
    int_attr("bidCount", True, min_=0)
    datetime_attr("endedAt", True)
    datetime_attr("startedAt", False)
    str_attr("coordinatorPeerId", 32, True)
    int_attr("lamportTime", True, min_=0)
    # Appwrite enforces a per-row size cap; keep bidHistory compact.
    # Roughly fits ~100 bids of JSON like
    #   {"u":"abc123","a":1234,"l":42,"p":"peer-2"}
    str_attr("bidHistory", 4000, False)

    # ── 4. Wait for attributes to be "available" before adding indexes
    log("waiting for attributes to finish processing…")

    def _coerce(obj):
        """Normalize SDK responses (dict or pydantic model) to a dict."""
        if isinstance(obj, dict):
            return obj
        for attr in ("model_dump", "dict"):
            fn = getattr(obj, attr, None)
            if callable(fn):
                return fn()
        return {"attributes": getattr(obj, "attributes", [])}

    def _status(a):
        if isinstance(a, dict):
            return a.get("status")
        return getattr(a, "status", None)

    for _ in range(30):
        raw = db.list_attributes(database_id=DB_ID, collection_id=RESULTS_ID)
        attrs = _coerce(raw).get("attributes", []) or getattr(raw, "attributes", [])
        if attrs and all(_status(a) == "available" for a in attrs):
            break
        time.sleep(1)
    else:
        log("WARNING: some attributes still processing — indexes may need a re-run")

    # ── 5. Indexes ────────────────────────────────────────────────────
    def index(key: str, type_: str, attributes: list[str], orders: Optional[list[str]] = None):
        ignore_409(
            lambda: db.create_index(
                database_id=DB_ID,
                collection_id=RESULTS_ID,
                key=key,
                type=type_,
                attributes=attributes,
                orders=orders,
            ),
            f"index   {key} ({type_} on {attributes})",
        )

    index("auctionId_unique", "unique", ["auctionId"])
    index("winnerId_lookup", "key", ["winnerId"])
    index("endedAt_desc", "key", ["endedAt"], orders=["DESC"])

    log("✓ done. Frontend env should set:")
    print(
        f"\n  NEXT_PUBLIC_APPWRITE_PROJECT_ID={PROJECT_ID}\n"
        f"  NEXT_PUBLIC_APPWRITE_DB_ID={DB_ID}\n"
        f"  NEXT_PUBLIC_APPWRITE_RESULTS_COLLECTION={RESULTS_ID}\n"
    )


if __name__ == "__main__":
    main()

# NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT
#!/usr/bin/env python3
import argparse
import ctypes
import ctypes.util
import datetime as dt
import json
import os
import pathlib
import re
import shutil
import sqlite3
import select
import subprocess
import tempfile
import time

HOME = pathlib.Path.home()
BRAVE_ROOT = HOME / ".config" / "BraveSoftware" / "Brave-Browser"
CODEX_ROOT = HOME / ".codex"
CODEX_STATE = CODEX_ROOT / "state_5.sqlite"
PROJECTS_ROOT = CODEX_ROOT / ".chatgpt-projects"
WORK_LOCATOR_ROOT = CODEX_ROOT / "work-thread-locators"

def chromium_time(us):
    try:
        return (
            dt.datetime(1601, 1, 1, tzinfo=dt.timezone.utc)
            + dt.timedelta(microseconds=int(us))
        ).isoformat()
    except Exception:
        return None

def unix_time(sec):
    try:
        return dt.datetime.fromtimestamp(float(sec), tz=dt.timezone.utc).isoformat()
    except Exception:
        return None
def copy_sqlite(src, label):
    tmp = pathlib.Path(tempfile.gettempdir()) / (
        "chatgpt-thread-find-" + label + ".sqlite"
    )
    shutil.copy2(src, tmp)
    return tmp

def query_matches(query, haystack):
    terms = [term for term in query.casefold().replace("-", " ").split() if term]
    hay = haystack.casefold().replace("-", " ")
    return all(term in hay for term in terms)

def brave_results(query):
    q = query.casefold()
    out = []
    if not BRAVE_ROOT.exists():
        return out
    profiles = [BRAVE_ROOT / "Default", *sorted(BRAVE_ROOT.glob("Profile *"))]
    for profile in profiles:
        history = profile / "History"
        if not history.exists():
            continue
        try:
            db = sqlite3.connect(
                copy_sqlite(history, "brave-" + profile.name.replace(" ", "_"))
            )
            rows = db.execute(
                """select url,title,last_visit_time,visit_count
                   from urls
                   where url like 'https://chatgpt.com/%'
                   order by last_visit_time desc
                   limit 5000"""
            ).fetchall()
        except Exception:
            continue
        for url, title, last, visits in rows:
            hay = (title or "") + "\n" + (url or "")
            if not query_matches(query, hay):
                continue
            kind = (
                "web_work"
                if "surface=work" in (url or "") or "/branch/" in (url or "")
                else "web_chat"
            )
            out.append(
                {
                    "surface": "brave",
                    "kind": kind,
                    "title": title or "",
                    "locator": url,
                    "updated_at": chromium_time(last),
                    "profile": profile.name,
                    "visits": visits,
                    "confidence": "direct_history_url",
                }
            )
    return out

def _desktop_app_tools_pipe():
    """Return the current desktop app-tools pipe from process metadata only."""
    proc = pathlib.Path("/proc")
    for entry in proc.iterdir():
        if not entry.name.isdigit():
            continue
        try:
            args = (entry / "cmdline").read_bytes().replace(b"\0", b" ").decode("utf-8", "ignore")
        except Exception:
            continue
        if "/usr/lib/chatgpt/resources/codex" not in args or " app-server " not in f" {args} ":
            continue
        match = re.search(r'CODEX_APP_TOOLS_PIPE_PATH[\\\"]*=+[\\\"]([^\\\"]+)', args)
        if match:
            return match.group(1)
        # Current desktop command embeds TOML-ish env={KEY="value"}.
        match = re.search(r'CODEX_APP_TOOLS_PIPE_PATH[^=]*=[\\\"]([^\\\"]+)', args)
        if match:
            return match.group(1)
    return None

def _interaction_client_id():
    """Pick a recent non-archived local Codex rollout identity without reading its body."""
    candidates = []
    roots = [CODEX_ROOT / "sessions"]
    pattern = re.compile(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$")
    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("rollout-*.jsonl"):
            match = pattern.search(path.name)
            if not match:
                continue
            try:
                candidates.append((path.stat().st_mtime, match.group(1)))
            except Exception:
                continue
    return max(candidates)[1] if candidates else None

def _mcp_read_line(proc, target_id, timeout=12.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        ready, _, _ = select.select([proc.stdout], [], [], max(0, deadline - time.time()))
        if not ready:
            return None
        line = proc.stdout.readline()
        if not line:
            return None
        try:
            obj = json.loads(line)
        except Exception:
            continue
        if obj.get("id") == target_id:
            return obj
    return None

def live_app_threads():
    """Read only the live ChatGPT app thread index; never inspect message bodies."""
    pipe = _desktop_app_tools_pipe()
    interaction = _interaction_client_id()
    launcher = pathlib.Path(
        "/usr/lib/chatgpt/resources/plugins/openai-bundled/plugins/"
        "codex-app-tools/scripts/launch_codex_app_tools_mcp"
    )
    server = pathlib.Path(
        "/usr/lib/chatgpt/resources/plugins/openai-bundled/plugins/"
        "codex-app-tools/server.mjs"
    )
    if not pipe or not interaction or not launcher.exists() or not server.exists():
        return []
    env = os.environ.copy()
    env["CODEX_APP_TOOLS_PIPE_PATH"] = pipe
    try:
        proc = subprocess.Popen(
            [str(launcher), str(server), "--interaction-client-id", interaction],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
            env=env,
        )
        def send(obj):
            proc.stdin.write(json.dumps(obj, separators=(",", ":")) + "\n")
            proc.stdin.flush()
        send({
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18", "capabilities": {},
                "clientInfo": {"name": "chatgpt-thread-find", "version": "1"},
            },
        })
        if not _mcp_read_line(proc, 1):
            proc.kill()
            return []
        send({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})
        send({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
        if not _mcp_read_line(proc, 2):
            proc.kill()
            return []
        send({
            "jsonrpc": "2.0", "id": 3, "method": "tools/call",
            "params": {"name": "list_threads", "arguments": {"limit": 50}},
        })
        response = _mcp_read_line(proc, 3, timeout=15.0)
        proc.terminate()
        if not response or "result" not in response:
            return []
        text_items = [
            item.get("text", "")
            for item in response.get("result", {}).get("content", [])
            if item.get("type") == "text"
        ]
        payload = json.loads("".join(text_items))
        return [
            item for item in [*payload.get("pinnedThreads", []), *payload.get("threads", [])]
            if isinstance(item, dict)
        ]
    except Exception:
        return []

def live_app_results(query):
    out = []
    seen = set()
    for row in live_app_threads():
        thread_id = str(row.get("id") or row.get("threadId") or "")
        title = str(row.get("title") or "")
        project_id = str(row.get("projectId") or "")
        kind = str(row.get("kind") or "")
        status = row.get("status")
        hay = "\n".join((thread_id, title, project_id, kind))
        if not query_matches(query, hay) or not thread_id or thread_id in seen:
            continue
        seen.add(thread_id)
        updated = row.get("updatedAt") or row.get("updated_at")
        updated_iso = None
        if isinstance(updated, (int, float)):
            updated_iso = unix_time(updated / 1000.0 if updated > 1_000_000_000_000 else updated)
        elif isinstance(updated, str):
            try:
                updated_iso = unix_time(float(updated) / 1000.0 if float(updated) > 1_000_000_000_000 else float(updated))
            except Exception:
                updated_iso = updated
        out.append({
            "surface": "chatgpt_app_live",
            "kind": "cloud_chatgpt" if kind.casefold() == "chatgpt" else f"live_{kind or 'thread'}",
            "title": title,
            "locator": f"chatgpt-thread-id:{thread_id}",
            "thread_id": thread_id,
            "project_id": row.get("projectId"),
            "updated_at": updated_iso,
            "status": status.get("type") if isinstance(status, dict) else status,
            "confidence": "live_app_thread_index",
        })
    return out

def app_thread_results(query):
    q = query.casefold()
    out = []
    if CODEX_STATE.exists():
        try:
            db = sqlite3.connect(f"file:{CODEX_STATE}?mode=ro", uri=True)
            db.row_factory = sqlite3.Row
            rows = db.execute(
                """select id,title,name,project_id,updated_at,updated_at_ms,
                          archived,is_pinned
                   from threads
                   where thread_source='user'
                   order by coalesce(updated_at_ms,created_at_ms) desc
                   limit 5000"""
            ).fetchall()
            for row in rows:
                title = row["name"] or row["title"] or ""
                if q not in title.casefold() and q not in row["id"].casefold():
                    continue
                updated = row["updated_at_ms"]
                updated_iso = (
                    unix_time(updated / 1000.0)
                    if updated
                    else unix_time(row["updated_at"])
                )
                out.append(
                    {
                        "surface": "chatgpt_app",
                        "kind": "app_work_thread",
                        "title": title[:240],
                        "locator": f"codex://threads/{row['id']}",
                        "thread_id": row["id"],
                        "project_id": row["project_id"],
                        "updated_at": updated_iso,
                        "archived": bool(row["archived"]),
                        "pinned": bool(row["is_pinned"]),
                        "confidence": "app_state_thread_index",
                    }
                )
        except Exception:
            pass
    locator_paths = []
    if PROJECTS_ROOT.exists():
        locator_paths.extend(PROJECTS_ROOT.rglob("WORK-THREAD-LOCATOR.json"))
    if WORK_LOCATOR_ROOT.exists():
        locator_paths.extend(WORK_LOCATOR_ROOT.glob("*.WORK-THREAD-LOCATOR.json"))
    for locator_path in locator_paths:
        try:
            obj = json.loads(locator_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        title = obj.get("requested_work_title") or obj.get("work_thread_title") or ""
        thread_id = obj.get("work_thread_id") or ""
        project_id = obj.get("chatgpt_project_id") or obj.get("project_id")
        hay = "\n".join((title, thread_id, str(obj.get("branch") or ""), str(obj.get("dispatch_id") or "")))
        if not query_matches(query, hay):
            continue
        is_cloud = obj.get("surface") == "CHATGPT_WORK_CLOUD"
        locator = obj.get("work_thread_uri")
        if not locator and thread_id:
            locator = f"chatgpt-thread-id:{thread_id}" if is_cloud else f"codex://threads/{thread_id}"
        out.append(
            {
                "surface": "chatgpt_app",
                "kind": "app_work_cloud_locator" if is_cloud else "app_work_locator",
                "title": title,
                "locator": locator,
                "thread_id": thread_id,
                "project_id": project_id,
                "branch": obj.get("branch"),
                "updated_at": obj.get("verified_at") or obj.get("verified_final_message_timestamp"),
                "receipt_path": obj.get("receipt_path"),
                "confidence": "durable_work_cloud_locator" if is_cloud else "durable_work_thread_locator",
            }
        )
    return out

def source_chat_results(query):
    out = []
    if not PROJECTS_ROOT.exists():
        return out
    seen = set()
    candidates = []
    skip_dirs = {
        ".git", "node_modules", ".venv", "venv", "dist", "build",
        "cache", ".cache", "vendor", "__pycache__", "coverage",
    }
    for root, dirs, files in os.walk(PROJECTS_ROOT):
        dirs[:] = [d for d in dirs if d not in skip_dirs]
        for name in files:
            lower = name.casefold()
            if not lower.endswith(".json"):
                continue
            if not any(tag in lower for tag in ("receipt", "handoff", "locator")):
                continue
            candidates.append(pathlib.Path(root) / name)
    for json_path in candidates:
        try:
            if json_path.stat().st_size > 2_000_000:
                continue
            obj = json.loads(json_path.read_text(encoding="utf-8"))
        except Exception:
            continue

        stack = [obj]
        while stack:
            current = stack.pop()
            if isinstance(current, dict):
                source = current.get("sourceChat")
                if isinstance(source, dict):
                    title = source.get("title") or ""
                    url = source.get("url") or ""
                    hay = f"{json_path}\n{title}\n{url}"
                    if url and query_matches(query, hay) and url not in seen:
                        seen.add(url)
                        out.append(
                            {
                                "surface": "chatgpt_app",
                                "kind": "app_chat_source_locator",
                                "title": title,
                                "locator": url,
                                "updated_at": None,
                                "source_file": str(json_path),
                                "confidence": "durable_source_chat_locator",
                            }
                        )
                for value in current.values():
                    if isinstance(value, (dict, list)):
                        stack.append(value)
            elif isinstance(current, list):
                for value in current:
                    if isinstance(value, (dict, list)):
                        stack.append(value)
    return out

def rank_key(result):
    confidence = {
        "durable_work_cloud_locator": 6,
        "live_app_thread_index": 5,
        "durable_source_chat_locator": 4,
        "durable_work_thread_locator": 3,
        "direct_history_url": 2,
        "app_state_thread_index": 1,
    }.get(result.get("confidence"), 0)
    return (confidence, result.get("updated_at") or "")

def desktop_gui_env():
    env = os.environ.copy()
    uid = os.getuid()
    env.setdefault("XDG_RUNTIME_DIR", f"/run/user/{uid}")
    env.setdefault(
        "DBUS_SESSION_BUS_ADDRESS",
        f"unix:path=/run/user/{uid}/bus",
    )
    try:
        text = subprocess.check_output(
            ["systemctl", "--user", "show-environment"],
            env=env,
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        text = ""
    for line in text.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key in {"DISPLAY", "XAUTHORITY"} and value:
            env[key] = value
    if not env.get("DISPLAY") or not env.get("XAUTHORITY"):
        raise SystemExit("Native Chat opener cannot resolve the active desktop X11 bridge.")
    return env

def topmost_chatgpt_window(env):
    listing = subprocess.check_output(
        ["xprop", "-root", "_NET_CLIENT_LIST_STACKING"],
        env=env,
        text=True,
        stderr=subprocess.DEVNULL,
    )
    windows = re.findall(r"0x[0-9a-fA-F]+", listing)
    for window in reversed(windows):
        try:
            props = subprocess.check_output(
                ["xprop", "-id", window, "WM_CLASS", "_NET_WM_PID"],
                env=env,
                text=True,
                stderr=subprocess.DEVNULL,
            )
        except Exception:
            continue
        if "Chatgpt" not in props and "chatgpt (" not in props:
            continue
        info = subprocess.check_output(
            ["xwininfo", "-id", window],
            env=env,
            text=True,
            stderr=subprocess.DEVNULL,
        )
        def number(label):
            match = re.search(rf"{re.escape(label)}\s+(-?\d+)", info)
            return int(match.group(1)) if match else None
        x = number("Absolute upper-left X:")
        y = number("Absolute upper-left Y:")
        width = number("Width:")
        height = number("Height:")
        if None not in (x, y, width, height) and width >= 800 and height >= 500:
            return int(window, 16), x, y, width, height
    raise SystemExit("No visible native ChatGPT desktop window was found.")

def native_chat_search_open(search_query):
    version = subprocess.run(
        ["chatgpt", "--version"],
        text=True,
        capture_output=True,
        check=False,
    ).stdout.strip()
    if version != "26.903.61454":
        raise SystemExit(
            "Native Chat UI automation is calibrated only for ChatGPT desktop "
            "26.903.61454; revalidate after an app update."
        )
    if not search_query or not all(ord(ch) < 128 for ch in search_query):
        raise SystemExit("Native Chat search currently requires a non-empty ASCII query.")

    env = desktop_gui_env()
    os.environ.update({"DISPLAY": env["DISPLAY"], "XAUTHORITY": env["XAUTHORITY"]})
    window, left, top, _, _ = topmost_chatgpt_window(env)

    x11 = ctypes.CDLL(ctypes.util.find_library("X11"))
    xtst = ctypes.CDLL(ctypes.util.find_library("Xtst"))
    display_t = ctypes.c_void_p
    window_t = ctypes.c_ulong
    x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
    x11.XOpenDisplay.restype = display_t
    x11.XStringToKeysym.argtypes = [ctypes.c_char_p]
    x11.XStringToKeysym.restype = ctypes.c_ulong
    x11.XKeysymToKeycode.argtypes = [display_t, ctypes.c_ulong]
    x11.XKeysymToKeycode.restype = ctypes.c_ubyte
    x11.XRaiseWindow.argtypes = [display_t, window_t]
    x11.XSetInputFocus.argtypes = [display_t, window_t, ctypes.c_int, ctypes.c_ulong]
    x11.XFlush.argtypes = [display_t]
    xtst.XTestFakeMotionEvent.argtypes = [
        display_t, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_ulong
    ]
    xtst.XTestFakeButtonEvent.argtypes = [
        display_t, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong
    ]
    xtst.XTestFakeKeyEvent.argtypes = [
        display_t, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong
    ]

    display = x11.XOpenDisplay(None)
    if not display:
        raise SystemExit("Could not open the active Xwayland display.")
    win = window_t(window)
    x11.XRaiseWindow(display, win)
    x11.XSetInputFocus(display, win, 2, 0)

    # Tested native sidebar Search control at this app version/layout.
    xtst.XTestFakeMotionEvent(display, 0, left + 223, top + 60, 0)
    xtst.XTestFakeButtonEvent(display, 1, 1, 0)
    xtst.XTestFakeButtonEvent(display, 1, 0, 0)
    x11.XFlush(display)
    time.sleep(0.8)

    def fake_key(name, down=True):
        keysym = x11.XStringToKeysym(name.encode())
        if not keysym:
            raise SystemExit(f"Unsupported native-search key: {name}")
        keycode = x11.XKeysymToKeycode(display, keysym)
        xtst.XTestFakeKeyEvent(display, keycode, 1 if down else 0, 0)

    fake_key("Control_L", True)
    fake_key("a", True)
    fake_key("a", False)
    fake_key("Control_L", False)
    for char in search_query.lower():
        if char == " ":
            fake_key("space", True)
            fake_key("space", False)
        elif char == "_":
            fake_key("Shift_L", True)
            fake_key("minus", True)
            fake_key("minus", False)
            fake_key("Shift_L", False)
        elif char.isalnum() or char in "-.":
            name = "minus" if char == "-" else "period" if char == "." else char
            fake_key(name, True)
            fake_key(name, False)
        else:
            raise SystemExit(f"Unsupported character in native-search query: {char!r}")
    x11.XFlush(display)
    time.sleep(2.0)
    fake_key("Return", True)
    fake_key("Return", False)
    x11.XFlush(display)
    time.sleep(2.5)

def open_result(result, native_query=None):
    locator = result.get("locator")
    if not locator:
        raise SystemExit("Result has no launchable locator")
    if result["surface"] == "brave":
        command = ["/opt/brave.com/brave/brave", locator]
        subprocess.Popen(
            command,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        return
    if result.get("kind") in {"app_chat_source_locator", "cloud_chatgpt", "app_work_cloud_locator"}:
        search_title = native_query or result.get("title") or ""
        if result.get("kind") == "app_work_cloud_locator" and result.get("thread_id"):
            live = next((item for item in live_app_threads() if str(item.get("id") or "") == result["thread_id"]), None)
            if live and live.get("title"):
                search_title = str(live["title"])
        native_chat_search_open(search_title)
        return
    subprocess.Popen(
        ["chatgpt", locator],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )

def main():
    parser = argparse.ArgumentParser(
        description=(
            "Search local ChatGPT thread metadata across Brave and ChatGPT "
            "desktop without reading message bodies."
        )
    )
    parser.add_argument("query")
    parser.add_argument("--json", action="store_true")
    parser.add_argument(
        "--native-query",
        help=(
            "Discriminating native Chat-search query for an ordinary Chat "
            "source locator. Required when the title is locally ambiguous."
        ),
    )
    parser.add_argument(
        "--open",
        type=int,
        metavar="N",
        help="Open 1-based result N in the correct client.",
    )
    args = parser.parse_args()

    results = (
        live_app_results(args.query)
        + source_chat_results(args.query)
        + brave_results(args.query)
        + app_thread_results(args.query)
    )
    results.sort(key=rank_key, reverse=True)

    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    elif not results:
        print("No local thread metadata match.")
    else:
        for index, result in enumerate(results, 1):
            print(
                f"{index}. [{result['surface']}/{result['kind']}] "
                f"{result.get('title', '')}"
            )
            print(
                f"   {result.get('updated_at') or 'time unknown'}  "
                f"{result.get('locator') or 'no locator'}"
            )
            print(f"   confidence={result.get('confidence')}")

    if args.open is not None:
        if args.open < 1 or args.open > len(results):
            raise SystemExit(f"--open must be between 1 and {len(results)}")
        selected = results[args.open - 1]
        native_query = args.native_query
        if selected.get("kind") == "app_chat_source_locator" and not native_query:
            title = (selected.get("title") or "").casefold().strip()
            same_title = set()
            for item in (
                source_chat_results(selected.get("title") or "")
                + brave_results(selected.get("title") or "")
            ):
                candidate = (item.get("title") or "").casefold().strip()
                same_logical_title = (
                    candidate == title
                    or (title and title in candidate)
                    or (candidate and candidate in title)
                )
                if same_logical_title and item.get("locator"):
                    same_title.add(item["locator"])
            if len(same_title) > 1:
                raise SystemExit(
                    "Ordinary Chat title is locally ambiguous; provide "
                    "--native-query with a discriminating task/message token."
                )
        open_result(selected, native_query=native_query)
        print(f"Opened result {args.open}.")

if __name__ == "__main__":
    main()

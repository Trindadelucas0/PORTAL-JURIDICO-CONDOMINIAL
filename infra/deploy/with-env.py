#!/usr/bin/env python3
import os
import sys
from pathlib import Path

def load(path: str) -> dict:
    env = os.environ.copy()
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key.startswith("export "):
            key = key[7:].strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        env[key] = value
    return env

repo_root = Path(__file__).resolve().parents[2]
os.chdir(repo_root)
env = load(str(repo_root / ".env"))
env["NODE_ENV"] = "production"
local_node = Path.home() / ".local" / "node" / "bin"
if local_node.is_dir():
    env["PATH"] = str(local_node) + ":" + env.get("PATH", "")
args = sys.argv[1:]
if args and args[0] == "--worker":
    env["JURICON_WORKER"] = "1"
    args = args[1:]
if not args:
    sys.stderr.write("missing command\n")
    sys.exit(2)
os.execvpe(args[0], args, env)

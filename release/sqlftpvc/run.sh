#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ -f "./sqlftpvc" ]; then
  ./sqlftpvc
  exit $?
fi

if [ -f "./sqlftpvc.exe" ]; then
  ./sqlftpvc.exe
  exit $?
fi

if [ -f "./PORTABLE" ]; then
  export PYTHONPATH="$(pwd)/api"
  ./.venv/bin/python -m sqlftpvc
  exit $?
fi

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi

source .venv/bin/activate

python -m pip install --upgrade pip
if [ -d "api/wheels" ]; then
  python -m pip install --no-index --find-links api/wheels -r api/requirements.txt
else
  python -m pip install -r api/requirements.txt
fi

export PYTHONPATH="$(pwd)/api"

python -m sqlftpvc

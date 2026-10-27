#!/bin/bash
# Double-click this file to open the Horizontal-Vertical Song Tagger.
cd "$(dirname "$0")" || exit 1
clear
if python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)' >/dev/null 2>&1; then
  python3 hv_tagger.py
else
  echo
  echo "  This tool needs Python 3, which isn't set up on this Mac yet."
  echo
  echo "  If a box just appeared asking to install 'command line developer tools',"
  echo "  click Install, wait for it to finish, then double-click Start Tagger again."
  echo
  echo "  Otherwise, download and install Python from:"
  echo "      https://www.python.org/downloads/"
  echo "  then double-click Start Tagger again."
fi
echo
read -n 1 -s -r -p "Press any key to close this window."
echo

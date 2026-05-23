#!/bin/sh
set -e
echo "AZM Lean Startup Road Map — starting on port ${PORT:-3847}"
exec node server.js

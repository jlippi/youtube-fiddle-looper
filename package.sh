#!/usr/bin/env bash
set -e

OUTPUT_ZIP="youtube-fiddle-looper.zip"

echo "Packaging YouTube Fiddle Looper extension into ${OUTPUT_ZIP}..."
rm -f "${OUTPUT_ZIP}"
zip -r "${OUTPUT_ZIP}" manifest.json content.js style.css README.md

echo "Done! Created ${OUTPUT_ZIP} with manifest.json at the root."

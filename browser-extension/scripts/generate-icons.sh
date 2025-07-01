#!/bin/bash

# Generate PNG icons from SVG for browser extension
# Requires ImageMagick (convert/magick command)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ICONS_DIR="$SCRIPT_DIR/../icons"
SVG_FILE="$ICONS_DIR/icon-toolbar.svg"

# Check if SVG file exists
if [ ! -f "$SVG_FILE" ]; then
    echo "Error: SVG file not found at $SVG_FILE"
    exit 1
fi

# Array of sizes needed for browser extension
SIZES=(16 32 48 128)

echo "Generating extension icons..."

# Generate PNG for each size
for size in "${SIZES[@]}"; do
    OUTPUT_FILE="$ICONS_DIR/icon-${size}.png"
    
    # Try magick first (ImageMagick 7), fall back to convert (ImageMagick 6)
    if command -v magick &> /dev/null; then
        magick "$SVG_FILE" -background none -resize ${size}x${size} "$OUTPUT_FILE"
    elif command -v convert &> /dev/null; then
        convert -background none -resize ${size}x${size} "$SVG_FILE" "$OUTPUT_FILE"
    else
        echo "Error: ImageMagick not found. Please install ImageMagick."
        exit 1
    fi
    
    if [ $? -eq 0 ]; then
        echo "✓ Generated icon-${size}.png"
    else
        echo "✗ Failed to generate icon-${size}.png"
        exit 1
    fi
done

echo "All icons generated successfully!"
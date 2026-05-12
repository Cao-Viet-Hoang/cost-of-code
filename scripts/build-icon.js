/**
 * Render media/icon.svg to media/icon.png (128x128) for the VS Code extension manifest.
 * Run with: node scripts/build-icon.js
 */
const fs = require('node:fs');
const path = require('node:path');
const { Resvg } = require('@resvg/resvg-js');

const root = path.resolve(__dirname, '..');
const svgPath = path.join(root, 'media', 'icon.svg');
const pngPath = path.join(root, 'media', 'icon.png');

const svg = fs.readFileSync(svgPath);
const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 128 } });
const png = resvg.render().asPng();
fs.writeFileSync(pngPath, png);
console.log(`Wrote ${pngPath} (${png.length} bytes)`);

// Regenerates public/manifest.json from every art/day_NNN.jpg present.
// Usage: node gen-manifest.js   (after dropping more optimized paintings in)
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'public', 'art');
const manifest = fs.readdirSync(dir)
  .filter(f => /^day_\d{3}\.jpg$/.test(f))
  .map(f => ({ day: parseInt(f.slice(4, 7), 10), file: 'art/' + f }))
  .sort((a, b) => a.day - b.day);

fs.writeFileSync(
  path.join(__dirname, 'public', 'manifest.json'),
  JSON.stringify(manifest)
);
console.log(`manifest.json: ${manifest.length} paintings`);

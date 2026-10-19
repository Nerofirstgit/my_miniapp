// Optional offline preparation. Reads my_lab fonts; writes only this miniapp's PNGs.
// node scripts/prepare-title-assets.cjs <font.json> <sharp module> <three directory> [--hero-only]
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const sharp = require(process.argv[3]);
const font = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const output = path.resolve(__dirname, '../miniprogram/assets/titles');

function glyphPath(outline) {
  const tokens = outline.split(/\s+/);
  const commands = [];
  for (let index = 0; index < tokens.length;) {
    const command = tokens[index++];
    if (command === 'm' || command === 'l') commands.push(`${command.toUpperCase()} ${tokens[index++]} ${tokens[index++]}`);
    else if (command === 'q') {
      const values = tokens.slice(index, index + 4); index += 4;
      commands.push(`Q ${values[2]} ${values[3]} ${values[0]} ${values[1]}`);
    } else if (command === 'b') {
      const values = tokens.slice(index, index + 6); index += 6;
      commands.push(`C ${values[2]} ${values[3]} ${values[4]} ${values[5]} ${values[0]} ${values[1]}`);
    } else throw new Error(`Unsupported font outline command: ${command}`);
  }
  return commands.join(' ');
}

async function render(name, width, height, body) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width * 3)}" height="${Math.round(height * 3)}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(output, `${name}.png`));
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  // Match my_lab HeroTitle's mobile geometry, including visible stroke bounds.
  // Dependencies are explicit offline inputs, never miniapp runtime imports.
  if (!process.argv[4]) throw new Error('Pass the installed three package directory');
  const threeRoot = path.resolve(process.argv[4]);
  const THREE = await import(pathToFileURL(path.join(threeRoot, 'build/three.module.js')).href);
  const { FontLoader } = await import(pathToFileURL(path.join(threeRoot, 'examples/jsm/loaders/FontLoader.js')).href);
  const parsedFont = new FontLoader().parse(font);
  const glyphs = Array.from('你好，我叫康彤', (character) => {
    const geometry = new THREE.ShapeGeometry(parsedFont.generateShapes(character, 1), 12);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox.clone();
    geometry.dispose();
    return { character, bounds, advance: font.glyphs[character].ha / font.resolution + .04 };
  });
  const lineHeight = Math.max(...glyphs.map(({ bounds }) => bounds.max.y - bounds.min.y));
  const bounds = new THREE.Box3();
  const positioned = [glyphs.slice(0, 2), glyphs.slice(3)].flatMap((row, rowIndex) => {
    let x = 0;
    const lineBounds = new THREE.Box3();
    const placed = row.map((glyph) => {
      const position = new THREE.Vector3(x, -rowIndex * lineHeight * 1.3, 0);
      lineBounds.union(glyph.bounds.clone().translate(position));
      x += glyph.advance;
      return { ...glyph, position };
    });
    const centerX = lineBounds.getCenter(new THREE.Vector3()).x;
    for (const glyph of placed) {
      glyph.position.x -= centerX;
      bounds.union(glyph.bounds.clone().translate(glyph.position));
    }
    return placed;
  });
  const width = 360;
  const height = width / 1.65;
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = Math.min(width * .92 / size.x, height * .8 / size.y);
  const paths = positioned.map(({ character, position }) => {
    const x = width / 2 + (position.x - center.x) * scale;
    const baseline = height / 2 - (position.y - center.y) * scale;
    return `<path fill="#f4f4f1" transform="translate(${x} ${baseline}) scale(${scale / font.resolution} ${-scale / font.resolution})" d="${glyphPath(font.glyphs[character].o)}"/>`;
  }).join('');
  await render('hero', width, height, paths);
  if (process.argv.includes('--hero-only')) return;
  for (const [name, label, size] of [['about', '关于我', 40], ['works', '作品介绍', 40], ['experience', '工作经历', 40], ['skills', '我的技能', 40], ['contact', '联系我', 48]]) {
    const width = label.length * size * .95 + size * .4;
    const body = Array.from(label, (character, index) => `<text x="${index * size * .95}" y="${size * .91}" font-family="Microsoft YaHei" font-weight="600" font-size="${size}" fill="#f4f4f1">${character}</text>`).join('')
      + `<text x="${label.length * size * .95 + size * .03}" y="${size * .91}" font-family="Microsoft YaHei" font-weight="600" font-size="${size}" fill="#e4ff4e">.</text>`;
    await render(name, width, size * 1.15, body);
  }
}
main().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });

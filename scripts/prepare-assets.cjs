// Optional maintenance utility; app runtime never reads the reference repository.
// Usage: node scripts/prepare-assets.cjs <reference-public> <sharp-module> <python>
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const [sourceDirectory, sharpModule, python] = process.argv.slice(2);
if (!sourceDirectory || !sharpModule || !python) {
  throw new Error('Provide reference public directory, installed sharp module and Python with Pillow.');
}
const source = path.resolve(sourceDirectory);
const target = path.resolve(__dirname, '../miniprogram/assets');
const sharp = require(path.resolve(sharpModule));

async function main() {
  const skillNames = ['html5', 'css3', 'javascript', 'typescript', 'java', 'spring', 'nextjs', 'react', 'vuejs', 'zustand', 'mysql', 'oracle', 'apachekafka', 'nginx', 'python', 'figma'];
  const icons = ['logo', 'companies/ping-an', 'companies/hon-hai', ...skillNames.map((name) => `skills/${name}`)];
  for (const name of icons) {
    const output = path.join(target, `icons/${name}.png`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    let svg = fs.readFileSync(path.join(source, `icons/${name}.svg`), 'utf8');
    // The website renders this monochrome logo in white on dark skill cards.
    if (name === 'skills/apachekafka') svg = svg.replace('#231f20', '#ffffff');
    await sharp(Buffer.from(svg)).resize({ width: name.startsWith('companies/') ? 256 : 128 }).png().toFile(output);
  }
  for (const filename of ['fonts/chinese-hero.woff2', 'fonts/chinese-hero-LICENSE.md', 'fonts/NotoSansSC-OFL.txt', 'icons/skills/LICENSE.devicon']) {
    fs.mkdirSync(path.dirname(path.join(target, filename)), { recursive: true });
    fs.copyFileSync(path.join(source, filename), path.join(target, filename));
  }
  const conversion = spawnSync(python, ['-c', `
import json, sys
from pathlib import Path
from PIL import Image
source, target = map(Path, sys.argv[1:])
for original, name in [('kushop-640.webp', 'mall'), ('rest-640.webp', 'restaurant')]:
    src = source / 'images' / 'projects' / original
    image = Image.open(src)
    frames, durations = [], []
    for index in range(image.n_frames):
        image.seek(index)
        image.load()
        duration = image.info['duration']
        if index % 3 == 0:
            frames.append(image.convert('RGB').resize((320, 180), Image.Resampling.LANCZOS))
            durations.append(duration)
        else:
            durations[-1] += duration
    # A shared palette avoids color flicker between animation frames.
    atlas = Image.new('RGB', (320, 180 * len(frames)))
    for index, frame in enumerate(frames):
        atlas.paste(frame, (0, 180 * index))
    palette = atlas.quantize(colors=64, method=Image.Quantize.MEDIANCUT)
    converted = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    output = target / 'projects' / (name + '-motion.gif')
    output.parent.mkdir(parents=True, exist_ok=True)
    converted[0].save(output, save_all=True, append_images=converted[1:], duration=durations, loop=0, optimize=True, disposal=1)
    result = Image.open(output)
    total_duration = 0
    for index in range(result.n_frames):
        result.seek(index)
        total_duration += result.info['duration']
    print(json.dumps({'file': str(output), 'bytes': output.stat().st_size, 'source_bytes': src.stat().st_size, 'size': result.size, 'frames': result.n_frames, 'duration_ms': total_duration, 'loop': result.info['loop']}))
`, source, target], { encoding: 'utf8' });
  if (conversion.status !== 0) throw new Error(conversion.stderr || conversion.error?.message || 'Image conversion failed');
  process.stdout.write(conversion.stdout);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

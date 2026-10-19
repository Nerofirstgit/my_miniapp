const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const readJson = (filename) => JSON.parse(fs.readFileSync(filename, 'utf8'));
const config = readJson(path.join(projectRoot, 'project.config.json'));
const sourceRoot = path.resolve(projectRoot, config.miniprogramRoot);
assert.ok(sourceRoot.startsWith(`${projectRoot}${path.sep}`));
const app = readJson(path.join(sourceRoot, 'app.json'));
assert.equal(app.pages[0], 'pages/home/index');
assert.deepEqual(config.setting.useCompilerPlugins, ['typescript']);

function checkEntry(entry, component = false) {
  for (const extension of ['.ts', '.json', '.wxml', '.wxss']) {
    assert.ok(fs.existsSync(`${entry}${extension}`), `缺少 ${entry}${extension}`);
  }
  const page = readJson(`${entry}.json`);
  if (component) assert.equal(page.component, true);
  for (const componentPath of Object.values(page.usingComponents || {})) {
    assert.ok(componentPath.startsWith('/'), '首版组件使用绝对路径');
    checkEntry(path.join(sourceRoot, componentPath.slice(1)), true);
  }
}
app.pages.forEach((page) => checkEntry(path.join(sourceRoot, page)));
readJson(path.join(sourceRoot, 'sitemap.json'));

let totalBytes = 0;
function inspect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) inspect(filename);
    else {
      totalBytes += fs.statSync(filename).size;
      if (filename.endsWith('.json')) readJson(filename);
      if (filename.endsWith('.wxml')) {
        const template = fs.readFileSync(filename, 'utf8');
        assert.ok(!/<(?:div|span|a|img)\b/.test(template), '模板应使用原生组件');
        assert.ok(!/language|switchLanguage/.test(template), '小程序只使用中文');
      }
    }
  }
}
inspect(sourceRoot);
for (const asset of ['projects/mall.jpg', 'projects/restaurant.jpg', 'wechat.png']) {
  assert.ok(fs.statSync(path.join(sourceRoot, 'assets', asset)).size > 0, `缺少素材 ${asset}`);
}
// 这是项目自己的源文件体积预算，最终上传体积仍以开发者工具为准。
assert.ok(totalBytes < 1.5 * 1024 * 1024, '首版源文件体积预算为 1.5 MiB');
process.stdout.write(`原生页面及资源检查通过，源文件约 ${Math.ceil(totalBytes / 1024)} KiB。\n`);

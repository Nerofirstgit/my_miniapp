const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '../miniprogram');

function boot(entry, apiOverrides = {}, globals = {}) {
  const calls = [];
  const definitions = [];
  const cache = new Map();
  const api = {
    nextTick: (callback) => callback(),
    getWindowInfo: () => ({ windowWidth: 400, windowHeight: 800, pixelRatio: 2 }),
  };
  for (const name of ['navigateTo', 'reLaunch', 'pageScrollTo', 'showToast', 'setNavigationBarTitle', 'setClipboardData', 'getImageInfo', 'previewImage', 'makePhoneCall']) {
    api[name] = (options) => {
      calls.push({ name, options });
      apiOverrides[name]?.(options);
    };
  }
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    }).outputText;
    const wrapper = vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {
      wx: api,
      Page: (definition) => definitions.push(definition),
      Component: (definition) => definitions.push(definition),
      ...globals,
    }, { filename });
    wrapper((request) => load(path.resolve(path.dirname(filename), `${request}.ts`)), module, module.exports);
    return module.exports;
  }
  load(path.resolve(root, entry));
  const definition = definitions[0];
  const instance = {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(update, callback) {
      for (const [path, value] of Object.entries(update)) {
        const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.');
        let target = this.data;
        for (let index = 0; index < keys.length - 1; index++) {
          target = target[keys[index]];
        }
        target[keys.at(-1)] = value;
      }
      callback?.call(this);
    },
    triggerEvent(name) { calls.push({ name: `event:${name}` }); },
  };
  Object.assign(instance, definition.methods || definition);
  // Keep each instance's state independent of the registered definition.
  const properties = Object.fromEntries(Object.entries(definition.properties || {}).map(([name, property]) => [name, property.value]));
  instance.data = JSON.parse(JSON.stringify({ ...properties, ...definition.data }));
  return { instance, calls, definition };
}

function event(id) { return { currentTarget: { dataset: { id } } }; }
function lastCall(calls, name) { return calls.filter((call) => call.name === name).at(-1); }

function loadUtility(name) {
  const filename = path.join(root, 'utils', `${name}.ts`);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports }, { filename });
  return module.exports;
}

function loadWxs(name) {
  const filename = path.join(root, 'utils', `${name}.wxs`);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module }, { filename });
  return module.exports;
}

function characterValues(instance, kind, id) {
  const run = instance.data[kind === 'intro' ? 'introParagraphs' : 'copyRuns'][id];
  const progress = instance.data[`${kind}Progress`][id];
  const { runs } = loadWxs('character-opacity');
  return expandedRunValues(runs(run, progress));
}

function textRun(text) {
  let count = 0;
  const characters = Array.from(text, (value, id) => ({
    id, text: value, opacityIndex: /\s/.test(value) ? -1 : count++,
  }));
  return { id: 'test-run', text, count, characters };
}

function expandedRunValues(segments) {
  return Array.from(segments).flatMap((segment) => Array.from(segment.text)
    .filter((character) => !/\s/.test(character)).map(() => segment.opacity));
}

test('逐字透明度按阅读顺序渐入，回滚和跨越整段都精确恢复端点', () => {
  const { createCharacterOpacityUpdater } = loadUtility('character-opacity');
  const values = Array(30).fill(0.12);
  const writes = [];
  const update = createCharacterOpacityUpdater(values.length, (index, opacity) => {
    values[index] = opacity;
    writes.push([index, opacity]);
  });
  update(0);
  assert.equal(writes.length, 0);
  update(0.4);
  const middle = values.slice();
  assert.equal(middle[0], 1);
  assert.equal(middle.at(-1), 0.12);
  assert.ok(middle.some((opacity) => opacity > 0.12 && opacity < 1));
  assert.ok(middle.every((opacity, index) => index === 0 || middle[index - 1] >= opacity));
  const count = writes.length;
  update(0.4);
  assert.equal(writes.length, count, '未改变的滚动进度不发送重复透明度');
  update(10000);
  assert.ok(values.every((opacity) => opacity === 1));
  update(0.4);
  assert.deepEqual(values, middle, '反向滚动精确恢复相同中间态');
  update(-10000);
  assert.ok(values.every((opacity) => opacity === 0.12));
});

test('空段落不写入，单字、Unicode 字符和一万字长段落保持可逆端点', () => {
  const { createCharacterOpacityUpdater } = loadUtility('character-opacity');
  const empty = createCharacterOpacityUpdater(0, () => assert.fail('空段落不应写入'));
  for (const progress of [0, 0.5, 1, 0]) empty(progress);
  for (const count of [1, Array.from('康彤😀\u{20000}').length, 10001]) {
    const values = Array(count).fill(0.12);
    const update = createCharacterOpacityUpdater(count, (index, opacity) => { values[index] = opacity; });
    update(1);
    assert.ok(values.every((opacity) => opacity === 1));
    update(0);
    assert.ok(values.every((opacity) => opacity === 0.12));
  }
});

test('视图层逐字计算与原算法在顺序、反向、长文及边界进度一致，空白始终可见', () => {
  const { opacity } = loadWxs('character-opacity');
  const { createCharacterOpacityUpdater } = loadUtility('character-opacity');
  for (const count of [0, 1, 4, 30, 10001]) {
    const expected = Array(count).fill(.12);
    const update = createCharacterOpacityUpdater(count, (index, value) => { expected[index] = value; });
    for (const progress of [-10000, 0, .001, .12, .4, .5, .999, 1, 10000, .5, .12, 0]) {
      update(progress);
      assert.equal(opacity(progress, -1, count), 1, '空格和换行不参与逐字淡入');
      const actual = Array.from({ length: count }, (_, index) => opacity(progress, index, count));
      assert.deepEqual(actual, expected, `count=${count}, progress=${progress}`);
    }
  }
});

test('合并文字节点保留Unicode、标点、空白和换行，每个可见字符的透明度与原算法一致', () => {
  const { runs, opacity } = loadWxs('character-opacity');
  const examples = ['康', '  康彤😀\u{20000}\n APP / 小程序\t。 ', '\n\t ',
    '甲乙丙丁戊己庚辛壬癸，'.repeat(8), ' a\n b\t c \r\n d '];
  for (const text of examples) {
    const run = textRun(text);
    const original = JSON.stringify(run);
    for (const progress of [-100, 0, .001, .12, .5, .999, 1, 100, .5, .12, 0]) {
      const segments = runs(run, progress);
      assert.equal(segments.map((segment) => segment.text).join(''), text);
      assert.equal(new Set(segments.map((segment) => segment.id)).size, segments.length, '同次渲染节点键唯一');
      assert.ok(segments.every((segment) => segment.text.length > 0));
      const expected = Array.from({ length: run.count }, (_, index) => opacity(progress, index, run.count));
      assert.deepEqual(expandedRunValues(segments), expected, `text=${JSON.stringify(text)}, progress=${progress}`);
      assert.equal(JSON.stringify(run), original, '合并计算不修改输入资料');
    }
  }
});

test('一万字长文只保留最多20个透明度片段，起点终点合为一个节点且双向重算稳定', () => {
  const { runs, opacity } = loadWxs('character-opacity');
  const run = textRun(('字 😀\n').repeat(5000) + '终');
  assert.equal(run.count, 10001);
  let middle;
  for (const progress of [-1, 0, .001, .12, .5, .9, .999, 1, 2, .5, 0]) {
    const segments = runs(run, progress);
    assert.ok(segments.length <= 20, `长文片段数=${segments.length}, progress=${progress}`);
    assert.equal(segments.map((segment) => segment.text).join(''), run.text);
    assert.deepEqual(expandedRunValues(segments), Array.from({ length: run.count }, (_, index) => opacity(progress, index, run.count)));
    if (progress <= 0 || progress >= 1) assert.equal(segments.length, 1);
    if (progress === .5) {
      if (middle) assert.deepEqual(JSON.parse(JSON.stringify(segments)), middle, '回滚相同进度恢复相同分段');
      else middle = JSON.parse(JSON.stringify(segments));
    }
  }
});

test('空文本不生成渲染片段', () => {
  const { runs } = loadWxs('character-opacity');
  for (const progress of [0, .5, 1]) assert.equal(runs(textRun(''), progress).length, 0);
});

test('一万字长文每次滚动只跨桥传递该段进度，数据量不随字数增加', () => {
  for (const kind of ['intro', 'copy']) {
    const { instance } = boot('pages/home/index.ts');
    const runtime = installHomeRuntime(instance);
    const id = kind === 'intro' ? 0 : instance.data.copy.projects[0].description;
    const run = instance.data[kind === 'intro' ? 'introParagraphs' : 'copyRuns'][id];
    run.text = '字'.repeat(10001);
    run.count = 10001;
    run.characters = Array.from(run.text, (text, index) => ({ id: index, text, opacityIndex: index }));
    instance.onReady();
    runtime.queries[0].complete([[], { scrollTop: 0 }, [
      { dataset: { key: `${kind}-${id}` }, top: 800, height: 200 },
    ]]);
    const original = instance.setData;
    const updates = [];
    instance.setData = function (update, callback) { updates.push(update); original.call(this, update, callback); };
    instance.onPageScroll({ scrollTop: 320 });
    assert.equal(updates.length, 1);
    assert.deepEqual(Object.keys(updates[0]), [`${kind}Progress[${id}]`]);
    assert.equal(updates[0][`${kind}Progress[${id}]`], .5);
    assert.ok(Buffer.byteLength(JSON.stringify(updates[0])) < 64);
    const middle = characterValues(instance, kind, id);
    assert.equal(middle[0], 1);
    assert.equal(middle.at(-1), .12);
    instance.onPageScroll({ scrollTop: 320 });
    assert.equal(updates.length, 1, '相同进度不重复传递');
    instance.onPageScroll({ scrollTop: 0 });
    assert.deepEqual(Object.keys(updates[1]), [`${kind}Progress[${id}]`]);
    assert.ok(characterValues(instance, kind, id).every((value) => value === .12));
  }
});

test('关于我保留空白但不计入逐字延迟，字符顺序及原文不变', () => {
  const { instance } = boot('pages/home/index.ts');
  let whitespace = 0;
  instance.data.introParagraphs.forEach((paragraph, paragraphIndex) => {
    assert.equal(paragraph.characters.map((character) => character.text).join(''), instance.data.paragraphs[paragraphIndex]);
    let nextIndex = 0;
    for (const character of paragraph.characters) {
      if (/\s/.test(character.text)) {
        assert.equal(character.opacityIndex, -1);
        whitespace++;
      } else {
        assert.equal(character.opacityIndex, nextIndex++);
      }
    }
    assert.equal(paragraph.count, nextIndex);
    assert.equal(instance.data.introProgress[paragraphIndex], 0);
    assert.deepEqual(characterValues(instance, 'intro', paragraphIndex), Array(nextIndex).fill(0.12));
  });
  assert.ok(whitespace > 0, '样本应覆盖原文数字周围的空格');
});

test('关于我随滚动逐字亮起和回退，不叠加段落透明度或重复跨桥更新', () => {
  const { instance } = boot('pages/home/index.ts');
  const runtime = installHomeRuntime(instance);
  instance.onReady();
  runtime.queries[0].complete([[], { scrollTop: 0 }, [
    { dataset: { key: 'intro-0' }, top: 800, height: 200 },
    { dataset: { key: 'intro-1' }, top: 1200, height: 200 },
  ]]);
  const initial = characterValues(instance, 'intro', 0);
  assert.ok(initial.every((opacity) => opacity === 0.12));
  instance.onPageScroll({ scrollTop: 320 });
  const middle = characterValues(instance, 'intro', 0);
  assert.ok(middle[0] > middle.at(-1), '行首应先于行尾亮起');
  assert.ok(characterValues(instance, 'intro', 1).every((opacity) => opacity === 0.12), '下一段未进入阈值时保持暗色');
  assert.equal(Object.hasOwn(instance.data.revealStyles, 'intro-0'), false, '避免段落与字符双重透明度');
  const setData = instance.setData;
  const bridgeUpdates = [];
  instance.setData = function (update, callback) { bridgeUpdates.push(update); setData.call(this, update, callback); };
  instance.onPageScroll({ scrollTop: 320 });
  assert.equal(bridgeUpdates.length, 0);
  instance.onPageScroll({ scrollTop: 10000 });
  assert.ok([0, 1].every((id) => characterValues(instance, 'intro', id).every((opacity) => opacity === 1)));
  instance.onPageScroll({ scrollTop: 320 });
  assert.deepEqual(characterValues(instance, 'intro', 0), middle);
  instance.onPageScroll({ scrollTop: 0 });
  assert.deepEqual(characterValues(instance, 'intro', 0), initial);
});

test('各分区逐字副本保留资料原文、标点及空白，并覆盖所有技能', () => {
  const { instance: { data } } = boot('pages/home/index.ts');
  const text = (id) => data.copyRuns[id].text;
  for (const group of ['projects', 'experiences', 'skills']) {
    assert.equal(data.copy[group].length, data[group].length);
    data.copy[group].forEach((fields, index) => {
      for (const [field, id] of Object.entries(fields)) {
        if (field === 'tags') assert.deepEqual(id.map(text), data[group][index].tags);
        else assert.equal(text(id), data[group][index][field]);
      }
    });
  }
  assert.equal(text(data.copy.static.contactInvitation), '有个想法？\n一起把它实现。');
  for (const [key, field] of [['phoneValue', 'phoneDisplay'], ['wechatValue', 'wechat'], ['emailValue', 'email']]) {
    assert.equal(text(data.copy.static[key]), data.contact[field]);
  }
  assert.equal(data.copy.static.studio, undefined, '常显的工作室名称不参与逐字渐隐');
  for (const run of data.copyRuns) {
    assert.equal(run.characters.map((character) => character.text).join(''), run.text);
    let count = 0;
    for (const character of run.characters) assert.equal(character.opacityIndex, /\s/.test(character.text) ? -1 : count++);
    assert.equal(run.count, count);
    assert.equal(data.copyProgress[run.id], 0);
    assert.deepEqual(characterValues({ data }, 'copy', run.id), Array(count).fill(0.12));
  }
});

test('作品经历技能联系按字双向变化，不叠加文本块透明度或重复更新', () => {
  const { instance } = boot('pages/home/index.ts');
  const runtime = installHomeRuntime(instance);
  const ids = [instance.data.copy.projects[0].description, instance.data.copy.experiences[0].description,
    instance.data.copy.skills[0].name, instance.data.copy.static.contactDescription];
  instance.onReady();
  runtime.queries[0].complete([[], { scrollTop: 0 }, ids.map((id) => ({ dataset: { key: `copy-${id}` }, top: 800, height: 200 }))]);
  instance.onPageScroll({ scrollTop: 320 });
  const middle = ids.map((id) => characterValues(instance, 'copy', id));
  middle.forEach((values) => assert.ok(values[0] > values.at(-1)));
  ids.forEach((id) => assert.equal(Object.hasOwn(instance.data.revealStyles, `copy-${id}`), false));
  const original = instance.setData;
  let writes = 0;
  instance.setData = function (...args) { writes++; original.apply(this, args); };
  instance.onPageScroll({ scrollTop: 320 });
  assert.equal(writes, 0);
  instance.onPageScroll({ scrollTop: 10000 });
  ids.forEach((id) => assert.ok(characterValues(instance, 'copy', id).every((opacity) => opacity === 1)));
  instance.onPageScroll({ scrollTop: 320 });
  assert.deepEqual(ids.map((id) => characterValues(instance, 'copy', id)), middle);
  instance.onPageScroll({ scrollTop: 0 });
  ids.forEach((id) => assert.ok(characterValues(instance, 'copy', id).every((opacity) => opacity === .12)));
});

test('逐字联系文本在页底完全显示，技能展开重测后回退，忽略旧测量及卸载回调', () => {
  const { instance } = boot('pages/home/index.ts');
  const runtime = installHomeRuntime(instance);
  const id = instance.data.copy.static.emailValue;
  const layout = (top, height) => [[], { scrollTop: 0 }, [{ dataset: { key: `copy-${id}` }, top, height: 60 }], { height }];
  instance.onReady();
  runtime.queries[0].complete(layout(1500, 1600));
  instance.onPageScroll({ scrollTop: 800 });
  assert.ok(characterValues(instance, 'copy', id).every((opacity) => opacity === 1));
  instance.toggleSkills();
  runtime.queries[1].complete(layout(2200, 2400));
  assert.ok(characterValues(instance, 'copy', id).every((opacity) => opacity === .12));
  runtime.queries[0].complete(layout(1500, 1600));
  assert.ok(characterValues(instance, 'copy', id).every((opacity) => opacity === .12));
  instance.onPageScroll({ scrollTop: 1600 });
  assert.ok(characterValues(instance, 'copy', id).every((opacity) => opacity === 1));
  instance.measureSections();
  instance.onUnload();
  instance.setData = () => assert.fail('卸载后不得更新逐字文字');
  runtime.queries[2].complete(layout(1500, 1600));
  instance.syncReveals();
});

test('页底复制邮箱保留渐变区间，亚像素停靠及回弹后仍完整显示', () => {
  const { instance } = boot('pages/home/index.ts');
  const runtime = installHomeRuntime(instance);
  const id = instance.data.copy.static.emailAction;
  instance.onReady();
  runtime.queries[0].complete([[], { scrollTop: 0 }, [
    { dataset: { key: `copy-${id}` }, top: 1500, height: 15 },
  ], { height: 1600.6 }]);
  instance.onPageScroll({ scrollTop: 740 });
  const middle = instance.data.copyProgress[id];
  assert.ok(middle > 0 && middle < 1, '到达页底前已经渐入，不在单个像素处跳变');
  for (const scrollTop of [800, 810, 800]) {
    instance.onPageScroll({ scrollTop });
    assert.ok(characterValues(instance, 'copy', id).every((opacity) => opacity === 1));
  }
  instance.onPageScroll({ scrollTop: 740 });
  assert.equal(instance.data.copyProgress[id], middle);
  instance.onPageScroll({ scrollTop: 600 });
  assert.ok(characterValues(instance, 'copy', id).every((opacity) => opacity === .12));
});

test('首页重新载入清空逐字缓存并与初始透明度同步', () => {
  const { instance } = boot('pages/home/index.ts');
  const runtime = installHomeRuntime(instance);
  const id = instance.data.copy.projects[0].description;
  instance.onReady();
  runtime.queries[0].complete([[], { scrollTop: 0 }, [
    { dataset: { key: `copy-${id}` }, top: 800, height: 200 },
    { dataset: { key: 'intro-0' }, top: 800, height: 200 },
  ]]);
  instance.onPageScroll({ scrollTop: 1000 });
  assert.ok(characterValues(instance, 'copy', id).every((opacity) => opacity === 1));
  instance.onUnload();
  instance.updateInsets = () => {};
  instance.onLoad();
  assert.equal(instance._disposed, false);
  assert.ok(instance.data.copyProgress.every((progress) => progress === 0));
  assert.ok(instance.data.introProgress.every((progress) => progress === 0));
  instance.onPageScroll({ scrollTop: 0 });
  assert.ok(characterValues(instance, 'copy', id).every((opacity) => opacity === .12));
  assert.ok(characterValues(instance, 'intro', 0).every((opacity) => opacity === .12));
  instance.onPageScroll({ scrollTop: 1000 });
  assert.ok(characterValues(instance, 'copy', id).every((opacity) => opacity === 1));
});

test('分区标题独立传递可逆进度，不叠加父层透明度', () => {
  const { instance } = boot('pages/home/index.ts');
  const runtime = installHomeRuntime(instance);
  instance.onReady();
  runtime.queries[0].complete([[], { scrollTop: 0 }, [{ dataset: { key: 'works' }, top: 800, height: 200 }]]);
  instance.onPageScroll({ scrollTop: 320 });
  assert.equal(instance.data.titleProgress.works, .5);
  assert.equal(Object.hasOwn(instance.data.revealStyles, 'works'), false);
  instance.onPageScroll({ scrollTop: 0 });
  assert.equal(instance.data.titleProgress.works, 0);
});

test('标题扫过沿平滑曲线从左至右，并限制扭曲速度', () => {
  const { createTitleSweep } = loadUtility('title-sweep');
  const sweep = createTitleSweep();
  const bounds = { left: 20, top: 30, width: 300, height: 100 };
  const canvas = { left: 0, top: 0, width: 400, height: 200 };
  sweep.start(1000);
  const start = sweep.update(1000, bounds, canvas, 400, 800);
  assert.equal(start.x, 0.05);
  assert.equal(start.y, 0.6);
  assert.equal(Math.hypot(start.velocityX, start.velocityY), 0);
  const quarter = sweep.update(1750, bounds, canvas, 400, 800);
  assert.equal(quarter.x, (20 + 300 * 0.15625) / 400);
  assert.ok(quarter.y < start.y, '首轮曲线上半程向上弯曲');
  const middle = sweep.update(2500, bounds, canvas, 400, 800);
  assert.equal(middle.x, 0.425);
  assert.ok(Math.abs(middle.y - 0.6) < 1e-12);
  const late = sweep.update(3250, bounds, canvas, 400, 800);
  assert.ok(late.x > middle.x && late.y > start.y);
  const extreme = sweep.update(2500, { ...bounds, width: 10000, height: 10000 }, canvas, 1, 1);
  assert.ok(Math.abs(Math.hypot(extreme.velocityX, extreme.velocityY) - 0.018) < 1e-12);
});

test('标题三秒扫过后静止五秒，延迟恢复保持原周期且每轮曲线有变化', () => {
  const { createTitleSweep } = loadUtility('title-sweep');
  const sweep = createTitleSweep();
  const bounds = { left: 0, top: 0, width: 300, height: 100 };
  sweep.start(0);
  assert.equal(sweep.nextDelay(2999), 0);
  assert.equal(sweep.update(3000, bounds, bounds, 400, 800), null);
  assert.equal(sweep.nextDelay(3000), 5000);
  assert.ok(Math.abs(sweep.nextDelay(7999) - 1) < 1e-9);
  assert.equal(sweep.nextDelay(8000), 0);
  assert.equal(sweep.update(8000, bounds, bounds, 400, 800).x, 0);
  const first = sweep.update(750, bounds, bounds, 400, 800);
  const second = sweep.update(8750, bounds, bounds, 400, 800);
  assert.equal(second.x, first.x);
  assert.notEqual(second.y, first.y);
  const lateResume = sweep.update(24750, bounds, bounds, 400, 800);
  assert.equal(lateResume.x, first.x, '恢复后按原起始时刻定位周期，不重新开始');
  sweep.reset(2);
  assert.equal(sweep.update(30000, bounds, bounds, 400, 800), null);
  assert.equal(sweep.nextDelay(31000), 1000);
  assert.equal(sweep.update(32000, bounds, bounds, 400, 800).x, 0);
  assert.equal(sweep.update(32500, bounds, { ...bounds, width: 0 }, 400, 800), null);
  assert.equal(sweep.update(32500, bounds, { ...bounds, height: 0 }, 400, 800), null);
});

function installHomeRuntime(instance) {
  const state = { queries: [], disconnected: false, observerCallback: null, observers: [] };
  instance.createSelectorQuery = () => {
    const request = { operations: [], complete: null };
    state.queries.push(request);
    const query = {
      select(selector) { request.operations.push(['select', selector]); return query; },
      selectAll(selector) { request.operations.push(['selectAll', selector]); return query; },
      boundingClientRect() { request.operations.push(['boundingClientRect']); return query; },
      fields(options) { request.operations.push(['fields', { ...options }]); return query; },
      selectViewport() { request.operations.push(['selectViewport']); return query; },
      scrollOffset() { request.operations.push(['scrollOffset']); return query; },
      exec(callback) { request.complete = callback; },
    };
    return query;
  };
  instance.createIntersectionObserver = (options) => {
    const record = { options, disconnected: false };
    state.observers.push(record);
    const observer = {
      relativeToViewport() { return observer; },
      observe(selector, callback) { state.observerCallback = callback; },
      disconnect() { state.disconnected = true; record.disconnected = true; },
    };
    return observer;
  };
  return state;
}

function bootTitle(globals = {}) {
  const result = boot('components/distorted-title/index.ts', {}, globals);
  result.runtime = installHomeRuntime(result.instance);
  result.instance.setData({ active: true, source: '/assets/titles/hero.png' });
  return result;
}

function titleGpu(attributes = { alpha: true, premultipliedAlpha: true }) {
  const gpu = atmosphereGpu();
  const gl = gpu.canvas.getContext('webgl');
  const contextRequests = [];
  const images = [];
  gl.getContextAttributes = () => attributes;
  gl.FRAMEBUFFER_COMPLETE = 0x8cd5;
  gl.createFramebuffer = () => {
    const framebuffer = { kind: 'framebuffer' };
    gpu.live.add(framebuffer);
    return framebuffer;
  };
  gl.deleteFramebuffer = (framebuffer) => gpu.live.delete(framebuffer);
  gl.checkFramebufferStatus = () => gl.FRAMEBUFFER_COMPLETE;
  for (const name of ['pixelStorei', 'bindFramebuffer', 'framebufferTexture2D', 'uniform2f', 'uniform4f']) gl[name] = () => {};
  gpu.canvas.getContext = (type, options) => {
    contextRequests.push({ type, options: options && { ...options } });
    return gl;
  };
  gpu.canvas.createImage = () => {
    const image = {};
    images.push(image);
    return image;
  };
  return { ...gpu, contextRequests, images };
}

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

test('星场保持原站3000颗三维分布，随机相位和运动倍率有界且种子可重现', () => {
  const { createAtmosphereModel } = loadUtility('atmosphere-model');
  const stars = createAtmosphereModel(seededRandom(13));
  assert.equal(stars.positions.length, 9000);
  assert.equal(stars.timings.length, 3000);
  assert.equal(stars.movements.length, 6000);
  assert.deepEqual(Array.from(stars.positions), Array.from(createAtmosphereModel(seededRandom(13)).positions));
  assert.notDeepEqual(Array.from(stars.timings), Array.from(createAtmosphereModel(seededRandom(14)).timings));
  assert.ok(stars.positions.every(Number.isFinite));
  assert.ok(stars.timings.every((phase) => phase >= 0 && phase <= 2 * Math.PI + 1e-6));
  assert.ok(stars.movements.every((factor) => factor >= .2 - 1e-6 && factor <= 2));
  const depths = [];
  for (let i = 0; i < stars.positions.length; i += 3) {
    assert.ok(Math.abs(stars.positions[i]) <= 14.4);
    assert.ok(Math.abs(stars.positions[i + 1]) <= 11.51);
    assert.ok(Math.abs(stars.positions[i + 2]) <= 64.4);
    depths.push(stars.positions[i + 2]);
  }
  assert.ok(Math.min(...depths) < -40 && Math.max(...depths) > 40, '纵深覆盖远近区域，不退化成平面');
  for (const count of [0, 1, 10001]) {
    const sample = createAtmosphereModel(seededRandom(8), count);
    assert.equal(sample.positions.length, count * 3);
    assert.ok(sample.positions.every(Number.isFinite));
  }
  const core = createAtmosphereModel(() => 0, 1);
  assert.deepEqual(Array.from(core.positions), [0, 0, -50], '1%中心分布分支覆盖');
});

test('星空透视相机保持45度视角、15单位相机距离及横竖屏纵横比', () => {
  const { atmosphereProjection, atmosphereView } = loadUtility('atmosphere-model');
  for (const [width, height] of [[390, 844], [844, 390], [1, 1]]) {
    const p = atmosphereProjection(width, height);
    assert.equal(p.length, 16);
    assert.ok(p.every(Number.isFinite));
    assert.ok(Math.abs(p[5] - 1 / Math.tan(Math.PI / 8)) < 1e-6);
    assert.ok(Math.abs(p[0] / p[5] - height / width) < 1e-6);
    assert.equal(p[11], -1);
    assert.equal(p[15], 0);
    const depth = (z) => (p[10] * z + p[14]) / -z;
    assert.ok(Math.abs(depth(-.1) + 1) < 1e-6, '近裁剪面投影到-1');
    assert.ok(Math.abs(depth(-1000) - 1) < 1e-6, '远裁剪面投影到1');
  }
  assert.equal(atmosphereView[14], -15);
  assert.equal(atmosphereView[15], 1);
});

test('星云和星点按原站移动端独立速度演化，纹理中心明亮边缘透明', () => {
  const { atmosphereUniforms, atmosphereColor, createStarTexture } = loadUtility('atmosphere-model');
  for (const seconds of [0, 1, 60, 10000]) {
    const values = atmosphereUniforms(seconds);
    assert.equal(values.time, seconds);
    assert.equal(values.fogTime, seconds * .65);
    assert.equal(values.scrollOffset, seconds * .03);
  }
  assert.ok(Math.abs(atmosphereColor[0] - .4286904966) < 1e-8);
  assert.ok(atmosphereColor[0] > atmosphereColor[1]);
  assert.equal(atmosphereColor[1], atmosphereColor[2]);
  const pixels = createStarTexture();
  assert.equal(pixels.length, 32 * 32 * 4);
  const alpha = (x, y) => pixels[(y * 32 + x) * 4 + 3];
  assert.equal(alpha(15, 15), 255);
  assert.equal(alpha(0, 0), 0);
  assert.ok(alpha(20, 15) > alpha(24, 15));
  assert.ok(alpha(24, 15) > alpha(30, 15));
  assert.equal(alpha(0, 15), alpha(31, 15));
  assert.equal(alpha(15, 0), alpha(15, 31));
});

function bootAtmosphere(globals = {}) {
  const result = boot('components/star-atmosphere/index.ts', {}, globals);
  result.runtime = installHomeRuntime(result.instance);
  result.instance.setData({ active: true });
  return result;
}

test('星空组件仅触发ready也可初始化，减少动态效果不分配WebGL', () => {
  const { instance, definition, runtime } = bootAtmosphere();
  let contexts = 0;
  const canvas = { getContext() { contexts++; return null; } };
  assert.doesNotThrow(() => definition.lifetimes.ready.call(instance));
  assert.equal(runtime.queries.length, 1);
  runtime.queries[0].complete([{ width: 390, height: 844, node: canvas, display: 'none' }]);
  assert.equal(contexts, 0);
  assert.equal(instance.data.rendered, false);
  definition.lifetimes.detached.call(instance);
});

test('星空不活跃时不分配WebGL，卸载后迟到查询不写入视图或重启动画', () => {
  const inactive = bootAtmosphere();
  inactive.instance.setData({ active: false });
  inactive.definition.lifetimes.ready.call(inactive.instance);
  assert.equal(inactive.runtime.queries.length, 0);
  inactive.definition.lifetimes.detached.call(inactive.instance);

  const { instance, definition, runtime } = bootAtmosphere();
  definition.lifetimes.ready.call(instance);
  definition.lifetimes.detached.call(instance);
  let contexts = 0;
  let writes = 0;
  instance.setData = () => { writes++; };
  runtime.queries[0].complete([{ width: 390, height: 844, node: { getContext() { contexts++; } }, display: 'block' }]);
  definition.pageLifetimes.show.call(instance);
  definition.observers.active.call(instance);
  assert.equal(contexts, 0);
  assert.equal(writes, 0);
  assert.equal(runtime.queries.length, 1);
});

function atmosphereGpu(options = {}) {
  const live = new Set();
  const frames = new Map();
  const draws = [];
  const uniforms = new Map();
  let handle = 0;
  let program;
  const allocate = (kind) => { const resource = { kind, id: ++handle }; live.add(resource); return resource; };
  const gl = {
    NO_ERROR: 0, POINTS: 0, TRIANGLE_STRIP: 5,
    createProgram: () => allocate('program'),
    createShader: () => allocate('shader'),
    createBuffer: () => allocate('buffer'),
    createTexture: () => allocate('texture'),
    deleteProgram: (resource) => live.delete(resource),
    deleteShader: (resource) => live.delete(resource),
    deleteBuffer: (resource) => live.delete(resource),
    deleteTexture: (resource) => live.delete(resource),
    getShaderParameter: () => options.compile !== false,
    getShaderInfoLog: () => 'simulated compile failure',
    getProgramParameter: () => options.link !== false,
    getProgramInfoLog: () => 'simulated link failure',
    getAttribLocation: (_program, name) => ['aPosition', 'position', 'randomTiming', 'randomMovement'].indexOf(name),
    getUniformLocation: (target, name) => `${target.id}:${name}`,
    useProgram: (target) => { program = target; },
    uniform1f: (location, value) => uniforms.set(location, value),
    drawArrays: (mode, first, count) => draws.push({ mode, first, count, program }),
    isContextLost: () => !!options.contextLost,
    getError: () => options.error || 0,
  };
  for (const name of ['shaderSource', 'compileShader', 'attachShader', 'linkProgram', 'bindBuffer', 'bufferData', 'enableVertexAttribArray', 'vertexAttribPointer', 'viewport', 'disable', 'depthMask', 'uniform3f', 'uniform1i', 'uniformMatrix4fv', 'activeTexture', 'bindTexture', 'texParameteri', 'texImage2D', 'enable', 'blendEquation', 'blendFuncSeparate']) gl[name] = () => {};
  const canvas = {
    getContext: () => options.noContext ? null : gl,
    requestAnimationFrame(callback) { const id = ++handle; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  return {
    canvas, live, frames, draws, uniforms,
    result: { width: 390, height: 844, node: canvas, display: 'block' },
    frame() {
      assert.equal(frames.size, 1, '每个实例至多一个待执行帧');
      const [id, callback] = frames.entries().next().value;
      frames.delete(id);
      callback();
    },
  };
}

test('星空成功绘制星云和3000星点，30fps限频且暂停恢复不重复分配或补跑后台时间', () => {
  let now = 1000;
  const { instance, definition, runtime } = bootAtmosphere({ Date: { now: () => now } });
  const gpu = atmosphereGpu();
  let bridgeWrites = 0;
  const setData = instance.setData;
  instance.setData = function (update, callback) { bridgeWrites++; setData.call(this, update, callback); };
  definition.lifetimes.ready.call(instance);
  runtime.queries[0].complete([gpu.result]);
  assert.equal(instance.data.rendered, true);
  assert.equal(gpu.canvas.width, 390, '移动端DPR保持1，不随设备DPR放大背景缓冲');
  assert.equal(gpu.canvas.height, 844);
  assert.equal(gpu.draws.length, 2);
  assert.equal(gpu.draws[0].count, 4);
  assert.equal(gpu.draws[1].count, 3000);
  assert.equal(gpu.live.size, 7, '编译后释放shader，只保留2个program、4个buffer和1个texture');
  for (const value of [1016, 1034, 1050, 1067]) { now = value; gpu.frame(); }
  assert.equal(gpu.draws.length, 6, '67毫秒只绘制首帧和两次更新');
  assert.equal(bridgeWrites, 1, '逐帧渲染不通过setData传递');

  instance.data.active = false;
  definition.observers.active.call(instance);
  assert.equal(gpu.frames.size, 0);
  now = 10000;
  instance.data.active = true;
  definition.observers.active.call(instance);
  definition.observers.active.call(instance);
  assert.equal(gpu.frames.size, 1);
  assert.equal(runtime.queries.length, 1, '菜单关闭后复用GPU资源');
  now += 34;
  gpu.frame();
  const starTime = gpu.uniforms.get(`${gpu.draws[1].program.id}:uTime`);
  assert.ok(Math.abs(starTime - .101) < 1e-9, '恢复不计入后台等待的时间');

  definition.pageLifetimes.hide.call(instance);
  assert.equal(gpu.frames.size, 0);
  definition.pageLifetimes.show.call(instance);
  assert.equal(runtime.queries.length, 2);
  assert.equal(gpu.frames.size, 0, '等待减少动态效果检查后再恢复');
  runtime.queries[1].complete([{ display: 'block' }]);
  assert.equal(gpu.frames.size, 1);
  definition.lifetimes.detached.call(instance);
  assert.equal(gpu.frames.size, 0);
  assert.equal(gpu.live.size, 0, '卸载释放全部GPU资源');
});

test('星空编译、链接、上下文或绘制失败均保留静态背景并释放已分配资源', () => {
  for (const options of [{ compile: false }, { link: false }, { noContext: true }, { contextLost: true }, { error: 1280 }]) {
    const warnings = [];
    const { instance, definition, runtime } = bootAtmosphere({ console: { warn: (...args) => warnings.push(args) } });
    const gpu = atmosphereGpu(options);
    definition.lifetimes.ready.call(instance);
    assert.doesNotThrow(() => runtime.queries[0].complete([gpu.result]));
    assert.equal(instance.data.rendered, false);
    assert.equal(gpu.live.size, 0);
    assert.equal(gpu.frames.size, 0);
    assert.equal(warnings.length, 1, '失败应留下可诊断记录');
    definition.observers.active.call(instance);
    assert.equal(runtime.queries.length, 1, '失败后不反复分配GPU');
    definition.lifetimes.detached.call(instance);
  }
});

test('星空返回页面遇到减少动态效果时释放画布，迟到可见性查询不能唤醒后台渲染', () => {
  const { instance, definition, runtime } = bootAtmosphere();
  const gpu = atmosphereGpu();
  definition.lifetimes.ready.call(instance);
  runtime.queries[0].complete([gpu.result]);
  definition.pageLifetimes.hide.call(instance);
  definition.pageLifetimes.show.call(instance);
  definition.pageLifetimes.hide.call(instance);
  runtime.queries[1].complete([{ display: 'block' }]);
  assert.equal(gpu.frames.size, 0);
  definition.pageLifetimes.show.call(instance);
  runtime.queries[2].complete([{ display: 'none' }]);
  assert.equal(instance.data.rendered, false);
  assert.equal(gpu.frames.size, 0);
  assert.equal(gpu.live.size, 0);
  definition.lifetimes.detached.call(instance);
});

test('星空旋转屏幕重建尺寸并释放旧资源，忽略旧尺寸的迟到初始化', () => {
  const { instance, definition, runtime } = bootAtmosphere();
  const first = atmosphereGpu();
  definition.lifetimes.ready.call(instance);
  definition.pageLifetimes.resize.call(instance);
  assert.equal(runtime.queries.length, 2);
  runtime.queries[0].complete([first.result]);
  assert.equal(first.live.size, 0, '旋转前的迟到查询不能初始化旧画布');
  assert.equal(first.draws.length, 0);
  const second = atmosphereGpu();
  runtime.queries[1].complete([{ ...second.result, width: 844, height: 390 }]);
  assert.equal(second.canvas.width, 844);
  assert.equal(second.canvas.height, 390);
  assert.equal(instance.data.rendered, true);
  definition.pageLifetimes.resize.call(instance);
  assert.equal(second.live.size, 0);
  assert.equal(second.frames.size, 0);
  assert.equal(instance.data.rendered, false);
  const third = atmosphereGpu();
  runtime.queries[2].complete([third.result]);
  assert.equal(third.canvas.width, 390);
  assert.equal(third.canvas.height, 844);
  assert.equal(third.frames.size, 1);
  definition.lifetimes.detached.call(instance);
  assert.equal(third.live.size, 0);
});

test('标题组件热重载只触发 ready 时仍可初始化，缺少 attached 不抛错', () => {
  const { instance, definition, runtime } = bootTitle();
  assert.doesNotThrow(() => definition.lifetimes.ready.call(instance));
  assert.equal(runtime.queries.length, 1, 'ready 应建立自己的运行状态并查询画布');
  runtime.queries[0].complete([{ left: 0, top: 0, width: 300, height: 100 }, { display: 'none' }]);
  assert.equal(instance.data.rendered, false);
  definition.lifetimes.detached.call(instance);
});

test('Hero 和分区标题显式请求透明预乘画布，透明上下文可正常显示标题', () => {
  for (const hero of [false, true]) {
    const { instance, definition, runtime } = bootTitle();
    instance.setData({ hero });
    const gpu = titleGpu();
    definition.lifetimes.ready.call(instance);
    runtime.queries[0].complete([{ left: 0, top: 0, width: 300, height: 100 }, gpu.result]);
    assert.equal(gpu.contextRequests.length, 1);
    assert.equal(gpu.contextRequests[0].type, 'webgl');
    assert.equal(gpu.contextRequests[0].options?.alpha, true);
    assert.equal(gpu.contextRequests[0].options?.premultipliedAlpha, true);
    assert.equal(gpu.images.length, 1, '透明上下文继续加载标题图像');
    if (!hero) {
      gpu.images[0].onload();
      assert.equal(instance.data.rendered, true);
      assert.equal(gpu.draws.length, 2, '源纹理和最终画布均完成绘制');
      assert.equal(gpu.frames.size, 1);
    }
    definition.lifetimes.detached.call(instance);
    assert.equal(gpu.live.size, 0);
    assert.equal(gpu.frames.size, 0);
  }
});

test('标题上下文不支持透明或已丢失时保留文字，不分配绘图资源或重试', () => {
  for (const attributes of [{ alpha: false, premultipliedAlpha: true }, null]) {
    const { instance, definition, runtime } = bootTitle();
    const gpu = titleGpu(attributes);
    definition.lifetimes.ready.call(instance);
    runtime.queries[0].complete([{ left: 0, top: 0, width: 300, height: 100 }, gpu.result]);
    assert.equal(instance.data.rendered, false);
    assert.equal(gpu.images.length, 0, '透明能力不足时不加载标题图像');
    assert.equal(gpu.live.size, 0, '回退不保留 GPU 资源');
    assert.equal(gpu.draws.length, 0);
    assert.equal(gpu.frames.size, 0);
    definition.observers.active.call(instance);
    definition.pageLifetimes.show.call(instance);
    assert.equal(runtime.queries.length, 1, '失败后保持文字回退');
    definition.lifetimes.detached.call(instance);
  }
});

test('分区标题原生回退逐字错峰，反向和跨越进度恢复端点，失败仍可读', () => {
  const { instance, definition, runtime } = bootTitle();
  instance.setData({ label: '作品介绍', progress: .5 });
  definition.lifetimes.ready.call(instance);
  const middle = instance.data.fallbackCharacters.map((item) => item.opacity);
  assert.equal(instance.data.fallbackCharacters.map((item) => item.text).join(''), '作品介绍.');
  assert.equal(instance.data.fallbackCharacters.at(-1).accent, true);
  assert.ok(middle.every((value, index) => value > .12 && value < 1 && (index === 0 || value < middle[index - 1])));
  runtime.queries[0].complete([{ left: 0, top: 0, width: 168, height: 46 }, { node: titleGpu({ alpha: false }).canvas, display: 'block' }]);
  assert.equal(instance.data.rendered, false);
  for (const progress of [1, .5, 0, 2, -.5, NaN]) {
    instance.data.progress = progress;
    definition.observers['progress, label'].call(instance);
    const values = instance.data.fallbackCharacters.map((item) => item.opacity);
    if (progress === .5) assert.deepEqual(values, middle);
    else assert.ok(values.every((value) => value === (progress <= 0 ? .12 : 1)));
  }
  definition.lifetimes.detached.call(instance);
});

test('分区标题在扫过休眠时立即响应进度，不重置计时器，暂停隐藏时不绘图', () => {
  let now = 1000;
  let timerId = 0;
  const timers = new Map();
  const { instance, definition, runtime } = bootTitle({
    Date: { now: () => now },
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
  });
  instance.setData({ label: '作品介绍', progress: 0 });
  const gpu = titleGpu();
  const uniform = (name) => [...gpu.uniforms].find(([key]) => key.endsWith(':' + name))?.[1];
  definition.lifetimes.ready.call(instance);
  runtime.queries[0].complete([{ left: 0, top: 0, width: 168, height: 46 }, gpu.result]);
  gpu.images[0].onload();
  assert.equal(uniform('uRevealGlyphCount'), 5);
  assert.equal(uniform('uRevealProgress'), 0);
  now = 4100;
  gpu.frame();
  assert.equal(gpu.frames.size, 0);
  assert.equal(timers.size, 1);
  const restingTimer = [...timers.entries()][0];
  const draws = gpu.draws.length;
  for (const progress of [.6, .2, 1, 0]) {
    instance.data.progress = progress;
    definition.observers['progress, label'].call(instance);
    assert.equal(uniform('uRevealProgress'), progress);
    assert.deepEqual([...timers.entries()][0], restingTimer, '滚动重绘不修改已有扫过休眠计时器');
    assert.equal(gpu.frames.size, 0);
  }
  assert.equal(gpu.draws.length, draws + 4);
  instance.data.active = false;
  definition.observers.active.call(instance);
  const pausedDraws = gpu.draws.length;
  instance.data.progress = .7;
  definition.observers['progress, label'].call(instance);
  assert.equal(gpu.draws.length, pausedDraws);
  assert.equal(timers.size, 0);
  instance.data.active = true;
  definition.observers.active.call(instance);
  assert.equal(uniform('uRevealProgress'), .7);
  definition.pageLifetimes.hide.call(instance);
  const hiddenDraws = gpu.draws.length;
  instance.data.progress = .3;
  definition.observers['progress, label'].call(instance);
  assert.equal(gpu.draws.length, hiddenDraws);
  definition.lifetimes.detached.call(instance);
  assert.equal(gpu.live.size, 0);
  assert.equal(gpu.frames.size, 0);
  assert.equal(timers.size, 0);
});

test('Hero 关闭逐字滚动遮罩，即便传入零进度仍完整显示', () => {
  let now = 1000;
  const { instance, definition, runtime } = bootTitle({ Date: { now: () => now } });
  instance.setData({ hero: true, label: '你好，我叫康彤', progress: 0 });
  const gpu = titleGpu();
  definition.lifetimes.ready.call(instance);
  runtime.queries[0].complete([{ left: 0, top: 0, width: 300, height: 100 }, gpu.result]);
  now = 3000;
  gpu.images[0].onload();
  assert.equal(instance.data.rendered, true);
  assert.equal([...gpu.uniforms].find(([key]) => key.endsWith(':uRevealGlyphCount'))[1], 0);
  assert.equal(instance.data.fallbackCharacters.length, 0);
  definition.lifetimes.detached.call(instance);
});

test('Hero纹理提前就绪时保留静态层，1700ms后成功绘制首帧才交接', () => {
  let now = 1000;
  let timerId = 0;
  const timers = new Map();
  const { instance, definition, runtime } = bootTitle({
    Date: { now: () => now },
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
  });
  instance.setData({ hero: true });
  const gpu = titleGpu();
  definition.lifetimes.ready.call(instance);
  runtime.queries[0].complete([{ left: 0, top: 0, width: 400, height: 400 / 1.65 }, gpu.result]);
  gpu.images[0].onload();
  assert.equal(instance.data.rendered, false);
  assert.equal(gpu.draws.length, 1, '只准备了离屏纹理，静态标题保持可见');
  const pending = [...timers.values()][0];
  assert.equal(pending.delay, 1700);
  now = 2700;
  pending.callback();
  assert.equal(gpu.draws.length, 2, '最终画布已有成功首帧');
  assert.equal(instance.data.rendered, true);
  definition.lifetimes.detached.call(instance);
  assert.equal(timers.size, 0);
  assert.equal(gpu.frames.size, 0);
  assert.equal(gpu.live.size, 0);
});

test('Hero静态纹理在WebGL失败时保留，图片失败才启用文字兜底，换源后可恢复', () => {
  const { instance, definition, runtime } = bootTitle();
  instance.setData({ hero: true });
  const gpu = titleGpu({ alpha: false });
  definition.lifetimes.ready.call(instance);
  runtime.queries[0].complete([{ left: 0, top: 0, width: 400, height: 400 / 1.65 }, gpu.result]);
  assert.equal(instance.data.rendered, false);
  assert.equal(instance.data.heroImageFailed, false, 'GPU失败不切换为尺寸不同的文字');
  definition.methods.heroImageError.call(instance);
  assert.equal(instance.data.heroImageFailed, true, '静态图片也失败时提供可读文字');
  instance.setData({ source: '/assets/titles/hero.png' });
  definition.observers['source, hero'].call(instance);
  assert.equal(instance.data.heroImageFailed, false);
  definition.lifetimes.detached.call(instance);
});

test('减少动态效果隐藏画布时不请求 WebGL，重新显示页面也保持文字回退', () => {
  const { instance, definition, runtime } = bootTitle();
  let contexts = 0;
  const canvas = { getContext() { contexts++; return null; } };
  definition.lifetimes.attached.call(instance);
  definition.lifetimes.ready.call(instance);
  const result = [{ left: 0, top: 0, width: 300, height: 100 }, { node: canvas, display: 'none' }];
  runtime.queries[0].complete(result);
  definition.pageLifetimes.hide.call(instance);
  definition.pageLifetimes.show.call(instance);
  assert.equal(runtime.queries.length, 2);
  runtime.queries[1].complete(result);
  assert.equal(contexts, 0);
  assert.equal(instance.data.rendered, false);
  assert.equal(instance.data.canvasStyle, '');
  definition.lifetimes.detached.call(instance);
});

test('标题缺少画布或有效尺寸时显示文字回退且停止重复初始化', () => {
  const bounds = { left: 0, top: 0, width: 300, height: 100 };
  for (const [title, hasCanvas] of [[null, true], [{ ...bounds, width: 0 }, true], [{ ...bounds, height: 0 }, true], [bounds, false]]) {
    const { instance, definition, runtime } = bootTitle();
    let contexts = 0;
    const canvas = { getContext() { contexts++; return null; } };
    definition.lifetimes.attached.call(instance);
    definition.lifetimes.ready.call(instance);
    assert.doesNotThrow(() => runtime.queries[0].complete([title, hasCanvas ? { node: canvas, display: 'block' } : null]));
    assert.equal(contexts, 0, '无有效测量信息时不分配 WebGL');
    assert.equal(instance.data.rendered, false);
    definition.observers.active.call(instance);
    assert.equal(runtime.queries.length, 1, '失败后保留回退，避免每次状态同步重复初始化');
    definition.lifetimes.detached.call(instance);
  }
});

test('标题卸载后忽略迟到的初始化查询，不写视图也不创建 WebGL', () => {
  const { instance, definition, runtime } = bootTitle();
  let contexts = 0;
  const canvas = { getContext() { contexts++; return null; } };
  definition.lifetimes.attached.call(instance);
  definition.lifetimes.ready.call(instance);
  definition.lifetimes.detached.call(instance);
  let updates = 0;
  instance.setData = () => { updates++; };
  runtime.queries[0].complete([{ left: 0, top: 0, width: 300, height: 100 }, { node: canvas, display: 'block' }]);
  definition.pageLifetimes.show.call(instance);
  definition.observers.active.call(instance);
  assert.equal(contexts, 0);
  assert.equal(updates, 0);
  assert.equal(runtime.queries.length, 1);
});

test('菜单下拉达到40px后展开并在松手后保持，合成点击不会关闭或自动导航', () => {
  const { instance, calls } = boot('pages/home/index.ts');
  const touch = (clientY) => ({ touches: [{ clientY }] });
  instance.onMenuTouchStart(touch(100));
  instance.onMenuTouchMove(touch(139));
  instance.onMenuTouchEnd();
  assert.equal(instance.data.menuOpen, false);
  assert.equal(calls.some((call) => call.name === 'pageScrollTo'), false);
  for (const distance of [40, 41, 72, 200, 10000]) {
    instance.onMenuTouchStart(touch(100));
    instance.onMenuTouchMove(touch(100 + distance));
    assert.equal(instance.data.menuOpen, true);
    instance.onMenuTouchEnd();
    assert.equal(instance.data.menuOpen, true, '松手保留展开菜单，等待用户选择');
    assert.equal(calls.some((call) => call.name === 'pageScrollTo'), false);
    instance.toggleMenu();
    assert.equal(instance.data.menuOpen, true, '手势结束后的合成点击不关闭菜单');
    instance.toggleMenu();
    assert.equal(instance.data.menuOpen, false, '后续主动点击仍可关闭菜单');
  }
  const beforeCancel = calls.length;
  instance.onMenuTouchStart(touch(100));
  instance.onMenuTouchMove(touch(204));
  instance.onMenuTouchCancel();
  instance.onMenuTouchEnd();
  assert.equal(instance.data.menuOpen, false);
  assert.equal(calls.length, beforeCancel);
});

test('菜单上滑、空触点及未达门槛的拖动不展开，正常点击仍可呼出', () => {
  const { instance, calls } = boot('pages/home/index.ts');
  instance.onMenuTouchStart({ touches: [{ clientY: 100 }] });
  for (const touches of [[], [{ clientY: 0 }], [{ clientY: 139 }]]) {
    instance.onMenuTouchMove({ touches });
    assert.equal(instance.data.menuOpen, false);
  }
  instance.onMenuTouchEnd();
  instance.toggleMenu();
  assert.equal(instance.data.menuOpen, true);
  assert.equal(calls.some((call) => call.name === 'pageScrollTo'), false);
});

test('作品进入和离开视口控制动图，卸载后断开观察且忽略迟到通知', () => {
  const { instance } = boot('pages/home/index.ts');
  const runtime = installHomeRuntime(instance);
  instance.onReady();
  runtime.observerCallback({ dataset: { key: 'mall' }, intersectionRatio: 0.5 });
  assert.equal(instance.data.visibleWorks.mall, true);
  assert.equal(instance.data.revealed.mall, true);
  runtime.observerCallback({ dataset: { key: 'mall' }, intersectionRatio: 0 });
  assert.equal(instance.data.visibleWorks.mall, false);
  assert.equal(instance.data.revealed.mall, false);
  runtime.observerCallback({ dataset: { key: 'restaurant' }, intersectionRatio: 1 });
  assert.equal(instance.data.visibleWorks.restaurant, true);
  instance.onUnload();
  assert.equal(runtime.disconnected, true);
  instance.setData = () => assert.fail('页面卸载后不应更新视图');
  runtime.observerCallback({ dataset: { key: 'mall' }, intersectionRatio: 1 });
  runtime.observerCallback({ dataset: { key: 'restaurant' }, intersectionRatio: 0 });
});

test('首页使用原生观察器，重复ready先断开旧实例，卸载释放引用', () => {
  const { instance } = boot('pages/home/index.ts');
  const runtime = installHomeRuntime(instance);
  instance.onReady();
  assert.equal(runtime.observers[0].options.nativeMode, true);
  assert.equal(runtime.observers[0].options.observeAll, true);
  const oldCallback = runtime.observerCallback;
  instance.onReady();
  assert.equal(runtime.observers[0].disconnected, true);
  assert.equal(runtime.observers.filter((item) => !item.disconnected).length, 1);
  oldCallback({ dataset: { key: 'mall' }, intersectionRatio: 1 });
  assert.equal(instance.data.visibleWorks.mall, undefined, '已替换观察器的迟到通知不能更新页面');
  runtime.observerCallback({ dataset: { key: 'mall' }, intersectionRatio: 1 });
  assert.equal(instance.data.visibleWorks.mall, true);
  instance.onUnload();
  assert.ok(runtime.observers.every((item) => item.disconnected));
  assert.equal(instance._observer, null);
});

test('分区测量使用同次查询的滚动偏移，滚动事件先到不会改变锚点绝对位置', () => {
  const { instance } = boot('pages/home/index.ts');
  const runtime = installHomeRuntime(instance);
  instance.onReady();
  assert.equal(runtime.queries.length, 1);
  const query = runtime.queries[0];
  assert.deepEqual(query.operations, [['selectAll', '.anchor'], ['boundingClientRect'], ['selectViewport'], ['scrollOffset'],
    ['selectAll', '.reveal'], ['fields', { dataset: true, rect: true, size: true }],
    ['select', '.portfolio'], ['boundingClientRect']]);
  instance.onPageScroll({ scrollTop: 400 });
  query.complete([[{ id: 'hero', top: -100 }, { id: 'about', top: 100 }, { id: 'works', top: 500 }], { scrollTop: 100 }]);
  instance.onPageScroll({ scrollTop: 450 });
  assert.equal(instance.data.activeSection, 'works');
  assert.equal(instance.data.activeLabel, '作品');
});

function revealValues(instance, key) {
  const style = instance.data.revealStyles[key];
  assert.equal(typeof style, 'string', `${key} 应有滚动动效样式`);
  assert.doesNotMatch(style, /transform/, '渐变不改变布局测量坐标');
  return {
    opacity: Number(style.match(/opacity:([\d.]+)/)[1]),
  };
}

test('内容随向下滚动渐入，反向滚动恢复原透明度，并在边界收敛', () => {
  const { instance } = boot('pages/home/index.ts');
  const runtime = installHomeRuntime(instance);
  instance.onReady();
  runtime.queries[0].complete([[], { scrollTop: 0 }, [
    { dataset: { key: 'about-copy' }, top: 800, height: 200 },
  ]]);
  const initial = revealValues(instance, 'about-copy');
  assert.ok(initial.opacity > 0 && initial.opacity < 1);
  instance.onPageScroll({ scrollTop: 320 });
  const middle = revealValues(instance, 'about-copy');
  assert.ok(middle.opacity > initial.opacity && middle.opacity < 1);
  instance.onPageScroll({ scrollTop: 10000 });
  assert.deepEqual(revealValues(instance, 'about-copy'), { opacity: 1 });
  instance.onPageScroll({ scrollTop: 320 });
  assert.deepEqual(revealValues(instance, 'about-copy'), middle);
  instance.onPageScroll({ scrollTop: 0 });
  assert.deepEqual(revealValues(instance, 'about-copy'), initial);
});

test('底部联系内容在最大滚动位置完全显示，反向滚动渐出且重测不漂移', () => {
  const { instance } = boot('pages/home/index.ts');
  const runtime = installHomeRuntime(instance);
  instance.onReady();
  runtime.queries[0].complete([[], { scrollTop: 0 }, [
    { dataset: { key: 'contact-card' }, top: 1400, height: 160 },
  ], { height: 1600 }]);
  const initial = revealValues(instance, 'contact-card').opacity;
  instance.onPageScroll({ scrollTop: 760 });
  const middle = revealValues(instance, 'contact-card').opacity;
  assert.ok(middle > initial && middle < 1);
  instance.measureSections();
  runtime.queries[1].complete([[], { scrollTop: 760 }, [
    { dataset: { key: 'contact-card' }, top: 640, height: 160 },
  ], { height: 1600 }]);
  assert.equal(revealValues(instance, 'contact-card').opacity, middle);
  instance.onPageScroll({ scrollTop: 800 });
  assert.equal(revealValues(instance, 'contact-card').opacity, 1, '无需超出页面底部就能完全显示');
  instance.onPageScroll({ scrollTop: 760 });
  assert.equal(revealValues(instance, 'contact-card').opacity, middle);
  instance.onPageScroll({ scrollTop: 0 });
  assert.equal(revealValues(instance, 'contact-card').opacity, initial);
});

test('迟到的旧测量不覆盖新布局，卸载后测量回调不更新视图', () => {
  const { instance } = boot('pages/home/index.ts');
  const runtime = installHomeRuntime(instance);
  instance.onReady();
  instance.measureSections();
  assert.equal(runtime.queries.length, 2);
  runtime.queries[1].complete([
    [{ id: 'hero', top: 0 }, { id: 'about', top: 500 }], { scrollTop: 0 },
    [{ dataset: { key: 'about-copy' }, top: 800, height: 200 }],
  ]);
  instance.onPageScroll({ scrollTop: 400 });
  assert.equal(instance.data.activeSection, 'about');
  const currentStyle = instance.data.revealStyles['about-copy'];
  runtime.queries[0].complete([
    [{ id: 'hero', top: 0 }, { id: 'works', top: 100 }], { scrollTop: 0 },
    [{ dataset: { key: 'about-copy' }, top: 0, height: 200 }],
  ]);
  assert.equal(instance.data.activeSection, 'about');
  assert.equal(instance.data.revealStyles['about-copy'], currentStyle);
  instance.measureSections();
  instance.onUnload();
  instance.setData = () => assert.fail('卸载后迟到的布局测量不应更新视图');
  runtime.queries[2].complete([
    [{ id: 'contact', top: 0 }], { scrollTop: 0 },
    [{ dataset: { key: 'about-copy' }, top: 0, height: 200 }],
  ]);
});

test('技能展开与收起后重新测量，后续内容动效跟随新位置，收起定位技能区', () => {
  const { instance, calls } = boot('pages/home/index.ts');
  const runtime = installHomeRuntime(instance);
  instance.onReady();
  const compactLayout = [
    [{ id: 'hero', top: 0 }, { id: 'skills', top: 100 }, { id: 'contact', top: 400 }],
    { scrollTop: 0 }, [{ dataset: { key: 'contact-card' }, top: 400, height: 200 }],
  ];
  runtime.queries[0].complete(compactLayout);
  instance.onPageScroll({ scrollTop: 100 });
  const compactStyle = instance.data.revealStyles['contact-card'];
  instance.toggleSkills();
  assert.equal(instance.data.skillsExpanded, true);
  assert.equal(runtime.queries.length, 2);
  assert.equal(calls.some((call) => call.name === 'pageScrollTo'), false);
  runtime.queries[1].complete([
    [{ id: 'hero', top: 0 }, { id: 'skills', top: 100 }, { id: 'contact', top: 1000 }],
    { scrollTop: 0 }, [{ dataset: { key: 'contact-card' }, top: 1000, height: 200 }],
  ]);
  assert.ok(revealValues(instance, 'contact-card').opacity < 0.5);
  assert.notEqual(instance.data.revealStyles['contact-card'], compactStyle);
  instance.onPageScroll({ scrollTop: 400 });
  assert.equal(instance.data.activeSection, 'skills', '技能展开后联系区仍在下方');
  instance.toggleSkills();
  assert.equal(instance.data.skillsExpanded, false);
  assert.equal(runtime.queries.length, 3);
  assert.equal(lastCall(calls, 'pageScrollTo').options.selector, '#skills');
  instance.onPageScroll({ scrollTop: 100 });
  runtime.queries[2].complete(compactLayout);
  assert.equal(instance.data.revealStyles['contact-card'], compactStyle);
});

test('单个作品动图失败只禁用该动图并保留静态封面及其它作品', () => {
  const { instance } = boot('pages/home/index.ts');
  const originalProjects = JSON.stringify(instance.data.projects);
  instance.onMotionError(event('mall'));
  assert.equal(instance.data.failedMotion.mall, true);
  assert.equal(instance.data.failedMotion.restaurant, undefined);
  assert.equal(Object.keys(instance.data.failedImages).length, 0);
  assert.equal(JSON.stringify(instance.data.projects), originalProjects);
  instance.onMotionError(event('__proto__'));
  instance.onMotionError(event('unknown'));
  assert.equal(Object.keys(instance.data.failedMotion).length, 1);
});

test('首页菜单和技能列表默认收起，支持反复切换及关闭', () => {
  const { instance } = boot('pages/home/index.ts');
  assert.equal(instance.data.menuOpen, false);
  assert.equal(instance.data.skillsExpanded, false);
  instance.toggleMenu();
  assert.equal(instance.data.menuOpen, true);
  instance.toggleMenu();
  assert.equal(instance.data.menuOpen, false);
  instance.toggleMenu();
  instance.closeMenu();
  instance.closeMenu();
  assert.equal(instance.data.menuOpen, false);
  instance.toggleSkills();
  assert.equal(instance.data.skillsExpanded, true);
  instance.toggleSkills();
  assert.equal(instance.data.skillsExpanded, false);
});

test('首页分区导航先关闭菜单，再按固定导航高度定位白名单分区', () => {
  const { instance, calls } = boot('pages/home/index.ts', {
    pageScrollTo: () => assert.equal(instance.data.menuOpen, false),
  });
  instance.setData({ headerHeight: 104 });
  for (const id of ['hero', 'about', 'works', 'experience', 'skills', 'contact']) {
    instance.setData({ menuOpen: true });
    instance.navigateSection(event(id));
    assert.equal(instance.data.menuOpen, false);
    const options = lastCall(calls, 'pageScrollTo').options;
    if (id === 'hero') {
      assert.equal(options.scrollTop, 0);
    } else {
      assert.equal(options.selector, `#${id}`);
      assert.equal(options.offsetTop, -104);
    }
  }
  assert.equal(calls.filter((call) => call.name === 'pageScrollTo').length, 6);
});

test('首页分区导航拒绝空值、非法类型及任意选择器', () => {
  const { instance, calls } = boot('pages/home/index.ts');
  for (const id of [undefined, null, '', [], ['works'], {}, 0, true, '__proto__', 'constructor', '#works', 'works, #contact', '作品😀', 'x'.repeat(10000)]) {
    instance.navigateSection(event(id));
  }
  assert.equal(calls.some((call) => call.name === 'pageScrollTo'), false);
});

test('Hero电话与微信在原位切换浮层，不导航或直接拨号，重复点击和外部点击收起', () => {
  const { instance, calls } = boot('pages/home/index.ts');
  assert.equal(instance.data.heroContactPanel, '');
  instance.toggleHeroContact(event('phone'));
  assert.equal(instance.data.heroContactPanel, 'phone');
  assert.equal(instance.data.contactVisible, false);
  instance.keepHeroContactOpen();
  assert.equal(instance.data.heroContactPanel, 'phone');
  instance.toggleHeroContact(event('wechat'));
  assert.equal(instance.data.heroContactPanel, 'wechat');
  instance.toggleHeroContact(event('wechat'));
  assert.equal(instance.data.heroContactPanel, '');
  instance.toggleHeroContact(event('phone'));
  instance.closeHeroContact();
  for (const id of [undefined, 'email', '__proto__']) instance.toggleHeroContact(event(id));
  assert.equal(instance.data.heroContactPanel, '');
  assert.equal(calls.length, 0);
});

test('Hero浮层随滚动、导航菜单、联系弹层和页面隐藏关闭，二维码失败仍能复制微信号', () => {
  const { instance, calls } = boot('pages/home/index.ts');
  for (const close of [() => instance.onPageScroll({ scrollTop: 100 }), () => instance.toggleMenu(),
    () => instance.showContact(), () => instance.onHide()]) {
    instance.closeContact();
    instance.toggleHeroContact(event('wechat'));
    close();
    assert.equal(instance.data.heroContactPanel, '');
  }
  instance.closeContact();
  instance.toggleHeroContact(event('wechat'));
  instance.onHeroQrError();
  assert.equal(instance.data.heroQrFailed, true);
  assert.equal(instance.data.heroContactPanel, 'wechat');
  instance.copyWechat();
  assert.equal(lastCall(calls, 'setClipboardData').options.data, instance.data.contact.wechat);
  instance.toggleHeroContact(event('phone'));
  instance.call();
  assert.equal(lastCall(calls, 'makePhoneCall').options.phoneNumber, instance.data.contact.phone);
  assert.equal(calls.some((call) => ['navigateTo', 'reLaunch', 'previewImage'].includes(call.name)), false);
});

test('从展开菜单打开联系方式会关闭菜单并显示联系弹层', () => {
  const { instance } = boot('pages/home/index.ts');
  instance.setData({ menuOpen: true });
  instance.showContact();
  assert.equal(instance.data.menuOpen, false);
  assert.equal(instance.data.contactVisible, true);
  instance.closeContact();
  assert.equal(instance.data.contactVisible, false);
});

test('回到顶部入口仅在滚动超过400时显示，返回顶部后隐藏', () => {
  const { instance } = boot('pages/home/index.ts');
  assert.equal(instance.data.showBackTop, false);
  for (const [scrollTop, expected] of [[0, false], [400, false], [401, true], [10000, true], [400, false], [401, true], [0, false]]) {
    instance.onPageScroll({ scrollTop });
    assert.equal(instance.data.showBackTop, expected, `scrollTop=${scrollTop}`);
  }
});

test('首页隐藏时关闭菜单并暂停动效，重新显示时恢复动效', () => {
  const { instance } = boot('pages/home/index.ts');
  instance.onShow();
  assert.equal(instance.data.motionActive, true);
  instance.setData({ menuOpen: true });
  instance.onHide();
  assert.equal(instance.data.menuOpen, false);
  assert.equal(instance.data.motionActive, false);
  instance.onShow();
  assert.equal(instance.data.motionActive, true);
  assert.equal(instance.data.menuOpen, false);
});

test('首页两个作品均能打开，分享详情能够独立加载对应作品', () => {
  const { instance: home, calls } = boot('pages/home/index.ts');
  for (const project of home.data.projects) {
    home.openProject(event(project.id));
    const url = lastCall(calls, 'navigateTo').options.url;
    assert.equal(url, `/pages/work-detail/index?id=${project.id}`);
    const { instance: detail } = boot('pages/work-detail/index.ts');
    detail.onLoad({ id: project.id });
    assert.equal(detail.data.project.title, project.title);
    assert.equal(detail.onShareAppMessage().path, url);
  }
});

test('无效详情参数不会误选作品，提供返回首页与安全分享入口', () => {
  for (const id of [undefined, '', '__proto__', ['mall'], '<script>']) {
    const { instance, calls } = boot('pages/work-detail/index.ts');
    instance.onLoad({ id });
    assert.equal(instance.data.project, null);
    assert.equal(instance.onShareAppMessage().path, '/pages/home/index');
    instance.goHome();
    assert.equal(lastCall(calls, 'reLaunch').options.url, '/pages/home/index');
  }
});

test('首页导航只接受已存在的作品，导航失败可见', () => {
  const { instance, calls } = boot('pages/home/index.ts', {
    navigateTo: (options) => options.fail({ errMsg: 'navigation failed' }),
  });
  instance.openProject(event('unknown'));
  assert.equal(calls.some((call) => call.name === 'navigateTo'), false);
  assert.ok(lastCall(calls, 'showToast'));
  instance.openProject(event('mall'));
  assert.match(lastCall(calls, 'showToast').options.title, /无法打开/);
});

test('联系方式可打开和关闭，图片失败只影响对应作品封面', () => {
  const { instance } = boot('pages/home/index.ts');
  instance.showContact();
  assert.equal(instance.data.contactVisible, true);
  instance.closeContact();
  assert.equal(instance.data.contactVisible, false);
  instance.onCoverError(event('mall'));
  instance.onCoverError(event('restaurant'));
  assert.equal(instance.data.failedImages.mall, true);
  assert.equal(instance.data.failedImages.restaurant, true);
  instance.onCoverError(event('__proto__'));
  assert.equal(Object.hasOwn(instance.data.failedImages, '__proto__'), false);
});

test('联系方式复制真实数据，拒绝复制时显示可操作提示', () => {
  const { instance, calls } = boot('components/contact-sheet/index.ts', {
    setClipboardData: (options) => options.fail({ errMsg: 'denied' }),
  });
  instance.copyWechat();
  assert.equal(lastCall(calls, 'setClipboardData').options.data, instance.data.contact.wechat);
  assert.match(lastCall(calls, 'showToast').options.title, /长按/);
  instance.copyEmail();
  assert.equal(lastCall(calls, 'setClipboardData').options.data, instance.data.contact.email);
  instance.close();
  assert.ok(lastCall(calls, 'event:close'));
});

test('用户取消拨号不显示错误，真实拨号失败提供替代方式', () => {
  const cancelled = boot('components/contact-sheet/index.ts', {
    makePhoneCall: (options) => options.fail({ errMsg: 'makePhoneCall:fail cancel' }),
  });
  cancelled.instance.call();
  assert.equal(lastCall(cancelled.calls, 'makePhoneCall').options.phoneNumber, cancelled.instance.data.contact.phone);
  assert.equal(cancelled.calls.some((call) => call.name === 'showToast'), false);
  const failed = boot('components/contact-sheet/index.ts', {
    makePhoneCall: (options) => options.fail({ errMsg: 'makePhoneCall:fail unavailable' }),
  });
  failed.instance.call();
  assert.match(lastCall(failed.calls, 'showToast').options.title, /长按复制/);
});

test('详情复制当前案例网址，图片失败仍可联系、分享与返回', () => {
  const { instance, calls } = boot('pages/work-detail/index.ts');
  instance.onLoad({ id: 'restaurant' });
  instance.copyProjectUrl();
  assert.equal(lastCall(calls, 'setClipboardData').options.data, instance.data.project.url);
  instance.onCoverError();
  assert.equal(instance.data.coverFailed, true);
  instance.showContact();
  assert.equal(instance.data.contactVisible, true);
  instance.closeContact();
  assert.equal(instance.data.contactVisible, false);
  assert.match(instance.onShareAppMessage().title, /美味佳肴/);
});

test('代码包封面与二维码先解析为本地文件再预览', () => {
  for (const entry of ['pages/work-detail/index.ts', 'components/contact-sheet/index.ts']) {
    const { instance, calls } = boot(entry, {
      getImageInfo: (options) => options.success({ path: 'wxfile://resolved-image.jpg' }),
    });
    if (entry.startsWith('pages/')) {
      instance.onLoad({ id: 'mall' });
      instance.showCover();
      assert.equal(lastCall(calls, 'getImageInfo').options.src, instance.data.project.cover);
    } else {
      instance.showQrCode();
      assert.equal(lastCall(calls, 'getImageInfo').options.src, instance.data.contact.qrCode);
    }
    assert.equal(lastCall(calls, 'previewImage').options.current, 'wxfile://resolved-image.jpg');
    assert.equal(lastCall(calls, 'previewImage').options.urls[0], 'wxfile://resolved-image.jpg');
  }
});

test('图片解析失败不继续预览，预览失败也有可见提示', () => {
  const unresolved = boot('components/contact-sheet/index.ts', {
    getImageInfo: (options) => options.fail({ errMsg: 'not found' }),
  });
  unresolved.instance.showQrCode();
  assert.equal(unresolved.calls.some((call) => call.name === 'previewImage'), false);
  assert.match(lastCall(unresolved.calls, 'showToast').options.title, /无法查看图片/);
  const failed = boot('components/contact-sheet/index.ts', {
    getImageInfo: (options) => options.success({ path: 'wxfile://resolved-image.jpg' }),
    previewImage: (options) => options.fail({ errMsg: 'preview failed' }),
  });
  failed.instance.showQrCode();
  assert.match(lastCall(failed.calls, 'showToast').options.title, /无法查看图片/);
});

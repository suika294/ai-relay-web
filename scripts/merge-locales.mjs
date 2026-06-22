// 把 src/locales/.frags 下各 agent 产出的 *.zh.json / *.en.json 合并成
// 每模块一个 <module>.gen.ts，并重建聚合入口 zh-CN.ts / en-US.ts。
// 手写的 common/menu/layout/auth.ts 保留;其余模块内容全部来自 .gen。
// 幂等,可重复运行(workflow 增量完成时多跑几次)。
import fs from 'fs';
import path from 'path';

const base = '/Users/mac/sub/ai-relay/frontend-web/src/locales';
const frag = path.join(base, '.frags');
const AUTHORED = ['common', 'menu', 'layout', 'auth']; // 手写模块,始终保留

const files = fs.readdirSync(frag).filter((f) => f.endsWith('.json'));
const mods = {}; // module -> { zh:{}, en:{} }
let dropped = 0;
for (const f of files) {
  const m = f.match(/^(.+)__(.+)\.(zh|en)\.json$/);
  if (!m) continue;
  const [, , module, lang] = m;
  let obj;
  try {
    obj = JSON.parse(fs.readFileSync(path.join(frag, f), 'utf8'));
  } catch (e) {
    console.error('坏 JSON,跳过:', f, e.message);
    dropped++;
    continue;
  }
  mods[module] = mods[module] || { zh: {}, en: {} };
  Object.assign(mods[module][lang], obj);
}

// 写 <module>.gen.ts
for (const [module, data] of Object.entries(mods)) {
  for (const [lang, dir] of [['zh', 'zh-CN'], ['en', 'en-US']]) {
    const out = path.join(base, dir, `${module}.gen.ts`);
    const body =
      '// AUTO-GENERATED from .frags — do not edit by hand\n' +
      'export default ' + JSON.stringify(data[lang], null, 2) + ' as Record<string, string>;\n';
    fs.writeFileSync(out, body);
  }
}

// 重建聚合入口
const genModules = Object.keys(mods).sort();
for (const lang of ['zh-CN', 'en-US']) {
  let imp = '';
  let spread = '';
  for (const a of AUTHORED) {
    imp += `import ${a} from './${lang}/${a}';\n`;
    spread += `  ...${a},\n`;
  }
  for (const g of genModules) {
    const v = g.replace(/[^a-zA-Z0-9]/g, '_') + 'Gen';
    imp += `import ${v} from './${lang}/${g}.gen';\n`;
    spread += `  ...${v},\n`;
  }
  fs.writeFileSync(path.join(base, `${lang}.ts`), imp + '\nexport default {\n' + spread + '};\n');
}

// 删除不再被引用的空 stub 模块文件(非手写、且没有 frag 的)
for (const lang of ['zh-CN', 'en-US']) {
  const dir = path.join(base, lang);
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.ts') || f.endsWith('.gen.ts')) continue;
    const name = f.replace(/\.ts$/, '');
    if (AUTHORED.includes(name)) continue; // 保留手写
    fs.rmSync(path.join(dir, f));
  }
}

const keyCount = Object.values(mods).reduce((n, d) => n + Object.keys(d.zh).length, 0);
console.log(`合并完成:模块 ${genModules.length} 个,gen key ${keyCount} 条,坏文件 ${dropped} 个`);
console.log('模块:', genModules.join(', '));

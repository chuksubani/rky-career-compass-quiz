// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../quiz-core.js');

function loadConfig(file) {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox);
  return JSON.parse(JSON.stringify(sandbox.window.QUIZ_CONFIG)); // plain same-realm copy
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const demo = loadConfig('examples/knowledge-config.js');
const outcomeCfg = loadConfig('examples/outcome-config.js');

const allCorrect = (cfg) => Object.fromEntries(cfg.questions.map(q => [q.id, q.choices.filter(c => c.correct).map(c => c.id)]));

test('shipped configs validate with no errors', () => {
  assert.deepEqual(Core.validateConfig(demo).errors, []);
  assert.deepEqual(Core.validateConfig(outcomeCfg).errors, []);
  assert.deepEqual(Core.validateConfig(demo).warnings, []);
});

test('knowledge: perfect score maps to top band', () => {
  const r = Core.score(demo, allCorrect(demo));
  assert.equal(r.earned, 6); assert.equal(r.total, 6); assert.equal(r.percent, 100);
  assert.equal(r.band.id, 'strong'); assert.deepEqual(r.revisitTopics, []);
});

test('knowledge: no answers scores 0, lowest band, all marked unanswered', () => {
  const r = Core.score(demo, {});
  assert.equal(r.earned, 0); assert.equal(r.band.id, 'building');
  assert.ok(r.items.every(i => i.status === 'unanswered'));
});

test('knowledge: band boundaries (3/6 = 50% -> solid; 2/6 -> building; 5/6 -> strong)', () => {
  const a = allCorrect(demo); const ids = Object.keys(a);
  const take = (n) => Object.fromEntries(ids.slice(0, n).map(k => [k, a[k]]));
  assert.equal(Core.score(demo, take(2)).band.id, 'building');
  assert.equal(Core.score(demo, take(3)).band.id, 'solid');
  assert.equal(Core.score(demo, take(5)).band.id, 'strong');
});

test('knowledge: multiple-choice all-or-nothing vs partial', () => {
  const answers = { 'q-xss': ['a', 'b'] }; // 2 of 3 correct, no wrong
  assert.equal(Core.score(demo, answers).items[4].status, 'incorrect');
  const partial = clone(demo); partial.scoring.multiple = 'partial';
  const r = Core.score(partial, answers);
  assert.equal(r.items[4].status, 'partial');
  assert.ok(Math.abs(r.earned - 2 / 3) < 1e-9);
  // wrong picks subtract, floor at 0
  assert.equal(Core.score(partial, { 'q-xss': ['c', 'e'] }).earned, 0);
  assert.ok(Math.abs(Core.score(partial, { 'q-xss': ['a', 'b', 'd', 'c'] }).earned - 2 / 3) < 1e-9);
});

test('knowledge: unknown/duplicate choice ids are ignored, extra picks on single are wrong', () => {
  assert.deepEqual(Core.selectedIds(demo.questions[0], { 'q-semantic-html': ['zzz', 'b', 'b'] }), ['b']);
  assert.equal(Core.score(demo, { 'q-semantic-html': ['b', 'a'] }).items[0].status, 'incorrect');
});

test('knowledge: revisit/strong topics', () => {
  const a = allCorrect(demo); a['q-http-status'] = ['a'];
  const r = Core.score(demo, a);
  assert.deepEqual(r.revisitTopics, ['HTTP']);
  assert.ok(r.strongTopics.includes('HTML') && !r.strongTopics.includes('HTTP'));
});

test('knowledge: weighted questions', () => {
  const c = clone(demo); c.questions[0].points = 3;
  const r = Core.score(c, { 'q-semantic-html': ['b'] });
  assert.equal(r.earned, 3); assert.equal(r.total, 8);
});

test('outcome: highest points wins and distribution sums to 100', () => {
  const r = Core.score(outcomeCfg, { q1: ['a'], q2: ['a'], q3: ['a'], q4: ['c'] });
  assert.equal(r.outcome.id, 'builder'); assert.deepEqual(r.tiedWith, []);
  assert.ok(Math.abs(r.ranking.reduce((s, x) => s + x.share, 0) - 100) < 1e-9);
});

test('outcome: tie resolves to config order and reports the tie', () => {
  const r = Core.score(outcomeCfg, { q1: ['a'], q2: ['b'], q3: [], q4: [] }); // builder 2, studier 2
  assert.equal(r.outcome.id, 'builder');
  assert.deepEqual(r.tiedWith.map(o => o.id), ['studier']);
  const flipped = clone(outcomeCfg); flipped.results.outcomes.reverse();
  assert.equal(Core.score(flipped, { q1: ['a'], q2: ['b'] }).outcome.id, 'studier');
});

test('outcome: no points at all yields no outcome rather than a misleading default', () => {
  const r = Core.score(outcomeCfg, {});
  assert.equal(r.outcome, null);
});

test('outcome: multi-outcome points accumulate', () => {
  const r = Core.score(outcomeCfg, { q3: ['d'] });
  const pts = Object.fromEntries(r.ranking.map(x => [x.outcome.id, x.points]));
  assert.equal(pts.collaborator, 1); assert.equal(pts.studier, 1);
});

test('canAdvance: required by default, optional when required:false', () => {
  const q = clone(demo.questions[0]);
  assert.equal(Core.canAdvance(q, {}), false);
  assert.equal(Core.canAdvance(q, { [q.id]: ['b'] }), true);
  q.required = false; assert.equal(Core.canAdvance(q, {}), true);
});

/* ---- validation errors ---- */
function errorsAfter(mutate, base = demo) { const c = clone(base); mutate(c); return Core.validateConfig(c).errors.join('\n'); }

test('validation: structural problems produce specific errors', () => {
  assert.match(errorsAfter(c => { c.questions[1].id = c.questions[0].id; }), /questions\[1\]\.id.*duplicate/);
  assert.match(errorsAfter(c => { c.questions[0].choices[1].id = 'a'; }), /choices\[1\]\.id.*duplicate/);
  assert.match(errorsAfter(c => { c.questions[0].choices = [c.questions[0].choices[0]]; }), /at least two choices/);
  assert.match(errorsAfter(c => { c.questions[0].choices.forEach(x => delete x.correct); }), /exactly one choice with correct/);
  assert.match(errorsAfter(c => { c.questions[0].choices[0].correct = true; }), /exactly one choice with correct: true \(found 2\)/);
  assert.match(errorsAfter(c => { c.questions = []; }), /questions/);
  assert.match(errorsAfter(c => { c.type = 'quizzz'; }), /type/);
  assert.match(errorsAfter(c => { delete c.title; }), /title/);
  assert.match(errorsAfter(c => { c.results.bands = c.results.bands.slice(1); }), /minPercent 0/);
  assert.match(errorsAfter(c => { c.results.bands[1].minPercent = 0; }), /duplicate minPercent/);
  assert.match(errorsAfter(c => { c.scoring.multiple = 'lenient'; }), /scoring\.multiple/);
});

test('validation: outcome points must reference real outcomes', () => {
  assert.match(errorsAfter(c => { c.questions[0].choices[0].points = { ghost: 1 }; }, outcomeCfg), /unknown outcome id/);
  assert.match(errorsAfter(c => { c.questions[0].choices.forEach(x => delete x.points); }, outcomeCfg), /no choice awards points/);
  assert.match(errorsAfter(c => { c.results.outcomes[1].id = 'builder'; }, outcomeCfg), /duplicate id/);
  assert.match(errorsAfter(c => { c.scoring.tieBreak = 'random'; }, outcomeCfg), /tieBreak/);
});

test('validation: URLs, origins and theme values are restricted', () => {
  assert.match(errorsAfter(c => { c.cta.url = 'javascript:alert(1)'; }), /cta\.url/);
  assert.match(errorsAfter(c => { c.cta.url = 'http://evil.example/'; }), /cta\.url/);
  assert.match(errorsAfter(c => { c.cta.url = '//evil.example/'; }), /cta\.url/);
  assert.equal(errorsAfter(c => { c.cta.url = '/plans'; }), '');
  assert.match(errorsAfter(c => { c.integration.allowedParentOrigins = ['*']; }), /allowedParentOrigins/);
  assert.match(errorsAfter(c => { c.integration.allowedParentOrigins = ['https://a.example/path']; }), /allowedParentOrigins/);
  assert.equal(errorsAfter(c => { c.integration.allowedParentOrigins = ['https://a.example']; }), '');
  assert.match(errorsAfter(c => { c.theme.accent = 'red; background:url(x)'; }), /theme\.accent/);
  assert.match(errorsAfter(c => { c.theme.bogus = 'x'; }), /unknown theme key/);
  assert.match(errorsAfter(c => { c.leadCapture.endpoint = 'ftp://x'; }), /leadCapture\.endpoint/);
});

test('validateConfig rejects non-objects', () => {
  assert.ok(Core.validateConfig(null).errors.length);
  assert.ok(Core.validateConfig('x').errors.length);
});

test('safeUrl / isValidEmail', () => {
  assert.equal(Core.safeUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(Core.safeUrl('http://localhost:8000/x'), 'http://localhost:8000/x');
  assert.equal(Core.safeUrl('./next.html'), './next.html');
  for (const bad of ['javascript:alert(1)', ' JaVaScRiPt:1', 'java\tscript:1', 'data:text/html,x', 'http://example.com', '//x.y', '\\\\x', '', null]) {
    assert.equal(Core.safeUrl(bad), null, String(bad));
  }
  assert.ok(Core.isValidEmail('a@b.co')); 
  for (const bad of ['', 'a', 'a@b', 'a b@c.com', '@c.com', 'a@@c.com']) assert.ok(!Core.isValidEmail(bad), bad);
});

test('validation: optional intro block and theme.ink', () => {
  assert.equal(errorsAfter(c => { c.intro = { bullets: ['a', 'b'], note: 'n' }; }), '');
  assert.match(errorsAfter(c => { c.intro = { bullets: 'nope' }; }), /intro\.bullets/);
  assert.match(errorsAfter(c => { c.intro = { bullets: ['ok', ''] }; }), /intro\.bullets/);
  assert.equal(errorsAfter(c => { c.theme.ink = '#111'; }), '');
});

test('validation: theme.mode accepts light, dark, auto only', () => {
  for (const m of ['light', 'dark', 'auto']) assert.equal(errorsAfter(c => { c.theme.mode = m; }), '');
  assert.match(errorsAfter(c => { c.theme.mode = 'sepia'; }), /theme\.mode/);
});

test('validation: shell and accentText theme keys are accepted', () => {
  assert.equal(errorsAfter(c => { c.theme.shell = '#f4f3f1'; c.theme.accentText = '#b4500f'; }), '');
});

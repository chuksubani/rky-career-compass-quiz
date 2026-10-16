// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../quiz-core.js');
const PS = require('../pathway-scoring.js');
const DATA = require('../compass-data.js');

const clone = (o) => JSON.parse(JSON.stringify(o));
function loadCompass() {
  const sandbox = { window: { COMPASS_DATA: clone(DATA) } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'quiz-config.js'), 'utf8'), sandbox);
  return JSON.parse(JSON.stringify(sandbox.window.QUIZ_CONFIG));
}
const cfg = loadCompass();
const score = (answers) => Core.score(cfg, answers);
const top = (r) => r.top.map((e) => e.id);
const byId = (r, id) => r.ranking.find((e) => e.id === id);

// A neutral respondent: answers everything, scores nothing. Personas override what matters.
const NEUTRAL = {
  Q01: ['EMP_SWITCH'], Q02: ['NONE'], Q03: 'Assistant', Q04: ['LT2'], Q05: ['LIMITED'],
  Q06: [], Q07: ['NONE'], Q08: ['BASIC'], Q09: [], Q10: ['EARN'], Q11: ['ENTRY'], Q12: ['AV_NONE'],
  Q13: ['M36'], Q14: ['H3_5'], Q15: ['PATH'], Q16: ['LIVE'], Q17: ['NG'], Q18: ['REMOTE'], Q23: ['EXPLORE']
};
const persona = (over) => Object.assign({}, NEUTRAL, over);

/* ---------- configuration ---------- */

test('Career Compass config validates with no errors or warnings', () => {
  const v = Core.validateConfig(cfg);
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.warnings, []);
});

test('generated data matches the workbook shape (23 questions, 7 pathways, weights add to 1)', () => {
  assert.equal(DATA.questions.length, 23);
  assert.equal(DATA.pathways.length, 7);
  assert.deepEqual(DATA.pathwayOrder, ['DATA', 'PM', 'BA', 'AML', 'AI', 'CYBER', 'VA']);
  assert.ok(Math.abs(Object.values(DATA.weights).reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test('validation catches broken pathway configs', () => {
  const bad = (mutate, re) => {
    const c = clone(cfg); mutate(c);
    assert.ok(Core.validateConfig(c).errors.some((e) => re.test(e)), 'expected an error matching ' + re);
  };
  bad((c) => { c.questions[1].showIf = { q: 'Q05', in: ['X'] }; }, /showIf.*earlier/);              // refers forward
  bad((c) => { c.stages[0].questions.pop(); }, /not in any stage/);
  bad((c) => { c.stages[1].questions.push('Q01'); }, /more than one stage/);
  bad((c) => { c.pathway.weights.tools = 0.5; }, /add up to 1/);
  bad((c) => { c.pathway.cta.bootcamps.DATA.url = 'javascript:alert(1)'; }, /bootcamps\.DATA\.url/);
  bad((c) => { c.pathway.cta.target = 'popup'; }, /cta\.target/);
  bad((c) => { c.questions[4].exclusive = ['NOPE']; }, /unknown choice id/);
  bad((c) => { c.questions[4].choices[0].points = { ZZZ: 1 }; }, /unknown pathway id/);
  bad((c) => { c.questions[4].dimension = undefined; }, /dimension "experience"/);
  bad((c) => { c.pathway.avoidance.DATA.answer = 'NOPE'; }, /not a choice of Q12/);
});

test('"host" is an accepted CTA target and "text" is rejected outside pathway quizzes', () => {
  const c = clone(cfg); c.pathway.cta.target = 'host';
  assert.deepEqual(Core.validateConfig(c).errors, []);
  const k = clone(require('./fixtures-knowledge.js'));
  k.questions[0].type = 'text'; delete k.questions[0].choices;
  assert.ok(Core.validateConfig(k).errors.some((e) => /only supported in pathway/.test(e)));
});

/* ---------- conditional questions ---------- */

test('UK questions appear only when relevant, and cascade', () => {
  const ids = (a) => Core.resolve(cfg, a).visible.map((q) => q.id);
  assert.equal(ids(persona({})).length, 19);                                       // no UK info
  assert.ok(!ids(persona({})).includes('Q19'));
  assert.ok(ids(persona({ Q17: ['UK'] })).includes('Q19'));                        // based in UK
  assert.ok(ids(persona({ Q18: ['NG', 'UK'] })).includes('Q19'));                  // targeting UK
  const spons = persona({ Q17: ['UK'], Q19: ['SPONSORED'] });
  assert.ok(ids(spons).includes('Q20') && ids(spons).includes('Q22') && !ids(spons).includes('Q21'));
  const yes = persona({ Q17: ['UK'], Q19: ['SPONSORED'], Q20: ['YES'] });
  assert.equal(ids(yes).length, 23);
  assert.ok(ids(persona({ Q17: ['UK'], Q19: ['UNRESTRICTED'] })).length === 20);   // Q19 only
});

test('changing an early answer drops stale answers instead of letting them score or be sent', () => {
  const stale = persona({ Q17: ['NG'], Q18: ['REMOTE'], Q19: ['SPONSORED'], Q20: ['YES'], Q21: ['FIN'], Q22: ['STAY'] });
  const r = Core.resolve(cfg, stale);
  ['Q19', 'Q20', 'Q21', 'Q22'].forEach((id) => assert.equal(r.answers[id], undefined, id + ' should be dropped'));
  assert.equal(score(stale).roadmap.conditional, false);
});

/* ---------- answer rules ---------- */

test('multi-select limits, exclusive answers and text length gate Continue', () => {
  const q = (id) => cfg.questions.find((x) => x.id === id);
  assert.equal(Core.canAdvance(q('Q06'), { Q06: ['ANALYTICAL', 'PLAN', 'COMM'] }), true);
  assert.equal(Core.canAdvance(q('Q06'), { Q06: ['ANALYTICAL', 'PLAN', 'COMM', 'SOLVE'] }), false);
  assert.equal(Core.canAdvance(q('Q05'), { Q05: ['LIMITED'] }), true);
  assert.equal(Core.canAdvance(q('Q05'), { Q05: ['LIMITED', 'REPORT'] }), false);
  assert.equal(Core.canAdvance(q('Q07'), { Q07: ['NONE', 'EXCEL'] }), false);
  assert.equal(Core.canAdvance(q('Q07'), { Q07: ['EXCEL', 'SQL', 'JIRA', 'MIRO', 'KYC', 'LLM'] }), true); // unlimited
  assert.equal(Core.canAdvance(q('Q03'), {}), false);
  assert.equal(Core.canAdvance(q('Q03'), { Q03: '   ' }), false);
  assert.equal(Core.canAdvance(q('Q03'), { Q03: 'Analyst' }), true);
  assert.equal(Core.canAdvance(q('Q03'), { Q03: 'x'.repeat(81) }), false);
});

test('optional questions (Q19-Q22) can be skipped', () => {
  const q19 = cfg.questions.find((x) => x.id === 'Q19');
  assert.equal(q19.required, false);
  assert.equal(Core.canAdvance(q19, {}), true);
});

/* ---------- scoring ---------- */

test('dimension normalisation: experience, interests, strengths, tools', () => {
  const r = score(persona({
    Q05: ['REPORT', 'PROCESS', 'COORD', 'CHECK', 'AUTOMATE', 'SUPPORT'],           // DATA points 3,0,0,0,0,0
    Q09: ['INSIGHTS', 'DELIVER'],                                                  // DATA 3 and 0
    Q06: ['ANALYTICAL', 'PLAN', 'COMM'],                                           // DATA 3,0,0
    Q07: ['POWERBI', 'SQL', 'EXCEL', 'JIRA', 'MIRO']                               // DATA 3,3,2,0,0
  }));
  const d = byId(r, 'DATA').dimensions;
  assert.ok(Math.abs(d.experience - 25) < 1e-9);              // 3 / 12
  assert.ok(Math.abs(d.interests - 50) < 1e-9);               // 3 / (3 x 2)
  assert.ok(Math.abs(d.strengths - 100 / 3) < 1e-9);          // 3 / 9
  assert.ok(Math.abs(d.tools - 800 / 9) < 1e-9);              // top three: 3+3+2 = 8 / 9
  const expected = 0.35 * d.experience + 0.30 * d.interests + 0.20 * d.strengths + 0.15 * d.tools;
  assert.ok(Math.abs(byId(r, 'DATA').final - expected) < 1e-9);
});

test('a long tool list is not rewarded beyond the three strongest signals', () => {
  const three = score(persona({ Q09: ['INSIGHTS'], Q07: ['POWERBI', 'SQL', 'EXCEL'] }));
  const many = score(persona({ Q09: ['INSIGHTS'], Q07: ['POWERBI', 'SQL', 'EXCEL', 'JIRA', 'MIRO', 'KYC', 'LLM', 'OFFICE', 'REMOTE'] }));
  assert.equal(byId(three, 'DATA').dimensions.tools, byId(many, 'DATA').dimensions.tools);
});

test('only Q05-Q07 and Q09 score: industry, goals, location and UK answers change nothing', () => {
  const base = persona({ Q05: ['REPORT'], Q06: ['ANALYTICAL'], Q07: ['EXCEL'], Q09: ['INSIGHTS'] });
  const a = score(base);
  const b = score(Object.assign({}, base, { Q02: ['FIN'], Q10: ['LEAD'], Q11: ['MANAGER'], Q17: ['UK'], Q19: ['SPONSORED'], Q20: ['YES'], Q21: ['TECH'], Q22: ['CONCERN'] }));
  assert.deepEqual(a.ranking.map((e) => [e.id, e.final]), b.ranking.map((e) => [e.id, e.final]));
});

test('results are the top three, in descending order, with positive scores only', () => {
  const r = score(persona({ Q05: ['REPORT'], Q09: ['INSIGHTS'], Q06: ['ANALYTICAL'], Q07: ['EXCEL'] }));
  assert.ok(r.top.length <= 3);
  for (let i = 1; i < r.top.length; i++) assert.ok(r.top[i - 1].final >= r.top[i].final);
  assert.ok(r.top.every((e) => e.final > 0));
});

/* ---------- spec Acceptance Tests ---------- */

test('AT1 finance analyst, strong Excel, likes data: DATA leads, AML possible, finance alone is not enough', () => {
  const r = score(persona({ Q02: ['FIN'], Q05: ['REPORT'], Q06: ['ANALYTICAL'], Q07: ['EXCEL'], Q09: ['INSIGHTS'] }));
  assert.ok(top(r).slice(0, 2).includes('DATA'));
  assert.equal(top(r)[0], 'DATA');
  // Industry alone must not produce a DATA lead.
  const onlyIndustry = score(persona({ Q02: ['FIN'] }));
  assert.equal(onlyIndustry.insufficient, true);
});

test('AT2 care worker who coordinates and likes project work: PM outranks AML', () => {
  const r = score(persona({ Q02: ['CARE'], Q05: ['COORD'], Q06: ['PLAN'], Q09: ['DELIVER'] }));
  assert.equal(top(r)[0], 'PM');
  assert.ok(byId(r, 'PM').rank < byId(r, 'AML').rank);
});

test('AT3 IT support who dislikes security tasks: CYBER is reduced by the penalty and AI remains an alternative', () => {
  const answers = { Q02: ['TECH'], Q05: ['SYSTEM', 'AUTOMATE'], Q06: ['TECH'], Q09: ['AI', 'SECURE'] };
  const without = score(persona(answers));
  const withAvoid = score(persona(Object.assign({}, answers, { Q12: ['AV_CYBER'] })));
  const cy = byId(withAvoid, 'CYBER');
  assert.equal(cy.penalty, 10);
  assert.ok(Math.abs(cy.final - (byId(without, 'CYBER').final - 10)) < 1e-9);
  assert.ok(top(withAvoid).includes('AI'));
  assert.ok(withAvoid.avoidanceNotes.some((n) => n.pathwayId === 'CYBER'));
});

test('AT4 no work experience, interested in AI: AI can lead, readiness is "Getting started", never job-ready', () => {
  const r = score(persona({ Q04: ['ZERO'], Q05: ['LIMITED'], Q08: ['BEGINNER'], Q14: ['H0_2'], Q07: ['NONE'], Q09: ['AI'] }));
  assert.equal(top(r)[0], 'AI');
  assert.equal(r.readiness.id, 'starting');
  assert.ok(!/job.ready/i.test(JSON.stringify(cfg.pathway.readiness)));
});

test('AT5 a UK-sponsored worker gets exactly the same career scores as an unsponsored one', () => {
  const core = { Q05: ['REPORT'], Q06: ['ANALYTICAL'], Q07: ['SQL'], Q09: ['INSIGHTS'] };
  const plain = score(persona(core));
  const sponsored = score(persona(Object.assign({}, core, { Q17: ['UK'], Q19: ['SPONSORED'], Q20: ['YES'], Q21: ['FIN'], Q22: ['STAY'] })));
  assert.deepEqual(plain.ranking.map((e) => [e.id, e.final, e.dimensions]), sponsored.ranking.map((e) => [e.id, e.final, e.dimensions]));
  assert.equal(sponsored.roadmap.conditional, true);                       // extra guidance only
  assert.ok(sponsored.roadmap.conditionalRows.length > 0);
  assert.equal(plain.roadmap.conditional, false);
});

test('AT6 no UK information: no UK-specific assumptions anywhere', () => {
  const answers = persona({ Q05: ['REPORT'], Q09: ['INSIGHTS'] });
  const r = score(answers);
  assert.equal(r.roadmap.conditional, false);
  const payload = PS.leadPayload(cfg, { leadId: 'id', startedAt: 's', completedAt: 'c', now: 'n', answers: Core.resolve(cfg, answers).answers, result: r, form: { name: 'A', email: 'a@b.co' } });
  ['work_eligibility', 'sponsorship_status', 'sponsored_industry', 'sponsorship_impact'].forEach((k) => assert.equal(k in payload, false, k));
});

test('AT7 declining marketing: result and lead still work, opt-ins are false, no consent timestamp', () => {
  const answers = persona({ Q05: ['REPORT'], Q09: ['INSIGHTS'] });
  const r = score(answers);
  const p = PS.leadPayload(cfg, { leadId: 'id', startedAt: 's', completedAt: 'c', now: '2026-10-16T00:00:00Z', answers, result: r, form: { name: 'Ada', email: 'ada@example.com' } });
  assert.equal(p.email_marketing_optin, false);
  assert.equal(p.whatsapp_marketing_optin, false);
  assert.equal('consent_timestamp' in p, false);
  assert.equal(p.email, 'ada@example.com');
  assert.ok(r.top.length > 0);
  const opted = PS.leadPayload(cfg, { leadId: 'id', startedAt: 's', completedAt: 'c', now: '2026-10-16T00:00:00Z', answers, result: r, form: { name: 'Ada', email: 'ada@example.com', emailOptIn: true } });
  assert.equal(opted.email_marketing_optin, true);
  assert.equal(opted.consent_timestamp, '2026-10-16T00:00:00Z');
  // A WhatsApp opt-in without a number is meaningless and is not recorded.
  const noNumber = PS.leadPayload(cfg, { leadId: 'id', startedAt: 's', completedAt: 'c', now: 'n', answers, result: r, form: { name: 'Ada', email: 'a@b.co', whatsappOptIn: true } });
  assert.equal(noNumber.whatsapp_marketing_optin, false);
});

test('AT8 no scored answers: "not enough information", no top matches, info-session CTA', () => {
  [{}, persona({}), persona({ Q05: ['LIMITED'], Q07: ['NONE'] })].forEach((a) => {
    const r = score(a);
    assert.equal(r.insufficient, true);
    assert.deepEqual(r.top, []);
    assert.equal(PS.suggestedCta(cfg, r).kind, 'info-session');
  });
});

/* ---------- ranking mechanics ---------- */

// A miniature pathway config to exercise tie-breaks and clamping in isolation.
function mini(weights, qs, extra) {
  const q = (id, dimension, type, choices) => ({ id, type, text: id, dimension, choices: choices.map(([cid, points]) => ({ id: cid, text: cid, points })) });
  return Object.assign({
    id: 'mini', type: 'pathway', title: 't', description: 'd', results: {},
    questions: [
      q('E', 'experience', 'multiple', qs.E || [['e1', { A: 3 }], ['e2', { A: 3 }], ['e3', { A: 3 }], ['e4', { A: 3 }], ['e0', {}]]),
      q('I', 'interests', 'multiple', qs.I || [['i1', { B: 3 }], ['i0', {}]]),
      q('S', 'strengths', 'multiple', qs.S || [['s1', { B: 3 }], ['s0', {}]]),
      q('T', 'tools', 'multiple', qs.T || [['t1', { B: 3 }], ['t0', {}]])
    ],
    pathway: {
      pathways: ['A', 'B', 'C'].map((id) => ({ id, name: id, skillGaps: [], starterRoles: [], progressionRoles: [], portfolio: '' })),
      weights, templates: [{ segment: 'x', period: '0-30', action: 'a' }],
      readiness: { points: {}, labels: [{ id: 'l', label: 'l', min: 0 }] },
      cta: { bootcamps: { A: { url: '/a' }, B: { url: '/b' }, C: { url: '/c' } }, infoSession: { label: 'i', url: '/i' } }
    }
  }, extra || {});
}

test('tie-break 1: equal final -> higher interests wins', () => {
  const c = mini({ experience: 0.5, interests: 0.5, strengths: 0, tools: 0 }, {});
  const r = Core.score(c, { E: ['e1', 'e2', 'e3', 'e4'], I: ['i1'] });   // A: exp 100 -> 50; B: int 100 -> 50
  assert.equal(byId(r, 'A').final, byId(r, 'B').final);
  assert.deepEqual(top(r).slice(0, 2), ['B', 'A']);
});

test('tie-break 2: equal final and interests -> higher experience wins', () => {
  const c = mini({ experience: 0.5, interests: 0, strengths: 0.5, tools: 0 },
    { S: [['s1', { B: 3 }], ['s2', { B: 3 }], ['s3', { B: 3 }]] });
  const r = Core.score(c, { E: ['e1', 'e2', 'e3', 'e4'], S: ['s1', 's2', 's3'] });   // A: exp 100; B: strengths 100
  assert.equal(byId(r, 'A').final, byId(r, 'B').final);
  assert.deepEqual(top(r).slice(0, 2), ['A', 'B']);
});

test('tie-break 3: otherwise the configured pathway order', () => {
  const c = mini({ experience: 0.25, interests: 0.25, strengths: 0.25, tools: 0.25 },
    { E: [['e1', { A: 3, B: 3 }], ['e0', {}]], I: [['i0', {}]], S: [['s0', {}]], T: [['t0', {}]] });
  const r = Core.score(c, { E: ['e1'] });
  assert.equal(byId(r, 'A').final, byId(r, 'B').final);
  assert.deepEqual(top(r).slice(0, 2), ['A', 'B']);
});

test('dimension scores are clamped to 100', () => {
  // Experience answers worth 3 each, five picks: top four = 12/12 = 100 and no more.
  const c = mini({ experience: 1, interests: 0, strengths: 0, tools: 0 }, { E: [['e1', { A: 3 }], ['e2', { A: 3 }], ['e3', { A: 3 }], ['e4', { A: 3 }], ['e5', { A: 3 }]] });
  const r = Core.score(c, { E: ['e1', 'e2', 'e3', 'e4', 'e5'] });
  assert.equal(byId(r, 'A').dimensions.experience, 100);
  assert.equal(byId(r, 'A').final, 100);
});

test('avoidance penalty is 10 points and never takes a score below 0', () => {
  const r = score(persona({ Q07: ['OFFICE'], Q12: ['AV_VA'] }));           // VA tools 2/9 x 15% = 3.3
  const va = byId(r, 'VA');
  assert.equal(va.penalty, 10);
  assert.equal(va.final, 0);
  assert.ok(!top(r).includes('VA'));
});

test('AV_NONE applies no penalty', () => {
  const r = score(persona({ Q09: ['INSIGHTS'], Q12: ['AV_NONE'] }));
  assert.ok(r.ranking.every((e) => e.penalty === 0));
});

/* ---------- readiness, segment, roadmap ---------- */

test('readiness: thresholds and tool bands', () => {
  const rd = (a) => PS.readiness(cfg, Core.resolve(cfg, persona(a)).answers);
  assert.equal(rd({ Q04: ['ZERO'], Q08: ['BEGINNER'], Q14: ['H0_2'], Q07: ['NONE'] }).points, 0);
  assert.equal(rd({ Q04: ['Y2_5'], Q08: ['BASIC'], Q14: ['H3_5'], Q07: ['EXCEL'] }).points, 2 + 1 + 1 + 1);
  const hi = rd({ Q04: ['GT5'], Q08: ['ADVANCED'], Q14: ['H10PLUS'], Q07: ['EXCEL', 'SQL', 'JIRA'] });
  assert.equal(hi.points, 11); assert.equal(hi.max, 11); assert.equal(hi.id, 'prepared');
  assert.equal(rd({ Q04: ['Y2_5'], Q08: ['INTERMEDIATE'], Q14: ['H3_5'], Q07: ['NONE'] }).id, 'building'); // 2+2+1+0 = 5
  assert.equal(rd({ Q15: ['COST'] }).barrier, 'COST');
});

test('roadmap segment rules and tailored lines', () => {
  const seg = (a) => score(persona(a)).roadmap.segment;
  assert.equal(seg({ Q01: ['SEARCH'], Q13: ['EXPLORE'] }), 'Job search');
  assert.equal(seg({ Q01: ['STUDENT'], Q23: ['NEW_JOB'] }), 'Job search');
  assert.equal(seg({ Q13: ['EXPLORE'] }), 'Exploring');
  assert.equal(seg({ Q13: ['M612'] }), 'Exploring');
  assert.equal(seg({ Q13: ['M03'] }), 'Ready to train');
  const r = score(persona({ Q05: ['REPORT'], Q09: ['INSIGHTS'], Q15: ['TIME'], Q23: ['UPSKILL'], Q16: ['SELF'] }));
  assert.equal(r.roadmap.rows.length, 3);
  assert.deepEqual(r.roadmap.addons.map((a) => a.question), ['Q15', 'Q23', 'Q16']);
});

/* ---------- payload ---------- */

test('lead payload carries the workbook CRM fields and never an unvalidated score', () => {
  const answers = persona({ Q05: ['REPORT'], Q09: ['INSIGHTS'], Q03: 'Analyst', Q17: ['UK'], Q18: ['UK', 'NG'], Q19: ['SPONSORED'], Q20: ['YES'], Q21: ['FIN'], Q22: ['STAY'], Q23: ['SWITCH'] });
  const kept = Core.resolve(cfg, answers).answers;
  const r = Core.score(cfg, answers);
  const p = PS.leadPayload(cfg, { leadId: 'u', startedAt: 's', completedAt: 'c', now: 'n', answers: kept, result: r, privacyNoticeVersion: 'v1', courseInterest: ['DATA'],
    form: { name: 'Ada', email: 'ada@example.com', whatsapp: '+2348000000000', whatsappOptIn: true } });
  assert.equal(p.lead_id, 'u');
  assert.equal(p.current_role, 'Analyst');
  assert.equal(p.location, 'UK');
  assert.deepEqual(p.target_markets, ['UK', 'NG']);
  assert.equal(p.work_eligibility, 'SPONSORED');
  assert.equal(p.sponsorship_status, 'YES');
  assert.deepEqual(p.ninety_day_goal, ['SWITCH']);
  assert.deepEqual(p.top_three_pathways, r.top.map((e) => e.id));
  assert.equal(p.readiness_label, r.readiness.id);
  assert.equal(p.privacy_notice_version, 'v1');
  assert.deepEqual(p.course_interest, ['DATA']);
  assert.equal(p.whatsapp_marketing_optin, true);
  assert.equal(p.suggested_cta.kind, 'bootcamp');
  assert.ok(p.suggested_cta.url.startsWith('https://'));
  assert.equal('lead_segment' in p, false);                                   // assigned by the CRM
});

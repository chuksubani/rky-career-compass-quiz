/*
 * pathway-scoring.js — the Career Compass scoring model (config.type === 'pathway').
 * Pure logic, no DOM: runs in the browser (registers itself with QuizCore) and in Node,
 * so a backend can re-score submitted answer ids with exactly the same rules.
 *
 * Rules (from the workbook's Build Logic / Dimension Weights sheets):
 *   - Only the questions that carry a `dimension` score (experience, interests, strengths, tools).
 *     Industry, location, readiness and UK eligibility questions never change the match.
 *   - Per pathway each dimension is normalised to 0-100 and clamped:
 *       experience = sum of the pathway's top 4 selected points / 12
 *       interests  = sum of selected points / (3 x number selected)
 *       strengths  = sum of the pathway's top 3 selected points / 9
 *       tools      = sum of the pathway's top 3 selected points / 9
 *   - final = weighted sum - avoidance penalty, never below 0.
 *   - Ties: higher interests, then higher experience, then the pathway order in the config.
 *   - No scored signal -> `insufficient: true` and no numerical match.
 */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var Core = isNode ? require('./quiz-core.js') : root.QuizCore;
  if (!Core) throw new Error('pathway-scoring.js needs quiz-core.js to be loaded first.');
  var api = factory(Core);
  if (isNode) module.exports = api; else root.PathwayScoring = api;
}(typeof self !== 'undefined' ? self : this, function (Core) {
  'use strict';

  var MAX_POINT = 3;                                    // top of the 0-3 scale in the workbook
  var TOP_N = { experience: 4, strengths: 3, tools: 3 };
  var DIM_ORDER = ['interests', 'experience', 'strengths', 'tools']; // order used to explain a match
  var EPS = 1e-9;

  function clamp(n) { return Math.max(0, Math.min(100, n)); }
  function sumTop(values, n) {
    return values.slice().sort(function (a, b) { return b - a; }).slice(0, n).reduce(function (a, b) { return a + b; }, 0);
  }
  function round1(n) { return Math.round(n * 10) / 10; }

  function questionMaps(config) {
    var byId = {}; var byDim = {};
    config.questions.forEach(function (q) { byId[q.id] = q; if (q.dimension) byDim[q.dimension] = q; });
    return { byId: byId, byDim: byDim };
  }

  function pickedChoices(q, answers) {
    if (!q) return [];
    var byChoice = {};
    q.choices.forEach(function (c) { byChoice[c.id] = c; });
    return Core.selectedIds(q, answers).map(function (id) { return byChoice[id]; });
  }

  function pts(choice, pid) { return (choice.points && choice.points[pid]) || 0; }

  function dimensionScore(dim, picks, pid) {
    var values = picks.map(function (c) { return pts(c, pid); });
    if (!values.length) return 0;
    if (dim === 'interests') return clamp(values.reduce(function (a, b) { return a + b; }, 0) / (MAX_POINT * values.length) * 100);
    return clamp(sumTop(values, TOP_N[dim]) / (MAX_POINT * TOP_N[dim]) * 100);
  }

  function compare(a, b) {
    if (Math.abs(a.final - b.final) > EPS) return b.final - a.final;
    if (Math.abs(a.dimensions.interests - b.dimensions.interests) > EPS) return b.dimensions.interests - a.dimensions.interests;
    if (Math.abs(a.dimensions.experience - b.dimensions.experience) > EPS) return b.dimensions.experience - a.dimensions.experience;
    return a.order - b.order;
  }

  function scorePathways(config, answers) {
    var pw = config.pathway;
    var maps = questionMaps(config);
    var picksByDim = {};
    DIM_ORDER.forEach(function (d) { picksByDim[d] = pickedChoices(maps.byDim[d], answers); });
    var avoidPicked = pw.avoidanceQuestion && maps.byId[pw.avoidanceQuestion]
      ? Core.selectedIds(maps.byId[pw.avoidanceQuestion], answers) : [];

    var anySignal = false;
    var entries = pw.pathways.map(function (p, order) {
      var dims = {}; var weighted = 0;
      DIM_ORDER.forEach(function (d) {
        dims[d] = dimensionScore(d, picksByDim[d], p.id);
        weighted += pw.weights[d] * dims[d];
      });
      var reasons = [];
      DIM_ORDER.forEach(function (d) {
        picksByDim[d].forEach(function (c) {
          var v = pts(c, p.id);
          if (v > 0) { reasons.push({ dimension: d, text: c.text, points: v }); anySignal = true; }
        });
      });
      reasons.sort(function (a, b) { return b.points - a.points || DIM_ORDER.indexOf(a.dimension) - DIM_ORDER.indexOf(b.dimension); });
      var rule = pw.avoidance && pw.avoidance[p.id];
      var penalty = rule && avoidPicked.indexOf(rule.answer) !== -1 ? rule.points : 0;
      return {
        id: p.id, pathway: p, order: order, dimensions: dims, weighted: weighted, penalty: penalty,
        final: Math.max(0, weighted - penalty), reasons: reasons
      };
    });

    var ranking = entries.slice().sort(compare);
    ranking.forEach(function (e, i) { e.rank = i + 1; e.percent = Math.round(e.final); });

    // Which pathways did an avoidance penalty touch among the ones that would otherwise lead?
    var withoutPenalty = entries.map(function (e) {
      return { id: e.id, order: e.order, dimensions: e.dimensions, final: e.weighted };
    }).sort(compare);
    var noteable = withoutPenalty.filter(function (e) { return e.final > EPS; }).slice(0, 3).map(function (e) { return e.id; });
    var avoidanceNotes = ranking.filter(function (e) { return e.penalty > 0 && noteable.indexOf(e.id) !== -1; })
      .map(function (e) { return { pathwayId: e.id, penalty: e.penalty, rank: e.rank, inTopThree: e.rank <= 3 && e.final > EPS }; });

    var top = ranking.filter(function (e) { return e.final > EPS; }).slice(0, 3);
    return { ranking: ranking, top: top, anySignal: anySignal, avoidanceNotes: avoidanceNotes };
  }

  function readiness(config, answers) {
    var rd = config.pathway.readiness;
    var maps = questionMaps(config);
    var points = 0; var max = 0;
    Object.keys(rd.points).forEach(function (qid) {
      var table = rd.points[qid];
      max += Math.max.apply(null, Object.keys(table).map(function (k) { return table[k]; }));
      Core.selectedIds(maps.byId[qid], answers).forEach(function (id) { points += table[id] || 0; });
    });
    if (rd.tools) {
      var chosen = Core.selectedIds(maps.byId[rd.tools.question], answers).filter(function (id) { return id !== rd.tools.none; });
      var earned = 0; var best = 0;
      rd.tools.bands.forEach(function (b) { best = Math.max(best, b.points); if (chosen.length >= b.min) earned = Math.max(earned, b.points); });
      points += earned; max += best;
    }
    var labels = rd.labels.slice().sort(function (a, b) { return b.min - a.min; });
    var label = labels.filter(function (l) { return points >= l.min; })[0];
    var barrierQ = rd.barrierQuestion && maps.byId[rd.barrierQuestion];
    var barrier = barrierQ ? Core.selectedIds(barrierQ, answers)[0] || null : null;
    return { points: points, max: max, id: label.id, label: label.label, summary: label.summary || '', advice: label.advice || '', barrier: barrier };
  }

  function roadmap(config, answers) {
    var pw = config.pathway;
    var maps = questionMaps(config);
    var segment = pw.defaultSegment || 'Ready to train';
    (pw.segments || []).some(function (sg) {
      if (Core.evalCondition(sg.when, answers)) { segment = sg.name; return true; }
      return false;
    });
    var rows = pw.templates.filter(function (t) { return t.segment === segment; });
    var conditional = !!pw.conditionalWork && Core.evalCondition(pw.conditionalWork, answers);
    var conditionalRows = conditional ? pw.templates.filter(function (t) { return t.segment === (pw.conditionalSegment || 'Sponsored / conditional UK work'); }) : [];
    var addons = [];
    var cfg = pw.roadmap || {};
    (cfg.order || []).forEach(function (qid) {
      var table = cfg.addons && cfg.addons[qid];
      var q = maps.byId[qid];
      if (!table || !q) return;
      var first = Core.selectedIds(q, answers).filter(function (id) { return table[id]; })[0];
      if (first) addons.push({ question: qid, choice: first, text: table[first] });
    });
    return { segment: segment, rows: rows, conditional: conditional, conditionalRows: conditionalRows, addons: addons };
  }

  function score(config, answers) {
    var s = scorePathways(config, answers);
    var insufficient = !s.anySignal || s.top.length === 0;
    return {
      kind: 'pathway',
      insufficient: insufficient,
      ranking: s.ranking,
      top: insufficient ? [] : s.top,
      avoidanceNotes: insufficient ? [] : s.avoidanceNotes,
      readiness: readiness(config, answers),
      roadmap: roadmap(config, answers)
    };
  }

  // Fields the CRM wants besides the raw answers (workbook sheet "CRM Data Fields").
  // `config.pathway.crmMap` maps a CRM field to the question it comes from.
  function crmFields(config, answers, result) {
    var out = {};
    var maps = questionMaps(config);
    var map = config.pathway.crmMap || {};
    Object.keys(map).forEach(function (field) {
      var q = maps.byId[map[field]];
      if (!q || answers[q.id] === undefined) return;
      if (q.type === 'text') { var t = Core.textValue(q, answers); if (t) out[field] = t; return; }
      var ids = Core.selectedIds(q, answers);
      if (!ids.length) return;
      out[field] = q.type === 'single' ? ids[0] : ids;
    });
    out.top_three_pathways = result.top.map(function (e) { return e.id; });
    out.scores = {};
    result.ranking.forEach(function (e) {
      out.scores[e.id] = {
        final: round1(e.final), penalty: e.penalty,
        experience: round1(e.dimensions.experience), interests: round1(e.dimensions.interests),
        strengths: round1(e.dimensions.strengths), tools: round1(e.dimensions.tools)
      };
    });
    out.readiness_label = result.readiness.id;
    out.roadmap_segment = result.roadmap.segment;
    return out;
  }

  // Where the primary call to action points for a result (also what the CRM records as suggested_cta).
  function suggestedCta(config, result) {
    var cta = config.pathway.cta;
    var lead = result.top[0];
    if (!result.insufficient && lead && cta.bootcamps[lead.id]) {
      return { kind: 'bootcamp', pathwayId: lead.id, url: Core.safeUrl(cta.bootcamps[lead.id].url) };
    }
    return { kind: 'info-session', url: Core.safeUrl(cta.infoSession.url) };
  }

  // The body POSTed when the visitor asks for their results. Field names follow the workbook's
  // "CRM Data Fields" sheet. Marketing opt-ins are always explicit booleans (default false) and
  // consent_timestamp is only set when at least one opt-in was ticked. lead_segment is assigned
  // by the CRM/backend, not here.
  function leadPayload(config, input) {
    var result = input.result;
    var form = input.form || {};
    var emailOptIn = form.emailOptIn === true;
    var whatsappOptIn = form.whatsappOptIn === true && !!form.whatsapp;
    var payload = {
      quizId: config.id,
      lead_id: input.leadId,
      assessment_started_at: input.startedAt,
      assessment_completed_at: input.completedAt,
      full_name: form.name || '',
      email: form.email,
      email_marketing_optin: emailOptIn,
      whatsapp_marketing_optin: whatsappOptIn,
      privacy_notice_version: input.privacyNoticeVersion || '',
      answers: input.answers
    };
    if (form.whatsapp) payload.whatsapp = form.whatsapp;
    if (emailOptIn || whatsappOptIn) payload.consent_timestamp = input.now;
    var fields = crmFields(config, input.answers, result);
    Object.keys(fields).forEach(function (k) { payload[k] = fields[k]; });
    payload.suggested_cta = suggestedCta(config, result);
    payload.course_interest = (input.courseInterest || []).slice();
    payload.result = {
      kind: 'pathway',
      resultId: result.top[0] ? result.top[0].id : null,
      percent: result.top[0] ? result.top[0].percent : null,
      readiness: result.readiness.id
    };
    return payload;
  }

  Core.registerModel('pathway', score);

  return {
    score: score, scorePathways: scorePathways, readiness: readiness, roadmap: roadmap,
    crmFields: crmFields, suggestedCta: suggestedCta, leadPayload: leadPayload
  };
}));

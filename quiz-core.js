/*
 * quiz-core.js — pure logic: configuration validation, scoring, URL/email checks.
 * No DOM access, so it runs in the browser (window.QuizCore) and in Node (tests).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QuizCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var QUIZ_TYPES = ['knowledge', 'outcome', 'pathway'];
  var QUESTION_TYPES = ['single', 'multiple', 'text'];
  var CTA_TARGETS = ['new-tab', 'same-frame', 'top', 'host'];
  var models = {};   // extra scoring models, registered by e.g. pathway-scoring.js
  var THEME_KEYS = ['mode', 'ink', 'shell', 'accentText', 'accent', 'accentContrast', 'text', 'muted', 'surface', 'border', 'background', 'fontFamily', 'radius', 'maxWidth'];

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function isStr(v) { return typeof v === 'string' && v.trim() !== ''; }

  /* ---------- typeahead matching ---------- */

  function normQuery(v) { return String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

  // Ranks items ({text, aliases}) against what the visitor typed. Returns [{text, start, end, alias}],
  // best first. start/end locate the match inside `text` (for highlighting); -1 when matched via alias.
  function suggest(query, items, limit) {
    var q = normQuery(query);
    if (!q || !Array.isArray(items)) return [];
    var out = [];
    items.forEach(function (it, idx) {
      var best = null;
      [it.text].concat(it.aliases || []).forEach(function (label, i) {
        var n = normQuery(label), pos = n.indexOf(q), rank;
        if (pos === -1) return;
        if (n === q) rank = 0;
        else if (pos === 0) rank = 1;
        else if (n.charAt(pos - 1) === ' ') rank = 2;
        else rank = 3;
        rank = rank * 2 + (i === 0 ? 0 : 1);          // the real title beats an alias at equal rank
        if (!best || rank < best.rank) best = { rank: rank, alias: i > 0, pos: pos };
      });
      if (best) out.push({ text: it.text, rank: best.rank, idx: idx, alias: best.alias, pos: best.pos });
    });
    out.sort(function (a, b) { return a.rank - b.rank || a.text.length - b.text.length || a.idx - b.idx; });
    return out.slice(0, limit || 6).map(function (m) {
      var plain = normQuery(m.text) === m.text.toLowerCase() ? m.pos : -1;   // highlight only when offsets line up
      return { text: m.text, alias: m.alias, start: m.alias ? -1 : plain, end: m.alias || plain < 0 ? -1 : plain + q.length };
    });
  }

  /* ---------- URL + email helpers ---------- */

  // Returns a normalized URL string, a relative path as given, or null when unsafe.
  // Allowed: https:, http: on localhost only (development), and relative paths.
  function safeUrl(value) {
    if (typeof value !== 'string') return null;
    var v = value.trim();
    if (!v || /[\u0000-\u001f\\]/.test(v)) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(v)) {
      var u;
      try { u = new URL(v); } catch (e) { return null; }
      if (u.protocol === 'https:') return u.href;
      if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return u.href;
      return null;
    }
    if (v.indexOf('//') === 0) return null; // protocol-relative
    return v;
  }

  // An origin is scheme://host[:port] with no path. "*" is never valid.
  function isValidOrigin(value) {
    if (typeof value !== 'string') return false;
    var u;
    try { u = new URL(value); } catch (e) { return false; }
    if (u.origin !== value) return false;
    return u.protocol === 'https:' || (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'));
  }

  function isValidEmail(value) {
    return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  }

  /* ---------- Validation ---------- */

  function validateConfig(config) {
    var errors = [];
    var warnings = [];
    function err(path, msg) { errors.push(path + ': ' + msg); }

    if (!isObj(config)) return { errors: ['config: must be an object'], warnings: warnings };

    if (!isStr(config.id)) err('id', 'required non-empty string');
    if (QUIZ_TYPES.indexOf(config.type) === -1) err('type', 'must be one of ' + QUIZ_TYPES.join(', '));
    if (!isStr(config.title)) err('title', 'required non-empty string');
    if (!isStr(config.description)) err('description', 'required non-empty string');

    var outcomeIds = {};
    var isOutcome = config.type === 'outcome';
    var isKnowledge = config.type === 'knowledge';
    var isPathway = config.type === 'pathway';
    var pathwayIds = {};
    if (isPathway) {
      if (!isObj(config.pathway)) err('pathway', 'required object for pathway quizzes');
      else validatePathway(config.pathway, pathwayIds, err);
    }

    if (config.scoring !== undefined) {
      if (!isObj(config.scoring)) err('scoring', 'must be an object');
      else {
        if (config.scoring.multiple !== undefined && ['all-or-nothing', 'partial'].indexOf(config.scoring.multiple) === -1) {
          err('scoring.multiple', 'must be "all-or-nothing" or "partial"');
        }
        if (config.scoring.tieBreak !== undefined && config.scoring.tieBreak !== 'config-order') {
          err('scoring.tieBreak', 'only "config-order" is supported');
        }
      }
    }

    // Results model
    var results = config.results;
    if (!isObj(results)) {
      err('results', 'required object');
    } else if (isKnowledge) {
      if (!Array.isArray(results.bands) || !results.bands.length) {
        err('results.bands', 'knowledge quizzes need at least one result band');
      } else {
        var bandIds = {}; var mins = {}; var hasZero = false;
        results.bands.forEach(function (b, i) {
          var p = 'results.bands[' + i + ']';
          if (!isObj(b)) return err(p, 'must be an object');
          if (!isStr(b.id)) err(p + '.id', 'required non-empty string');
          else if (bandIds[b.id]) err(p + '.id', 'duplicate id "' + b.id + '"');
          else bandIds[b.id] = true;
          if (!isStr(b.title)) err(p + '.title', 'required non-empty string');
          if (!isStr(b.summary)) err(p + '.summary', 'required non-empty string');
          if (typeof b.minPercent !== 'number' || !isFinite(b.minPercent) || b.minPercent < 0 || b.minPercent > 100) {
            err(p + '.minPercent', 'must be a number from 0 to 100');
          } else {
            if (mins[b.minPercent]) err(p + '.minPercent', 'duplicate minPercent ' + b.minPercent);
            mins[b.minPercent] = true;
            if (b.minPercent === 0) hasZero = true;
          }
        });
        if (!hasZero) err('results.bands', 'one band must have minPercent 0 so every score maps to a band');
      }
    } else if (isOutcome) {
      if (!Array.isArray(results.outcomes) || !results.outcomes.length) {
        err('results.outcomes', 'outcome quizzes need at least one outcome');
      } else {
        results.outcomes.forEach(function (o, i) {
          var p = 'results.outcomes[' + i + ']';
          if (!isObj(o)) return err(p, 'must be an object');
          if (!isStr(o.id)) err(p + '.id', 'required non-empty string');
          else if (outcomeIds[o.id]) err(p + '.id', 'duplicate id "' + o.id + '"');
          else outcomeIds[o.id] = true;
          if (!isStr(o.title)) err(p + '.title', 'required non-empty string');
          if (!isStr(o.summary)) err(p + '.summary', 'required non-empty string');
        });
      }
    }

    // Questions
    if (!Array.isArray(config.questions) || !config.questions.length) {
      err('questions', 'at least one question is required');
    } else {
      var qIds = {};
      config.questions.forEach(function (q, i) {
        var p = 'questions[' + i + ']';
        if (!isObj(q)) return err(p, 'must be an object');
        if (!isStr(q.id)) err(p + '.id', 'required non-empty string');
        else if (qIds[q.id]) err(p + '.id', 'duplicate id "' + q.id + '"');
        else qIds[q.id] = true;
        if (QUESTION_TYPES.indexOf(q.type) === -1) err(p + '.type', 'must be one of ' + QUESTION_TYPES.join(', '));
        if (q.type === 'text' && !isPathway) err(p + '.type', '"text" questions are only supported in pathway quizzes (they carry no score)');
        if (q.showIf !== undefined) {
          if (!isPathway) err(p + '.showIf', 'conditional questions are only supported in pathway quizzes');
          else validateCondition(q.showIf, p + '.showIf', earlierIds(qIds, q.id), err);
        }
        if (q.suggest !== undefined && (q.type !== 'text' || !isStr(q.suggest))) err(p + '.suggest', 'must be a list name, and only applies to text questions');
        if (q.maxSelections !== undefined && (!Number.isInteger(q.maxSelections) || q.maxSelections < 1)) err(p + '.maxSelections', 'must be a positive whole number');
        if (q.maxSelections !== undefined && q.type !== 'multiple') err(p + '.maxSelections', 'only applies to multiple-choice questions');
        if (q.maxLength !== undefined && (!Number.isInteger(q.maxLength) || q.maxLength < 1 || q.maxLength > 500)) err(p + '.maxLength', 'must be a whole number from 1 to 500');
        if (!isStr(q.text)) err(p + '.text', 'required non-empty string');
        if (q.points !== undefined && (typeof q.points !== 'number' || !(q.points > 0))) err(p + '.points', 'must be a positive number');
        if (q.required !== undefined && typeof q.required !== 'boolean') err(p + '.required', 'must be true or false');

        if (q.type === 'text') {
          if (q.choices !== undefined) err(p + '.choices', 'text questions have no choices');
          return;
        }
        if (!Array.isArray(q.choices) || q.choices.length < 2) {
          return err(p + '.choices', 'at least two choices are required');
        }
        var cIds = {}; var correct = 0; var anyPoints = false;
        q.choices.forEach(function (c, j) {
          var cp = p + '.choices[' + j + ']';
          if (!isObj(c)) return err(cp, 'must be an object');
          if (!isStr(c.id)) err(cp + '.id', 'required non-empty string');
          else if (cIds[c.id]) err(cp + '.id', 'duplicate id "' + c.id + '"');
          else cIds[c.id] = true;
          if (!isStr(c.text)) err(cp + '.text', 'required non-empty string');
          if (c.correct === true) correct++;
          if (c.correct !== undefined && typeof c.correct !== 'boolean') err(cp + '.correct', 'must be true or false');
          if (c.points !== undefined) {
            if (!isObj(c.points)) err(cp + '.points', 'must be an object mapping outcome id to number');
            else Object.keys(c.points).forEach(function (oid) {
              if (isOutcome && !outcomeIds[oid]) err(cp + '.points.' + oid, 'unknown outcome id');
              if (isPathway && !pathwayIds[oid]) err(cp + '.points.' + oid, 'unknown pathway id');
              if (typeof c.points[oid] !== 'number' || !isFinite(c.points[oid])) err(cp + '.points.' + oid, 'must be a finite number');
              anyPoints = true;
            });
          }
        });
        if (isKnowledge) {
          if (q.type === 'single' && correct !== 1) err(p + '.choices', 'single-choice question needs exactly one choice with correct: true (found ' + correct + ')');
          if (q.type === 'multiple' && correct < 1) err(p + '.choices', 'multiple-choice question needs at least one choice with correct: true');
          if (!isStr(q.explanation)) warnings.push(p + '.explanation: missing; the results review will have no explanation for this question');
        }
        if (isOutcome && !anyPoints) err(p + '.choices', 'no choice awards points to any outcome');
        if (q.exclusive !== undefined) {
          if (!Array.isArray(q.exclusive) || !q.exclusive.length) err(p + '.exclusive', 'must be a non-empty array of choice ids');
          else q.exclusive.forEach(function (id) { if (!cIds[id]) err(p + '.exclusive', 'unknown choice id "' + id + '"'); });
        }
        if (q.maxSelections !== undefined && q.maxSelections > q.choices.length) err(p + '.maxSelections', 'is larger than the number of choices');
        if (q.prefill !== undefined) {
          if (!isObj(q.prefill) || !Array.isArray(q.prefill.value)) err(p + '.prefill', 'must be { when?, value: [choice ids] }');
          else q.prefill.value.forEach(function (id) { if (!cIds[id]) err(p + '.prefill.value', 'unknown choice id "' + id + '"'); });
        }
      });
      if (isPathway) validatePathwayWiring(config, err);
      if (isPathway && Array.isArray(config.stages)) validateStages(config.stages, config.questions, err);
      else if (config.stages !== undefined && !Array.isArray(config.stages)) err('stages', 'must be an array');
    }

    // CTA
    if (config.cta !== undefined) {
      if (!isObj(config.cta)) err('cta', 'must be an object');
      else {
        if (!isStr(config.cta.label)) err('cta.label', 'required non-empty string');
        if (safeUrl(config.cta.url) === null) err('cta.url', 'must be an https:// URL or a relative path');
        if (config.cta.target !== undefined && CTA_TARGETS.indexOf(config.cta.target) === -1) {
          err('cta.target', 'must be one of ' + CTA_TARGETS.join(', '));
        }
      }
    }

    // Lead capture
    var lc = config.leadCapture;
    if (lc !== undefined) {
      if (!isObj(lc)) err('leadCapture', 'must be an object');
      else {
        if (lc.endpoint !== undefined && safeUrl(lc.endpoint) === null) err('leadCapture.endpoint', 'must be an https:// URL or a relative path');
        if (lc.consent !== undefined && (!isObj(lc.consent) || !isStr(lc.consent.text))) err('leadCapture.consent.text', 'required when consent is set');
        if (lc.optIns !== undefined) {
          if (!isObj(lc.optIns)) err('leadCapture.optIns', 'must be an object');
          else ['email', 'whatsapp'].forEach(function (k) {
            if (lc.optIns[k] !== undefined && (!isObj(lc.optIns[k]) || !isStr(lc.optIns[k].text))) err('leadCapture.optIns.' + k + '.text', 'required when the opt-in is set');
          });
        }
        if (lc.privacyNotice !== undefined) {
          if (!isObj(lc.privacyNotice) || !isStr(lc.privacyNotice.text)) err('leadCapture.privacyNotice.text', 'required when privacyNotice is set');
          else if (lc.privacyNotice.url !== undefined && safeUrl(lc.privacyNotice.url) === null) err('leadCapture.privacyNotice.url', 'must be an https:// URL or a relative path');
        }
      }
    }

    // Integration
    if (config.integration !== undefined) {
      if (!isObj(config.integration)) err('integration', 'must be an object');
      else if (config.integration.allowedParentOrigins !== undefined) {
        if (!Array.isArray(config.integration.allowedParentOrigins)) err('integration.allowedParentOrigins', 'must be an array of origins');
        else config.integration.allowedParentOrigins.forEach(function (o, i) {
          if (!isValidOrigin(o)) err('integration.allowedParentOrigins[' + i + ']', '"' + o + '" is not a valid origin (e.g. https://www.example.com, no path, no "*")');
        });
      }
    }

    // Intro (optional copy)
    if (config.intro !== undefined) {
      if (!isObj(config.intro)) err('intro', 'must be an object');
      else {
        if (config.intro.note !== undefined && !isStr(config.intro.note)) err('intro.note', 'must be a non-empty string');
        if (config.intro.bullets !== undefined && (!Array.isArray(config.intro.bullets) || !config.intro.bullets.every(isStr))) err('intro.bullets', 'must be an array of non-empty strings');
      }
    }

    // Navigation + theme
    if (config.navigation !== undefined) {
      if (!isObj(config.navigation)) err('navigation', 'must be an object');
      else if (config.navigation.allowBack !== undefined && typeof config.navigation.allowBack !== 'boolean') err('navigation.allowBack', 'must be true or false');
      if (isObj(config.navigation) && config.navigation.autoAdvance !== undefined && typeof config.navigation.autoAdvance !== 'boolean') err('navigation.autoAdvance', 'must be true or false');
    }
    if (config.theme !== undefined) {
      if (!isObj(config.theme)) err('theme', 'must be an object');
      else Object.keys(config.theme).forEach(function (k) {
        if (THEME_KEYS.indexOf(k) === -1) err('theme.' + k, 'unknown theme key (allowed: ' + THEME_KEYS.join(', ') + ')');
        else if (typeof config.theme[k] !== 'string') err('theme.' + k, 'must be a string');
        else if (k === 'mode' && ['light', 'dark', 'auto'].indexOf(config.theme[k]) === -1) err('theme.mode', 'must be "light", "dark" or "auto"');
        else if (k !== 'mode' && /[;{}<>]|url\(|expression\(/i.test(config.theme[k])) err('theme.' + k, 'contains characters that are not allowed in a theme value');
      });
    }

    return { errors: errors, warnings: warnings };
  }


  /* ---------- Pathway-quiz validation helpers ---------- */

  function earlierIds(ids, selfId) {
    var out = {};
    Object.keys(ids).forEach(function (k) { if (k !== selfId) out[k] = true; });
    return out;
  }

  // A condition is { q, in: [choice ids] } or { any: [cond…] } / { all: [cond…] }.
  // It may only refer to questions that come earlier in the list, so visibility can be
  // resolved in a single pass.
  function validateCondition(cond, path, known, err) {
    if (!isObj(cond)) return err(path, 'must be an object');
    if (cond.any !== undefined || cond.all !== undefined) {
      var list = cond.any !== undefined ? cond.any : cond.all;
      if (!Array.isArray(list) || !list.length) return err(path, '"any"/"all" need a non-empty array of conditions');
      list.forEach(function (c, i) { validateCondition(c, path + '[' + i + ']', known, err); });
      return;
    }
    if (!isStr(cond.q)) return err(path + '.q', 'required question id');
    if (!known[cond.q]) err(path + '.q', '"' + cond.q + '" must be a question that comes earlier in the list');
    if (!Array.isArray(cond.in) || !cond.in.length || !cond.in.every(isStr)) err(path + '.in', 'must be a non-empty array of choice ids');
  }

  function validateStages(stages, questions, err) {
    var seen = {}; var ids = {};
    questions.forEach(function (q) { if (q && q.id) ids[q.id] = true; });
    stages.forEach(function (s, i) {
      var p = 'stages[' + i + ']';
      if (!isObj(s)) return err(p, 'must be an object');
      if (!isStr(s.id)) err(p + '.id', 'required non-empty string');
      if (!isStr(s.title)) err(p + '.title', 'required non-empty string');
      if (!Array.isArray(s.questions) || !s.questions.length) return err(p + '.questions', 'required non-empty array of question ids');
      s.questions.forEach(function (id) {
        if (!ids[id]) err(p + '.questions', 'unknown question id "' + id + '"');
        else if (seen[id]) err(p + '.questions', 'question "' + id + '" is in more than one stage');
        seen[id] = true;
      });
    });
    questions.forEach(function (q) { if (q && q.id && !seen[q.id]) err('stages', 'question "' + q.id + '" is not in any stage'); });
  }

  var DIMENSIONS = ['experience', 'interests', 'strengths', 'tools'];

  function validatePathway(pw, pathwayIds, err) {
    if (!Array.isArray(pw.pathways) || !pw.pathways.length) err('pathway.pathways', 'at least one pathway is required');
    else pw.pathways.forEach(function (x, i) {
      var p = 'pathway.pathways[' + i + ']';
      if (!isObj(x)) return err(p, 'must be an object');
      if (!isStr(x.id)) err(p + '.id', 'required non-empty string');
      else if (pathwayIds[x.id]) err(p + '.id', 'duplicate id "' + x.id + '"');
      else pathwayIds[x.id] = true;
      if (!isStr(x.name)) err(p + '.name', 'required non-empty string');
      ['skillGaps', 'starterRoles', 'progressionRoles'].forEach(function (k) {
        if (!Array.isArray(x[k]) || !x[k].every(isStr)) err(p + '.' + k, 'must be an array of strings');
      });
    });

    if (!isObj(pw.weights)) err('pathway.weights', 'required object');
    else {
      var sum = 0;
      DIMENSIONS.forEach(function (d) {
        if (typeof pw.weights[d] !== 'number' || pw.weights[d] < 0) err('pathway.weights.' + d, 'must be a non-negative number');
        else sum += pw.weights[d];
      });
      if (Math.abs(sum - 1) > 1e-9) err('pathway.weights', 'must add up to 1 (found ' + sum + ')');
    }

    if (pw.avoidance !== undefined) {
      if (!isObj(pw.avoidance)) err('pathway.avoidance', 'must be an object');
      else Object.keys(pw.avoidance).forEach(function (pid) {
        var a = pw.avoidance[pid];
        if (!pathwayIds[pid]) err('pathway.avoidance.' + pid, 'unknown pathway id');
        if (!isObj(a) || !isStr(a.answer) || typeof a.points !== 'number') err('pathway.avoidance.' + pid, 'must be { answer, points }');
      });
    }

    if (!Array.isArray(pw.templates) || !pw.templates.length) err('pathway.templates', 'at least one roadmap template row is required');
    else pw.templates.forEach(function (t, i) {
      if (!isObj(t) || !isStr(t.segment) || !isStr(t.period) || !isStr(t.action)) err('pathway.templates[' + i + ']', 'must have segment, period and action');
    });

    var rd = pw.readiness;
    if (!isObj(rd)) err('pathway.readiness', 'required object');
    else {
      if (!isObj(rd.points)) err('pathway.readiness.points', 'required object: question id -> choice id -> points');
      if (!Array.isArray(rd.labels) || !rd.labels.length) err('pathway.readiness.labels', 'required non-empty array');
      else {
        var zero = 0;
        rd.labels.forEach(function (l, i) {
          if (!isObj(l) || !isStr(l.id) || !isStr(l.label) || typeof l.min !== 'number') err('pathway.readiness.labels[' + i + ']', 'must have id, label and numeric min');
          else if (l.min === 0) zero++;
        });
        if (zero !== 1) err('pathway.readiness.labels', 'exactly one label must have min 0');
      }
    }

    var cta = pw.cta;
    if (!isObj(cta)) err('pathway.cta', 'required object');
    else {
      if (cta.target !== undefined && CTA_TARGETS.indexOf(cta.target) === -1) err('pathway.cta.target', 'must be one of ' + CTA_TARGETS.join(', '));
      if (!isObj(cta.bootcamps)) err('pathway.cta.bootcamps', 'required object: pathway id -> { url }');
      else Object.keys(pathwayIds).forEach(function (pid) {
        var b = cta.bootcamps[pid];
        if (!isObj(b) || safeUrl(b.url) === null) err('pathway.cta.bootcamps.' + pid + '.url', 'required https:// URL or relative path');
      });
      if (!isObj(cta.infoSession) || !isStr(cta.infoSession.label) || safeUrl(cta.infoSession.url) === null) err('pathway.cta.infoSession', 'required { label, url } with an https:// URL or relative path');
    }
  }

  // Cross-checks between the questions and the pathway block.
  function validatePathwayWiring(config, err) {
    if (!Array.isArray(config.questions)) return;
    DIMENSIONS.forEach(function (d) {
      var qs = config.questions.filter(function (q) { return q && q.dimension === d; });
      if (qs.length !== 1) err('questions', 'exactly one question must have dimension "' + d + '" (found ' + qs.length + ')');
    });
    config.questions.forEach(function (q, i) {
      if (q && q.dimension !== undefined && DIMENSIONS.indexOf(q.dimension) === -1) err('questions[' + i + '].dimension', 'must be one of ' + DIMENSIONS.join(', '));
    });
    var pw = config.pathway;
    if (!isObj(pw)) return;
    var byId = {};
    config.questions.forEach(function (q) { if (q && q.id) byId[q.id] = q; });
    var choiceIds = function (qid) { var m = {}; ((byId[qid] && byId[qid].choices) || []).forEach(function (c) { m[c.id] = true; }); return m; };
    if (isObj(pw.avoidance)) {
      var q12 = pw.avoidanceQuestion;
      if (!isStr(q12) || !byId[q12]) err('pathway.avoidanceQuestion', 'required id of the question that holds the avoidance answers');
      else Object.keys(pw.avoidance).forEach(function (pid) {
        if (pw.avoidance[pid] && !choiceIds(q12)[pw.avoidance[pid].answer]) err('pathway.avoidance.' + pid + '.answer', 'is not a choice of ' + q12);
      });
    }
    if (isObj(pw.readiness) && isObj(pw.readiness.points)) {
      Object.keys(pw.readiness.points).forEach(function (qid) {
        if (!byId[qid]) return err('pathway.readiness.points.' + qid, 'unknown question id');
        var ids = choiceIds(qid);
        Object.keys(pw.readiness.points[qid]).forEach(function (cid) {
          if (!ids[cid]) err('pathway.readiness.points.' + qid + '.' + cid, 'is not a choice of ' + qid);
        });
      });
    }
    var known = {}; Object.keys(byId).forEach(function (k) { known[k] = true; });
    if (Array.isArray(pw.segments)) pw.segments.forEach(function (sg, i) {
      if (!isObj(sg) || !isStr(sg.name)) return err('pathway.segments[' + i + ']', 'must have a name and a when condition');
      validateCondition(sg.when, 'pathway.segments[' + i + '].when', known, err);
    });
    if (pw.conditionalWork !== undefined) validateCondition(pw.conditionalWork, 'pathway.conditionalWork', known, err);
  }

  /* ---------- Answers + scoring ---------- */

  // Selected choice ids for a question, ignoring ids that are not real choices.
  function selectedIds(q, answers) {
    if (!q.choices) return [];
    var raw = answers && Array.isArray(answers[q.id]) ? answers[q.id] : [];
    var valid = {};
    q.choices.forEach(function (c) { valid[c.id] = true; });
    var seen = {};
    return raw.filter(function (id) {
      if (!valid[id] || seen[id]) return false;
      seen[id] = true;
      return true;
    });
  }

  // Value of a short-text question ('' when empty).
  function textValue(q, answers) {
    var v = answers && answers[q.id];
    return typeof v === 'string' ? v.trim() : '';
  }

  function isAnswered(q, answers) {
    return q.type === 'text' ? textValue(q, answers).length > 0 : selectedIds(q, answers).length > 0;
  }

  // True when an exclusive answer (e.g. "None of these") is selected together with another one.
  function exclusiveConflict(q, sel) {
    return Array.isArray(q.exclusive) && sel.length > 1 && sel.some(function (id) { return q.exclusive.indexOf(id) !== -1; });
  }

  function canAdvance(q, answers) {
    if (q.type === 'text') {
      var t = textValue(q, answers);
      return t.length <= (q.maxLength || 500) && (q.required === false || t.length > 0);
    }
    var sel = selectedIds(q, answers);
    if (q.maxSelections && sel.length > q.maxSelections) return false;
    if (exclusiveConflict(q, sel)) return false;
    return q.required === false || sel.length > 0;
  }

  /* ---------- Conditional questions ---------- */

  function evalCondition(cond, answers) {
    if (!cond) return true;
    if (cond.any) return cond.any.some(function (c) { return evalCondition(c, answers); });
    if (cond.all) return cond.all.every(function (c) { return evalCondition(c, answers); });
    var v = answers && answers[cond.q];
    return Array.isArray(v) && v.some(function (id) { return cond.in.indexOf(id) !== -1; });
  }

  // Visible questions, in order, and the answers that still count. A question's condition
  // is checked against the answers of questions that are themselves visible, so changing
  // an early answer cannot leave a stale answer driving a later question.
  function resolve(config, answers) {
    var visible = []; var kept = {};
    config.questions.forEach(function (q) {
      if (!evalCondition(q.showIf, kept)) return;
      visible.push(q);
      if (answers && answers[q.id] !== undefined) kept[q.id] = answers[q.id];
    });
    return { visible: visible, answers: kept };
  }

  function isVisible(q, answers) { return evalCondition(q.showIf, answers); }

  function unique(arr) { return arr.filter(function (v, i) { return arr.indexOf(v) === i; }); }

  function scoreKnowledge(config, answers) {
    var partial = config.scoring && config.scoring.multiple === 'partial';
    var earned = 0, total = 0, correctCount = 0;
    var items = config.questions.map(function (q) {
      var weight = typeof q.points === 'number' ? q.points : 1;
      var selected = selectedIds(q, answers);
      var correctIds = q.choices.filter(function (c) { return c.correct === true; }).map(function (c) { return c.id; });
      var hits = selected.filter(function (id) { return correctIds.indexOf(id) !== -1; }).length;
      var wrong = selected.length - hits;
      var fraction = 0;
      if (selected.length) {
        if (q.type === 'single') fraction = (hits === 1 && wrong === 0) ? 1 : 0;
        else if (partial) fraction = Math.max(0, (hits - wrong) / correctIds.length);
        else fraction = (hits === correctIds.length && wrong === 0) ? 1 : 0;
      }
      var status = !selected.length ? 'unanswered' : fraction === 1 ? 'correct' : fraction === 0 ? 'incorrect' : 'partial';
      earned += weight * fraction;
      total += weight;
      if (status === 'correct') correctCount++;
      return { question: q, selected: selected, correctIds: correctIds, fraction: fraction, weight: weight, status: status };
    });

    var percent = total > 0 ? (earned / total) * 100 : 0;
    var bands = config.results.bands.slice().sort(function (a, b) { return b.minPercent - a.minPercent; });
    var band = bands.filter(function (b) { return percent >= b.minPercent; })[0];

    var revisit = unique(items.filter(function (i) { return i.status !== 'correct' && i.question.topic; }).map(function (i) { return i.question.topic; }));
    var strong = unique(items.filter(function (i) { return i.status === 'correct' && i.question.topic; }).map(function (i) { return i.question.topic; }))
      .filter(function (t) { return revisit.indexOf(t) === -1; });

    return {
      kind: 'knowledge', earned: earned, total: total, percent: percent, correctCount: correctCount,
      band: band, items: items, revisitTopics: revisit, strongTopics: strong
    };
  }

  function scoreOutcome(config, answers) {
    var outcomes = config.results.outcomes;
    var totals = {};
    outcomes.forEach(function (o) { totals[o.id] = 0; });
    config.questions.forEach(function (q) {
      var sel = selectedIds(q, answers);
      q.choices.forEach(function (c) {
        if (sel.indexOf(c.id) === -1 || !c.points) return;
        Object.keys(c.points).forEach(function (oid) {
          if (oid in totals) totals[oid] += c.points[oid];
        });
      });
    });
    var sum = 0;
    outcomes.forEach(function (o) { sum += Math.max(0, totals[o.id]); });
    // Stable sort by points desc; ties keep configuration order (documented tie-break).
    var ranking = outcomes.map(function (o, i) {
      return { outcome: o, points: totals[o.id], index: i, share: sum > 0 ? (Math.max(0, totals[o.id]) / sum) * 100 : 0 };
    }).sort(function (a, b) { return b.points - a.points || a.index - b.index; });

    var top = ranking[0];
    // With no positive points at all there is nothing to base an outcome on.
    if (!top || top.points <= 0) {
      return { kind: 'outcome', outcome: null, tiedWith: [], ranking: ranking, totalPoints: sum };
    }
    var tiedWith = ranking.slice(1).filter(function (r) { return r.points === top.points; }).map(function (r) { return r.outcome; });
    return { kind: 'outcome', outcome: top.outcome, tiedWith: tiedWith, ranking: ranking, totalPoints: sum };
  }

  // Extra scoring models plug in here (see pathway-scoring.js).
  function registerModel(type, fn) { models[type] = fn; }

  function score(config, answers) {
    var kept = config.questions.some(function (q) { return q.showIf; }) ? resolve(config, answers).answers : answers;
    if (models[config.type]) return models[config.type](config, kept);
    return config.type === 'outcome' ? scoreOutcome(config, kept) : scoreKnowledge(config, kept);
  }

  return {
    validateConfig: validateConfig, score: score, scoreKnowledge: scoreKnowledge, scoreOutcome: scoreOutcome,
    selectedIds: selectedIds, textValue: textValue, isAnswered: isAnswered, canAdvance: canAdvance,
    resolve: resolve, isVisible: isVisible, evalCondition: evalCondition, registerModel: registerModel,
    safeUrl: safeUrl, isValidOrigin: isValidOrigin, isValidEmail: isValidEmail, suggest: suggest, THEME_KEYS: THEME_KEYS
  };
}));

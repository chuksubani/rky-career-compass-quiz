/*
 * quiz-engine.js — renders the quiz UI, manages state, handles lead capture and
 * the optional iframe messaging. Content lives in quiz-config.js; pure scoring and
 * validation live in quiz-core.js. All text is inserted with textContent (no innerHTML).
 *
 * Public API:  QuizWidget.mount(element, config, { onLeadSubmit, onEvent }) -> { restart, destroy }
 *
 * Result screens for extra quiz types are provided by renderers registered on
 * window.QuizWidgetRenderers[type] (see quiz-results-pathway.js); load them before this file.
 */
(function (global) {
  'use strict';

  var Core = global.QuizCore;
  var NS = 'quiz-widget';           // message namespace for postMessage + CustomEvent detail
  var MSG_VERSION = 1;
  var instances = new WeakMap();    // element -> running instance (prevents duplicate mounts)
  var uidCounter = 0;

  /* ---------- tiny DOM helpers ---------- */

  function appendKids(el, kids) {
    kids.forEach(function (k) {
      if (k === null || k === undefined || k === false) return;
      if (Array.isArray(k)) appendKids(el, k);
      else el.appendChild(typeof k === 'object' ? k : document.createTextNode(String(k)));
    });
  }

  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : String(v));
      });
    }
    appendKids(el, Array.prototype.slice.call(arguments, 2));
    return el;
  }

  // Text with `inline code` segments. Still pure text nodes, never HTML.
  function rich(str) {
    var frag = document.createDocumentFragment();
    String(str).split('`').forEach(function (part, i) {
      if (!part) return;
      frag.appendChild(i % 2 ? h('code', { class: 'qz-inline-code', text: part }) : document.createTextNode(part));
    });
    return frag;
  }

  // Typeahead. The field's text is always the answer; suggestions only help.
  function attachSuggest(field, wrap, pool, id, onPick) {
    var listId = id + '-suggest', statusId = id + '-suggest-status';
    var list = h('ul', { class: 'qz-suggest', id: listId, role: 'listbox', hidden: true });
    var status = h('div', { class: 'qz-sr', id: statusId, 'aria-live': 'polite' });
    var matches = [], active = -1, typed = '';
    field.setAttribute('role', 'combobox');
    field.setAttribute('aria-autocomplete', 'list');
    field.setAttribute('aria-expanded', 'false');
    field.setAttribute('aria-controls', listId);
    wrap.classList.add('qz-suggest-wrap');
    wrap.appendChild(list);
    wrap.appendChild(status);

    function close() {
      list.hidden = true; active = -1;
      field.setAttribute('aria-expanded', 'false');
      field.removeAttribute('aria-activedescendant');
    }
    function setActive(i) {
      active = i;
      Array.prototype.forEach.call(list.children, function (li, n) {
        var on = n === i;
        li.classList.toggle('is-active', on);
        li.setAttribute('aria-selected', on ? 'true' : 'false');
        if (on) { field.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); }
      });
      if (i < 0) field.removeAttribute('aria-activedescendant');
    }
    function pick(i) {
      var m = matches[i];
      if (!m) return;
      field.value = m.text.slice(0, Number(field.getAttribute('maxlength')) || m.text.length);
      onPick(field.value);
      close();
    }
    function render() {
      typed = field.value;
      matches = Core.suggest(typed, pool, 6);
      while (list.firstChild) list.removeChild(list.firstChild);
      if (!typed.trim()) { close(); status.textContent = ''; return; }
      if (!matches.length) {
        list.appendChild(h('li', { class: 'qz-suggest-empty', role: 'presentation', text: 'No match. Your own wording is fine.' }));
        status.textContent = 'No suggestions. You can keep what you typed.';
      } else {
        matches.forEach(function (m, i) {
          var label = m.start >= 0
            ? [m.text.slice(0, m.start), h('strong', { text: m.text.slice(m.start, m.end) }), m.text.slice(m.end)]
            : [m.text];
          var li = h('li', { class: 'qz-suggest-opt', role: 'option', id: id + '-opt-' + i, 'aria-selected': 'false' }, label);
          // mousedown: fires before the input's blur closes the list.
          li.addEventListener('mousedown', function (e) { e.preventDefault(); pick(i); });
          list.appendChild(li);
        });
        status.textContent = plural(matches.length, 'suggestion', 'suggestions') + ' available. Use up and down arrows, Enter to choose.';
      }
      list.hidden = false;
      field.setAttribute('aria-expanded', 'true');
      active = -1;
    }
    field.addEventListener('input', render);
    field.addEventListener('blur', close);
    field.addEventListener('keydown', function (e) {
      var open = !list.hidden && matches.length > 0;
      if (e.key === 'ArrowDown') {
        if (list.hidden) render();
        if (matches.length) { setActive((active + 1) % matches.length); e.preventDefault(); }
      } else if (e.key === 'ArrowUp' && open) {
        setActive((active - 1 + matches.length) % matches.length); e.preventDefault();
      } else if (e.key === 'Enter' && open && active >= 0) {
        e.preventDefault(); pick(active);
      } else if (e.key === 'Escape' && !list.hidden) {
        close(); e.preventDefault(); e.stopPropagation();
      }
    });
  }

  function fmt(n) { return String(Math.round(n * 10) / 10); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* ---------- theme ---------- */

  var THEME_VARS = {
    accent: '--qz-accent', accentContrast: '--qz-on-accent', text: '--qz-text', muted: '--qz-muted',
    surface: '--qz-surface', border: '--qz-border', background: '--qz-bg', fontFamily: '--qz-font',
    radius: '--qz-radius', maxWidth: '--qz-max', ink: '--qz-ink', shell: '--qz-shell', accentText: '--qz-accent-text'
  };

  function applyTheme(rootEl, theme) {
    theme = theme || {};
    var mode = theme.mode === 'dark' || theme.mode === 'auto' ? theme.mode : 'light';
    // A host can pick the mode per iframe: .../index.html?mode=dark (only these three values are accepted)
    try {
      var q = new URLSearchParams(global.location.search).get('mode');
      if (q === 'light' || q === 'dark' || q === 'auto') mode = q;
    } catch (e) { /* ignore */ }
    rootEl.setAttribute('data-theme', mode);
    Object.keys(THEME_VARS).forEach(function (k) {
      if (typeof theme[k] === 'string') rootEl.style.setProperty(THEME_VARS[k], theme[k]);
    });
  }

  /* ---------- mount ---------- */

  function mount(rootEl, config, options) {
    if (!rootEl || rootEl.nodeType !== 1) throw new Error('QuizWidget.mount: first argument must be an element');
    var prev = instances.get(rootEl);
    if (prev) prev.destroy();
    var inst = create(rootEl, config, options || {});
    instances.set(rootEl, inst);
    return inst;
  }

  function create(rootEl, cfg, options) {
    var uid = 'qz' + (++uidCounter);
    var destroyed = false;
    var cleanups = [];

    rootEl.textContent = '';
    rootEl.classList.add('qz');
    var inFrame = global.parent !== global;
    if (inFrame) rootEl.classList.add('qz-embedded');

    if (!Core) return fail(['quiz-core.js did not load. Check that it is included before quiz-engine.js.']);
    var check = Core.validateConfig(cfg);
    if (check.errors.length) return fail(check.errors);
    check.warnings.forEach(function (w) { console.warn('[quiz-widget] ' + w); });

    applyTheme(rootEl, cfg.theme);

    var live = h('div', { class: 'qz-sr', 'aria-live': 'polite', 'aria-atomic': 'true' });
    var stage = h('div', { class: 'qz-stage' });
    rootEl.appendChild(live);
    rootEl.appendChild(stage);

    var allowBack = !(cfg.navigation && cfg.navigation.allowBack === false);
    var autoAdvance = !!(cfg.navigation && cfg.navigation.autoAdvance);
    var advanceTimer = null;
    var reduceMotion = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var state = freshState();
    var userMoved = false; // only move focus after the visitor has interacted
    var renderers = global.QuizWidgetRenderers || {};
    var customResults = renderers[cfg.type] || null;
    if (cfg.type === 'pathway' && !global.PathwayScoring) return fail(['pathway-scoring.js did not load. Check that it is included before quiz-engine.js.']);
    if (cfg.type === 'pathway' && !customResults) return fail(['quiz-results-pathway.js did not load. Check that it is included before quiz-engine.js.']);

    function freshState() {
      return { phase: 'intro', index: 0, answers: {}, result: null, direction: 'forward', startedAt: null, completedAt: null, leadId: null, courseInterest: [], name: '' };
    }
    var nameStep = cfg.nameStep && cfg.nameStep.enabled ? cfg.nameStep : null;

    // Questions the visitor will actually see, given the answers so far. Conditions only look
    // backwards, so the position of the current question never shifts while it is on screen.
    function visibleQuestions() { return Core.resolve(cfg, state.answers).visible; }
    function newLeadId() {
      try { if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID(); } catch (e) { /* fall through */ }
      var bytes = [];
      for (var i = 0; i < 16; i++) bytes.push(Math.floor(Math.random() * 256));
      bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
      var hex = bytes.map(function (b) { return (b + 0x100).toString(16).slice(1); }).join('');
      return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
    }
    function beginAttempt() { state.startedAt = new Date().toISOString(); state.leadId = newLeadId(); lastAnnouncedStage = null; }

    /* ----- lead capture availability (never pretend to submit) ----- */
    var lc = cfg.leadCapture && cfg.leadCapture.enabled ? cfg.leadCapture : null;
    var leadSubmitter = null;
    if (lc) {
      if (typeof options.onLeadSubmit === 'function') leadSubmitter = options.onLeadSubmit;
      else if (lc.endpoint) leadSubmitter = function (payload) { return postJson(lc.endpoint, payload); };
      else console.warn('[quiz-widget] leadCapture.enabled is true but no endpoint or onLeadSubmit handler is configured, so the form is hidden. See README → Lead capture.');
    }

    /* ----- events + iframe messaging ----- */
    var allowedOrigins = ((cfg.integration && cfg.integration.allowedParentOrigins) || []).slice();
    if (global.location && global.location.origin && global.location.origin !== 'null' && allowedOrigins.indexOf(global.location.origin) === -1) {
      allowedOrigins.push(global.location.origin);
    }

    function parentOriginHint() {
      try {
        if (global.location.ancestorOrigins && global.location.ancestorOrigins.length) return global.location.ancestorOrigins[0];
        if (document.referrer) return new URL(document.referrer).origin;
      } catch (e) { /* unknown */ }
      return null;
    }

    function emit(type, payload) {
      var detail = { source: NS, version: MSG_VERSION, type: type, quizId: cfg.id, payload: payload || {} };
      try { rootEl.dispatchEvent(new CustomEvent('quiz-widget:event', { detail: detail, bubbles: true })); } catch (e) { /* ignore */ }
      if (typeof options.onEvent === 'function') {
        try { options.onEvent(detail); } catch (e) { console.error('[quiz-widget] onEvent handler threw', e); }
      }
      if (!inFrame) return;
      // Post only to explicitly allowed origins, never "*". If the real parent origin is
      // known, target only that one (and only if it is allowed).
      var hint = parentOriginHint();
      var targets = hint ? allowedOrigins.filter(function (o) { return o === hint; }) : allowedOrigins;
      targets.forEach(function (origin) {
        try { global.parent.postMessage(detail, origin); } catch (e) { /* target mismatch is silently ignored */ }
      });
    }

    var lastHeight = 0;
    var heightQueued = false;
    function reportHeight(force) {
      if (!inFrame || destroyed) return;
      var height = Math.ceil(rootEl.getBoundingClientRect().height);
      if (!force && Math.abs(height - lastHeight) < 1) return;
      lastHeight = height;
      emit('quiz:height', { height: height });
    }
    function queueHeight() {
      if (heightQueued) return;
      heightQueued = true;
      requestAnimationFrame(function () { heightQueued = false; reportHeight(false); });
    }

    if (inFrame) {
      if (typeof ResizeObserver === 'function') {
        var ro = new ResizeObserver(queueHeight);
        ro.observe(rootEl);
        cleanups.push(function () { ro.disconnect(); });
      } else {
        global.addEventListener('resize', queueHeight);
        cleanups.push(function () { global.removeEventListener('resize', queueHeight); });
      }
      // Host may ask for the current height (e.g. its listener attached after we loaded).
      var onMessage = function (e) {
        if (e.source !== global.parent || allowedOrigins.indexOf(e.origin) === -1) return;
        var d = e.data;
        if (!d || typeof d !== 'object' || d.source !== NS || d.type !== 'quiz:request-height') return;
        reportHeight(true);
      };
      global.addEventListener('message', onMessage);
      cleanups.push(function () { global.removeEventListener('message', onMessage); });
    }

    /* ----- navigation ----- */

    function go(phase, extra) {
      clearTimeout(advanceTimer);
      var prevPhase = state.phase;
      state.phase = phase;
      if (extra) Object.keys(extra).forEach(function (k) { state[k] = extra[k]; });
      render(prevPhase === 'question' && phase === 'question');
    }

    function start() {
      userMoved = true;
      beginAttempt();
      emit('quiz:started', {});
      go('question', { index: 0, direction: 'forward' });
    }

    function next() {
      var vis = visibleQuestions();
      var q = vis[state.index];
      if (!Core.canAdvance(q, state.answers)) return; // never move past a required question
      if (state.index < vis.length - 1) return go('question', { index: state.index + 1, direction: 'forward' });
      if (state.phase !== 'question') return; // already finished: ignore duplicate submits
      if (nameStep) return go('name', { direction: 'forward' });
      finish();
    }

    function finish() {
      if (state.phase === 'results' || state.phase === 'matching') return;
      state.result = Core.score(cfg, state.answers);
      state.completedAt = new Date().toISOString();
      emit('quiz:completed', resultSummary(state.result));
      if (cfg.type !== 'pathway' || reduceMotion) return go('results');
      go('matching');
      var t = setTimeout(function () { if (!destroyed && state.phase === 'matching') go('results'); }, 1100);
      cleanups.push(function () { clearTimeout(t); });
    }

    function back() {
      if (!allowBack || state.index === 0) return;
      go('question', { index: state.index - 1, direction: 'back' });
    }

    function restart() {
      userMoved = true;
      state = freshState();
      beginAttempt();
      emit('quiz:started', { retry: true });
      go('question', { index: 0, direction: 'forward' });
    }

    function resultSummary(r) {
      if (r.kind === 'pathway') {
        var lead = r.top[0];
        return { kind: 'pathway', resultId: lead ? lead.id : null, percent: lead ? lead.percent : null, readiness: r.readiness.id };
      }
      if (r.kind === 'knowledge') {
        return { kind: 'knowledge', resultId: r.band.id, score: r.earned, total: r.total, percent: Math.round(r.percent) };
      }
      return { kind: 'outcome', resultId: r.outcome ? r.outcome.id : null };
    }

    /* ----- rendering ----- */

    function render(keepScroll) {
      if (destroyed) return;
      stage.textContent = '';
      var view = state.phase === 'intro' ? introView() : state.phase === 'question' ? questionView()
        : state.phase === 'name' ? nameView() : state.phase === 'matching' ? matchingView() : resultsView();
      view.classList.add('qz-view', state.direction === 'back' ? 'qz-from-left' : 'qz-from-right');
      stage.appendChild(view);
      if (userMoved) {
        var target = stage.querySelector('[data-focus]');
        if (target) target.focus({ preventScroll: !!keepScroll });
      }
      if (state.phase === 'question') live.textContent = progressText(false);
      else if (state.phase === 'name') live.textContent = 'All questions answered. One last step before your results.';
      else if (state.phase === 'matching') live.textContent = 'Matching your answers to pathways.';
      else if (state.phase === 'results') live.textContent = 'Quiz complete. Your result is shown.';
      queueHeight();
    }

    function matchingView() {
      return h('section', { class: 'qz-card qz-matching', 'aria-busy': 'true' },
        h('span', { class: 'qz-spinner', 'aria-hidden': 'true' }),
        h('p', { class: 'qz-matching-text', tabindex: '-1', 'data-focus': true, text: 'Matching your answers to pathways…' }));
    }

    function introView() {
      var total = cfg.questions.length;
      var always = cfg.questions.filter(function (q) { return !q.showIf; }).length;
      var meta = [];
      if (cfg.estimatedMinutes) meta.push('About ' + plural(cfg.estimatedMinutes, 'minute', 'minutes'));
      else meta.push(always < total ? always + ' to ' + total + ' questions' : plural(total, 'question', 'questions'));
      if (cfg.audience) meta.push(cfg.audience);
      var intro = cfg.intro || {};
      var hasBullets = Array.isArray(intro.bullets) && intro.bullets.length > 0;
      var main = h('div', { class: 'qz-intro-main' },
        cfg.category && h('p', { class: 'qz-badge', text: cfg.category }),
        h('h1', { id: uid + '-title', class: 'qz-title', tabindex: '-1', 'data-focus': true, text: cfg.title }),
        h('p', { class: 'qz-lead', text: cfg.description }),
        h('ul', { class: 'qz-meta' }, meta.map(function (m) { return h('li', { text: m }); })),
        h('div', { class: 'qz-actions qz-actions-start' },
          h('button', { type: 'button', class: 'qz-btn qz-btn-primary qz-btn-lg', onclick: start }, intro.startLabel || 'Start quiz', h('span', { class: 'qz-arrow', 'aria-hidden': 'true', text: '→' }))),
        intro.note && h('p', { class: 'qz-fine', text: intro.note }));
      var aside = hasBullets && h('div', { class: 'qz-intro-aside' },
        h('h2', { class: 'qz-h3', text: 'What you’ll get' }),
        h('ul', { class: 'qz-benefits' }, intro.bullets.map(function (t) {
          return h('li', {}, h('span', { class: 'qz-tick', 'aria-hidden': 'true' }), h('span', { text: t }));
        })));
      return h('section', { class: 'qz-card qz-intro' + (hasBullets ? ' qz-intro-split' : ''), 'aria-labelledby': uid + '-title' }, main, aside);
    }

    /* ----- progress ----- */

    // Stage-aware progress: one segment per stage that has visible questions, so the bar does not
    // jump when conditional questions appear. Without cfg.stages it is one segment per question.
    function progressInfo(vis) {
      var q = vis[state.index];
      var info = { position: state.index + 1, count: vis.length, segments: [], stageIndex: 0, stageCount: 0, stageTitle: '' };
      if (!Array.isArray(cfg.stages)) {
        for (var i = 0; i < vis.length; i++) info.segments.push({ state: i < state.index ? 'on' : i === state.index ? 'cur' : '', fraction: 1 });
        info.stageIndex = state.index; info.stageCount = vis.length;
        return info;
      }
      var inVisible = {};
      vis.forEach(function (v) { inVisible[v.id] = true; });
      cfg.stages.forEach(function (st) {
        var ids = st.questions.filter(function (id) { return inVisible[id]; });
        if (!ids.length) return;
        var at = ids.indexOf(q.id);
        var seg = { state: '', fraction: 1 };
        if (at !== -1) { seg.state = 'cur'; seg.fraction = (at + 1) / ids.length; info.stageIndex = info.segments.length; info.stageTitle = st.title; info.stagePos = at + 1; info.stageLen = ids.length; }
        else if (info.segments.length > 0 && info.stageTitle) seg.state = '';   // after the current stage
        else seg.state = 'on';
        info.segments.push(seg);
      });
      info.stageCount = info.segments.length;
      return info;
    }

    var lastAnnouncedStage = null;
    function progressText(full) {
      var vis = visibleQuestions();
      var p = progressInfo(vis);
      var base = 'Question ' + p.position + ' of ' + p.count;
      if (!Array.isArray(cfg.stages)) return base;
      var staged = 'Stage ' + (p.stageIndex + 1) + ' of ' + p.stageCount + ': ' + p.stageTitle + '. ' + base;
      if (full) return staged;
      var changed = lastAnnouncedStage !== p.stageTitle;
      lastAnnouncedStage = p.stageTitle;
      return changed ? staged : base;
    }

    /* ----- questions ----- */

    function questionView() {
      var vis = visibleQuestions();
      var q = vis[state.index];
      var total = vis.length;
      var isLast = state.index === total - 1;
      var multi = q.type === 'multiple';
      var isText = q.type === 'text';
      var qid = uid + '-q';
      var hintId = uid + '-hint';
      var limitId = uid + '-limit';

      // Prefill (e.g. "sponsored" -> preselect "Yes"). Only when the visitor has never answered it.
      if (q.prefill && state.answers[q.id] === undefined && Core.evalCondition(q.prefill.when, Core.resolve(cfg, state.answers).answers)) {
        state.answers[q.id] = q.prefill.value.slice();
      }
      var selected = Core.selectedIds(q, state.answers);
      var maxSel = multi && q.maxSelections ? q.maxSelections : null;

      var contText = h('span');
      var cont = h('button', { type: 'submit', class: 'qz-btn qz-btn-primary' }, contText, !isLast && h('span', { class: 'qz-arrow', 'aria-hidden': 'true', text: '→' }));
      function syncContinue() {
        cont.disabled = !Core.canAdvance(q, state.answers);
        contText.textContent = isLast ? 'See my results' : (q.required === false && !Core.isAnswered(q, state.answers) ? 'Skip' : 'Continue');
      }
      syncContinue();

      var answerArea;
      if (isText) {
        var inputId = uid + '-' + q.id + '-text';
        var field = h('input', {
          class: 'qz-text qz-text-lg', type: 'text', id: inputId, name: uid + '-' + q.id,
          maxlength: q.maxLength || 80, autocomplete: 'off', enterkeyhint: isLast ? 'done' : 'next',
          placeholder: q.placeholder, 'aria-labelledby': qid, 'aria-describedby': hintId,
          'aria-required': q.required === false ? null : 'true'
        });
        field.value = typeof state.answers[q.id] === 'string' ? state.answers[q.id] : '';
        field.addEventListener('input', function () { state.answers[q.id] = field.value; syncContinue(); });
        var pool = q.suggest && window.QUIZ_SUGGESTIONS && window.QUIZ_SUGGESTIONS[q.suggest];
        answerArea = h('div', { class: 'qz-choices qz-text-wrap' }, field);
        if (pool && pool.length) {
          attachSuggest(field, answerArea, pool, uid + '-' + q.id, function (v) { state.answers[q.id] = v; syncContinue(); });
        }
      } else {
        var choices = q.choices.map(function (c) {
          var input = h('input', {
            class: 'qz-input', type: multi ? 'checkbox' : 'radio', name: uid + '-' + q.id, value: c.id,
            id: uid + '-' + q.id + '-' + c.id, checked: selected.indexOf(c.id) !== -1,
            onchange: function (e) { onChoice(q, form, e.target); }
          });
          // Pointer presses only: arrow keys must not auto-advance.
          input.addEventListener('pointerdown', function () { form.pointerAt = Date.now(); });
          return h('label', { class: 'qz-choice' }, input,
            h('span', { class: 'qz-choice-body' },
              h('span', { class: 'qz-mark qz-mark-' + (multi ? 'box' : 'dot'), 'aria-hidden': 'true' }),
              h('span', { class: 'qz-choice-text' }, rich(c.text))));
        });
        answerArea = h('fieldset', { class: 'qz-choices' + (q.layout === 'chips' ? ' qz-choices-chips' : ''), 'aria-labelledby': qid, 'aria-describedby': hintId + (maxSel ? ' ' + limitId : '') }, choices);
      }

      var prog = progressInfo(vis);
      var segs = prog.segments.map(function (sg) {
        var seg = h('span', { class: 'qz-seg' + (sg.state === 'on' ? ' is-on' : sg.state === 'cur' ? ' is-cur' : '') });
        if (sg.state === 'cur' && sg.fraction < 1) { seg.classList.add('is-partial'); seg.style.setProperty('--f', String(sg.fraction)); }
        return seg;
      });
      var staged = Array.isArray(cfg.stages);
      // Per-stage count, so conditional questions don't change the total.
      var cheer = staged ? (prog.stageLen ? prog.stagePos + ' of ' + prog.stageLen : '')
        : (isLast && total > 1 ? 'Last one!' : (total > 3 && state.index + 1 === Math.ceil(total / 2) ? 'Halfway there' : ''));
      var stepText = staged ? prog.stageTitle : 'Question ' + prog.position + ' of ' + total;
      var hintText = multi ? (maxSel ? 'Choose up to ' + maxSel : 'Select all that apply')
        : q.required === false ? 'Optional' : '';

      var form = h('form', { class: 'qz-card qz-question', novalidate: true, onsubmit: function (e) { e.preventDefault(); next(); } },
        h('div', { class: 'qz-progress-head' },
          h('p', {}, h('span', { class: 'qz-step', text: stepText }), cheer && h('span', { class: 'qz-cheer', text: cheer })),
          restartControl()),
        h('div', { class: 'qz-progress' + (!staged && total > 12 ? ' qz-progress-dense' : ''), role: 'progressbar', 'aria-label': 'Quiz progress', 'aria-valuemin': '1', 'aria-valuemax': String(prog.stageCount), 'aria-valuenow': String(prog.stageIndex + 1), 'aria-valuetext': progressText(true) }, segs),
        h('div', { class: 'qz-q-main' },
          h('h2', { id: qid, class: 'qz-question-text', tabindex: '-1', 'data-focus': true }, rich(q.text)),
          q.code && h('pre', { class: 'qz-code', tabindex: '0', 'aria-label': 'Code sample' }, h('code', { text: q.code })),
          h('p', { id: hintId, class: 'qz-hint', text: hintText }),
          maxSel && h('p', { id: limitId, class: 'qz-limit', 'aria-live': 'polite' }),
          q.note && h('p', { class: 'qz-why', text: q.note })),
        answerArea,
        h('div', { class: 'qz-actions' },
          allowBack && state.index > 0
            ? h('button', { type: 'button', class: 'qz-btn qz-btn-ghost', onclick: back }, h('span', { class: 'qz-arrow', 'aria-hidden': 'true', text: '←' }), 'Back')
            : h('span'),
          cont));
      form.cont = cont;
      form.syncContinue = syncContinue;
      if (!isText) syncChoices(q, form);
      return form;
    }

    // Asked after the last question, before scoring. Stays in the browser unless the lead form is sent.
    function nameView() {
      var required = nameStep.required !== false;
      var hId = uid + '-name-h', hintId = uid + '-name-hint', errId = uid + '-name-err';
      var field = h('input', {
        class: 'qz-text qz-text-lg', type: 'text', id: uid + '-name', name: 'name', maxlength: 80,
        autocomplete: 'given-name', autocapitalize: 'words', spellcheck: 'false', enterkeyhint: 'done',
        placeholder: nameStep.placeholder, 'aria-labelledby': hId, 'aria-describedby': hintId + ' ' + errId,
        'aria-required': required ? 'true' : null
      });
      field.value = state.name;
      var err = h('p', { class: 'qz-field-error', id: errId, hidden: true });
      var contText = h('span');
      var cont = h('button', { type: 'submit', class: 'qz-btn qz-btn-primary' }, contText);
      function sync() {
        var has = field.value.trim() !== '';
        contText.textContent = has || required ? 'See my results' : 'Skip';
        if (has) { err.hidden = true; field.removeAttribute('aria-invalid'); }
      }
      field.addEventListener('input', function () { state.name = field.value; sync(); });
      sync();

      var prog = progressInfo(visibleQuestions());
      var segs = prog.segments.map(function () { return h('span', { class: 'qz-seg is-on' }); });

      return h('form', {
        class: 'qz-card qz-question qz-name-step', novalidate: true,
        onsubmit: function (e) {
          e.preventDefault();
          state.name = field.value.trim();
          if (required && !state.name) {
            err.textContent = 'Please enter your name to see your results.';
            err.hidden = false;
            field.setAttribute('aria-invalid', 'true');
            field.focus();
            return queueHeight();
          }
          finish();
        }
      },
        h('div', { class: 'qz-progress-head' },
          h('p', {}, h('span', { class: 'qz-step', text: 'Almost done' }), h('span', { class: 'qz-cheer', text: 'Last step' })),
          restartControl()),
        h('div', { class: 'qz-progress', role: 'progressbar', 'aria-label': 'Quiz progress', 'aria-valuemin': '1', 'aria-valuemax': String(prog.stageCount), 'aria-valuenow': String(prog.stageCount), 'aria-valuetext': 'All questions answered' }, segs),
        h('div', { class: 'qz-q-main' },
          h('h2', { id: hId, class: 'qz-question-text', tabindex: '-1', 'data-focus': true, text: nameStep.heading || 'What’s your name?' }),
          h('p', { id: hintId, class: 'qz-hint', text: nameStep.hint || (required ? '' : 'Optional') })),
        h('div', { class: 'qz-choices qz-text-wrap qz-field' }, field, err),
        h('div', { class: 'qz-actions' },
          allowBack
            ? h('button', { type: 'button', class: 'qz-btn qz-btn-ghost', onclick: function () { go('question', { index: visibleQuestions().length - 1, direction: 'back' }); } }, h('span', { class: 'qz-arrow', 'aria-hidden': 'true', text: '←' }), 'Back')
            : h('span'),
          cont));
    }

    // Two-step restart (no modal dialogs): first tap arms it, second tap restarts.
    function restartControl() {
      var armed = false, timer = null;
      var btn = h('button', { type: 'button', class: 'qz-link', text: 'Restart' });
      btn.addEventListener('click', function () {
        if (armed) { clearTimeout(timer); return restart(); }
        armed = true;
        btn.textContent = 'Tap again to restart';
        btn.classList.add('is-armed');
        timer = setTimeout(function () { armed = false; btn.textContent = 'Restart'; btn.classList.remove('is-armed'); }, 3500);
      });
      return btn;
    }

    // Reflect the selection limit in the UI: show "n of N selected" and disable the unchecked
    // options once the limit is reached. Exclusive options ("None of these") stay available
    // because choosing one replaces the rest.
    function syncChoices(q, form) {
      var inputs = Array.prototype.slice.call(form.querySelectorAll('input.qz-input'));
      var count = inputs.filter(function (i) { return i.checked; }).length;
      var max = q.type === 'multiple' && q.maxSelections ? q.maxSelections : null;
      var exclusive = Array.isArray(q.exclusive) ? q.exclusive : [];
      inputs.forEach(function (i) {
        i.disabled = !!(max && count >= max && !i.checked && exclusive.indexOf(i.value) === -1);
      });
      var limit = form.querySelector('.qz-limit');
      if (limit && max) {
        limit.textContent = count + ' of ' + max + ' selected' + (count >= max ? ' (limit reached)' : '');
        limit.classList.toggle('is-full', count >= max);
      }
    }

    function onChoice(q, form, changed) {
      var inputs = form.querySelectorAll('input.qz-input');
      var exclusive = Array.isArray(q.exclusive) ? q.exclusive : [];
      if (q.type === 'multiple' && exclusive.length && changed && changed.checked) {
        var changedIsExclusive = exclusive.indexOf(changed.value) !== -1;
        Array.prototype.forEach.call(inputs, function (i) {
          if (i !== changed && (changedIsExclusive || exclusive.indexOf(i.value) !== -1)) i.checked = false;
        });
      }
      var ids = [];
      Array.prototype.forEach.call(inputs, function (i) { if (i.checked) ids.push(i.value); });
      state.answers[q.id] = ids;
      syncChoices(q, form);
      form.syncContinue();
      // Auto-advance single choice after a pointer pick; keyboard users press Continue.
      var vis = visibleQuestions();
      var fromPointer = form.pointerAt && Date.now() - form.pointerAt < 1500;
      if (autoAdvance && q.type === 'single' && fromPointer && state.index < vis.length - 1 && Core.canAdvance(q, state.answers)) {
        clearTimeout(advanceTimer);
        var at = state.index;
        advanceTimer = setTimeout(function () {
          if (!destroyed && state.phase === 'question' && state.index === at) { userMoved = true; next(); }
        }, reduceMotion ? 120 : 320);
      }
    }

    /* ----- result renderers for extra quiz types ----- */

    function trackCta(info) {
      if (info.kind === 'bootcamp' && info.pathwayId && state.courseInterest.indexOf(info.pathwayId) === -1) state.courseInterest.push(info.pathwayId);
      emit('cta:clicked', info);
    }

    function resultsContext(r) {
      return {
        h: h, rich: rich, uid: uid, cfg: cfg, Core: Core, result: r,
        answers: Core.resolve(cfg, state.answers).answers,
        leadId: state.leadId, startedAt: state.startedAt, completedAt: state.completedAt,
        courseInterest: state.courseInterest, name: state.name,
        lc: lc, leadSubmitter: leadSubmitter,
        emit: emit, trackCta: trackCta, queueHeight: queueHeight, restart: restart, fmt: fmt, plural: plural,
        isDestroyed: function () { return destroyed; }
      };
    }

    /* ----- results ----- */

    function resultsView() {
      var r = state.result;
      if (customResults) return customResults(resultsContext(r));
      var parts = [r.kind === 'knowledge' ? knowledgeTop(r) : outcomeTop(r)];
      var nextBlock = nextStepView(r);
      if (nextBlock) parts.push(nextBlock);
      if (r.kind === 'knowledge') parts.push(reviewView(r));
      if (cfg.results.disclaimer) parts.push(h('p', { class: 'qz-disclaimer', text: cfg.results.disclaimer }));
      parts.push(h('div', { class: 'qz-actions qz-actions-center' },
        h('button', { type: 'button', class: 'qz-btn qz-btn-ghost', text: 'Retake the quiz', onclick: restart })));
      return h('section', { class: 'qz-card qz-results', 'aria-labelledby': uid + '-result' }, parts);
    }

    function knowledgeTop(r) {
      var pct = Math.round(r.percent);
      var ring = h('div', { class: 'qz-ring', 'aria-hidden': 'true' });
      ring.style.setProperty('--p', String(pct));
      var panel = h('aside', { class: 'qz-panel', 'aria-label': 'Your score' },
        h('p', { class: 'qz-panel-label', text: 'Your score' }),
        h('div', { class: 'qz-ring-wrap' }, ring, h('div', { class: 'qz-ring-text' }, h('span', { class: 'qz-ring-pct', text: pct + '%' }))),
        h('p', { class: 'qz-panel-sub', text: fmt(r.earned) + ' out of ' + fmt(r.total) }));
      var main = h('div', { class: 'qz-result-main' },
        h('p', { class: 'qz-badge', text: 'Your result' }),
        h('h2', { id: uid + '-result', class: 'qz-result-title', tabindex: '-1', 'data-focus': true, text: r.band.title }),
        h('p', { class: 'qz-lead', text: r.band.summary }),
        r.revisitTopics.length > 0 && h('div', { class: 'qz-topics' },
          h('h3', { class: 'qz-h3', text: 'Worth revisiting' }),
          h('ul', { class: 'qz-tags' }, r.revisitTopics.map(function (t) { return h('li', { text: t }); }))),
        r.strongTopics.length > 0 && h('div', { class: 'qz-topics' },
          h('h3', { class: 'qz-h3', text: 'You did well on' }),
          h('ul', { class: 'qz-tags qz-tags-ok' }, r.strongTopics.map(function (t) { return h('li', { text: t }); }))));
      return h('div', { class: 'qz-result-top' }, panel, main);
    }

    function outcomeTop(r) {
      if (!r.outcome) {
        return h('div', { class: 'qz-result-main' },
          h('p', { class: 'qz-badge', text: 'Your result' }),
          h('h2', { id: uid + '-result', class: 'qz-result-title', tabindex: '-1', 'data-focus': true, text: 'Not enough answers to suggest a result' }),
          h('p', { class: 'qz-lead', text: 'Your answers did not point to any result. Retake the quiz and answer every question for a more useful outcome.' }));
      }
      var o = r.outcome;
      var rows = r.ranking.map(function (row) {
        var fill = h('div', { class: 'qz-meter-fill' });
        fill.style.width = Math.round(row.share) + '%';
        return h('li', { class: 'qz-dist-row' },
          h('div', { class: 'qz-dist-label' },
            h('span', { text: row.outcome.title }),
            h('span', { class: 'qz-dist-val', text: Math.round(row.share) + '%' })),
          h('div', { class: 'qz-meter', 'aria-hidden': 'true' }, fill));
      });
      var panel = h('aside', { class: 'qz-panel', 'aria-labelledby': uid + '-dist' },
        h('p', { id: uid + '-dist', class: 'qz-panel-label', text: 'How your answers were spread' }),
        h('ul', { class: 'qz-dist' }, rows));
      var main = h('div', { class: 'qz-result-main' },
        h('p', { class: 'qz-badge', text: 'Your result' }),
        h('h2', { id: uid + '-result', class: 'qz-result-title', tabindex: '-1', 'data-focus': true, text: o.title }),
        h('p', { class: 'qz-lead', text: o.summary }),
        r.tiedWith.length > 0 && h('p', { class: 'qz-note', text: 'This was a close call with ' + r.tiedWith.map(function (t) { return t.title; }).join(' and ') + '. We show the first of the tied results; you may relate to both.' }),
        Array.isArray(o.traits) && o.traits.length > 0 && h('div', { class: 'qz-topics' },
          h('h3', { class: 'qz-h3', text: 'What this suggests' }),
          h('ul', { class: 'qz-list' }, o.traits.map(function (t) { return h('li', { text: t }); }))));
      return h('div', { class: 'qz-result-top' }, panel, main);
    }

    function nextStepView(r) {
      var source = r.kind === 'knowledge' ? r.band : r.outcome;
      var nextText = source && source.nextStep;
      var cta = cfg.cta && ctaView();
      var lead = lc && leadSubmitter && leadView(r);
      if (!nextText && !cta && !lead) return null;
      return h('section', { class: 'qz-next' + (lead ? ' has-lead' : ''), 'aria-labelledby': uid + '-next' },
        h('h3', { id: uid + '-next', class: 'qz-h3', text: 'Your next step' }),
        h('div', { class: 'qz-next-body' },
          h('div', { class: 'qz-next-main' }, nextText && h('p', { class: 'qz-next-text', text: nextText }), cta),
          lead));
    }

    function ctaView() {
      var c = cfg.cta;
      var href = Core.safeUrl(c.url);
      var mode = c.target || 'new-tab';
      var attrs = { class: 'qz-btn qz-btn-primary', href: href };
      if (mode === 'new-tab') { attrs.target = '_blank'; attrs.rel = 'noopener noreferrer'; }
      else if (mode === 'top') { attrs.target = '_top'; attrs.rel = 'noopener'; }
      return h('div', { class: 'qz-cta' },
        c.description && h('p', { class: 'qz-muted', text: c.description }),
        h('a', attrs, c.label, mode === 'new-tab' && h('span', { class: 'qz-sr', text: ' (opens in a new tab)' })));
    }

    function reviewView(r) {
      var labels = { correct: ['✓', 'Correct'], incorrect: ['✗', 'Not quite'], partial: ['◐', 'Partly correct'], unanswered: ['–', 'Not answered'] };
      var items = r.items.map(function (it, i) {
        var q = it.question;
        var byId = {};
        q.choices.forEach(function (c) { byId[c.id] = c; });
        var wrongPicked = it.selected.filter(function (id) { return it.correctIds.indexOf(id) === -1; });
        var feedback = wrongPicked.map(function (id) { return byId[id].feedback; }).filter(Boolean);
        var lbl = labels[it.status];
        return h('details', { class: 'qz-review-item', open: it.status !== 'correct' },
          h('summary', {},
            h('span', { class: 'qz-status qz-status-' + it.status },
              h('span', { 'aria-hidden': 'true', text: lbl[0] + ' ' }), lbl[1]),
            h('span', { class: 'qz-review-q' }, (i + 1) + '. ', rich(q.text))),
          h('div', { class: 'qz-review-body' },
            h('p', { class: 'qz-review-label', text: it.selected.length > 1 ? 'Your answers' : 'Your answer' }),
            it.selected.length
              ? h('ul', { class: 'qz-list' }, it.selected.map(function (id) { return h('li', {}, rich(byId[id].text)); }))
              : h('p', { class: 'qz-muted', text: 'You did not answer this question.' }),
            it.status !== 'correct' && h('p', { class: 'qz-review-label', text: it.correctIds.length > 1 ? 'Correct answers' : 'Correct answer' }),
            it.status !== 'correct' && h('ul', { class: 'qz-list' }, it.correctIds.map(function (id) { return h('li', {}, rich(byId[id].text)); })),
            feedback.map(function (f) { return h('p', { class: 'qz-feedback' }, rich(f)); }),
            q.explanation && h('p', { class: 'qz-explain' }, h('strong', { text: 'Why: ' }), rich(q.explanation))));
      });
      return h('section', { class: 'qz-review', 'aria-labelledby': uid + '-review' },
        h('h3', { id: uid + '-review', class: 'qz-h3', text: 'Answer review' }),
        items);
    }

    /* ----- lead capture ----- */

    function leadView(r) {
      var lead = { busy: false, done: false };
      var wrap = h('section', { class: 'qz-capture', 'aria-labelledby': uid + '-lead-h' });
      var heading = h('h4', { id: uid + '-lead-h', class: 'qz-lead-h', text: lc.heading || 'Stay in touch' });

      function field(name, label, type, autocomplete, required) {
        var id = uid + '-f-' + name;
        var err = h('p', { class: 'qz-field-error', id: id + '-err', hidden: true });
        var input = h('input', { class: 'qz-text', id: id, name: name, type: type, autocomplete: autocomplete, 'aria-describedby': id + '-err', 'aria-required': required ? 'true' : null });
        return { input: input, err: err, node: h('div', { class: 'qz-field' }, h('label', { for: id, text: label + (required ? '' : ' (optional)') }), input, err) };
      }

      var nameF = lc.collectName ? field('name', 'Name', 'text', 'name', !!lc.nameRequired) : null;
      if (nameF) nameF.input.value = state.name;
      var emailF = field('email', 'Email address', 'email', 'email', true);
      var consentRequired = !!(lc.consent && lc.consent.required);
      var consentBox = lc.consent && h('input', { type: 'checkbox', id: uid + '-f-consent', name: 'consent', 'aria-describedby': uid + '-f-consent-err' });
      var consentErr = h('p', { class: 'qz-field-error', id: uid + '-f-consent-err', hidden: true });
      var formError = h('p', { class: 'qz-form-error', role: 'alert', hidden: true });
      var submit = h('button', { type: 'submit', class: 'qz-btn qz-btn-primary', text: lc.submitLabel || 'Submit' });

      var form = h('form', { class: 'qz-lead-form', novalidate: true },
        nameF && nameF.node, emailF.node,
        lc.consent && h('div', { class: 'qz-field qz-consent' },
          h('label', { class: 'qz-check', for: uid + '-f-consent' }, consentBox, h('span', { text: lc.consent.text })),
          consentErr),
        formError,
        h('div', { class: 'qz-actions' }, h('span'), submit),
        lc.privacyNotice && h('p', { class: 'qz-privacy' }, lc.privacyNotice.text + ' ',
          lc.privacyNotice.url && h('a', { href: Core.safeUrl(lc.privacyNotice.url), target: '_blank', rel: 'noopener noreferrer', text: 'Privacy policy' })));

      function setErr(f, msg) {
        var inp = f.input;
        f.err.hidden = !msg; f.err.textContent = msg || '';
        if (inp) { if (msg) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
      }

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (lead.busy || lead.done || destroyed) return; // block duplicate submissions
        formError.hidden = true;
        var bad = [];
        var email = emailF.input.value.trim();
        var name = nameF ? nameF.input.value.trim() : '';
        if (nameF) { setErr(nameF, lc.nameRequired && !name ? 'Please enter your name.' : ''); if (lc.nameRequired && !name) bad.push(nameF.input); }
        if (!email) { setErr(emailF, 'Please enter your email address.'); bad.push(emailF.input); }
        else if (!Core.isValidEmail(email)) { setErr(emailF, 'That email address doesn’t look right.'); bad.push(emailF.input); }
        else setErr(emailF, '');
        if (consentBox) {
          var missing = consentRequired && !consentBox.checked;
          consentErr.hidden = !missing; consentErr.textContent = missing ? 'Please tick this box to continue.' : '';
          if (missing) { consentBox.setAttribute('aria-invalid', 'true'); bad.push(consentBox); } else consentBox.removeAttribute('aria-invalid');
        }
        if (bad.length) { bad[0].focus(); return; }

        lead.busy = true;
        submit.disabled = true; submit.textContent = 'Sending…';
        form.setAttribute('aria-busy', 'true');
        var payload = { quizId: cfg.id, email: email, result: resultSummary(r) };
        if (nameF && name) payload.name = name;
        if (consentBox) payload.consent = consentBox.checked;

        Promise.resolve().then(function () { return leadSubmitter(payload); }).then(function () {
          if (destroyed) return;
          lead.done = true; lead.busy = false;
          wrap.textContent = '';
          wrap.appendChild(h('p', { class: 'qz-success', role: 'status', text: lc.successMessage || 'Thanks, you’re all set.' }));
          emit('lead:submitted', {});
          queueHeight();
        }, function () {
          if (destroyed) return;
          lead.busy = false;
          submit.disabled = false; submit.textContent = lc.submitLabel || 'Submit';
          form.removeAttribute('aria-busy');
          formError.textContent = 'Sorry, that didn’t go through. Please check your connection and try again.';
          formError.hidden = false;
          emit('lead:failed', {});
          queueHeight();
        });
      });

      wrap.appendChild(heading);
      if (lc.description) wrap.appendChild(h('p', { class: 'qz-muted', text: lc.description }));
      wrap.appendChild(form);
      return wrap;
    }

    function postJson(endpoint, payload) {
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
      return fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctrl ? ctrl.signal : undefined
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
      }).finally(function () { clearTimeout(timer); });
    }

    /* ----- error panel ----- */

    function fail(errors) {
      console.error('[quiz-widget] Invalid configuration:\n- ' + errors.join('\n- '));
      rootEl.appendChild(h('div', { class: 'qz-card qz-error', role: 'alert' },
        h('h2', { class: 'qz-question-text', text: 'This quiz couldn’t be loaded' }),
        h('p', { class: 'qz-muted', text: 'The quiz configuration has problems that need fixing:' }),
        h('ul', { class: 'qz-list' }, errors.slice(0, 12).map(function (e) { return h('li', { text: e }); }))));
      return { restart: function () {}, destroy: function () { rootEl.textContent = ''; }, error: errors };
    }

    function destroy() {
      destroyed = true;
      cleanups.forEach(function (fn) { fn(); });
      cleanups = [];
      if (instances.get(rootEl) === api) instances.delete(rootEl);
      rootEl.textContent = '';
    }

    var api = { restart: restart, destroy: destroy };
    render(false);
    reportHeight(true);
    return api;
  }

  global.QuizWidget = { mount: mount };

  // Auto-mount into #quiz unless the page opts out with data-manual (to pass options itself).
  function auto() {
    var el = document.getElementById('quiz');
    if (el && global.QUIZ_CONFIG && !el.hasAttribute('data-manual')) mount(el, global.QUIZ_CONFIG);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto);
  else auto();
}(window));

/*
 * quiz-results-pathway.js — result screen for `type: 'pathway'` quizzes (the Career Compass).
 * Registered as window.QuizWidgetRenderers.pathway and called by quiz-engine.js with a context
 * object (DOM helper `h`, the scored result, the visitor's answers, event hooks, lead submitter).
 * Like the rest of the widget it only ever inserts text with textContent.
 *
 * Order: best fit, top 3, 90-day plan, readiness, keep your results.
 */
(function (global) {
  'use strict';

  var KIND_LABEL = { interests: 'Interest', experience: 'Experience', strengths: 'Strength', tools: 'Tool' };

  // Pathway illustrations (48x48). `a: 1` = accent fill.
  var ART = {
    DATA: [['path', { d: 'M8 40h32' }], ['rect', { x: 10, y: 26, width: 7, height: 12, rx: 2 }], ['rect', { x: 21, y: 18, width: 7, height: 20, rx: 2 }], ['rect', { x: 32, y: 9, width: 7, height: 29, rx: 2, a: 1 }]],
    PM: [['rect', { x: 10, y: 7, width: 28, height: 35, rx: 4 }], ['path', { d: 'M16 17l3 3 5-6M16 28l3 3 5-6' }], ['path', { d: 'M28 17h5M28 28h5M16 37h17' }], ['circle', { cx: 38, cy: 9, r: 5, a: 1 }]],
    BA: [['rect', { x: 6, y: 8, width: 14, height: 10, rx: 2 }], ['rect', { x: 28, y: 30, width: 14, height: 10, rx: 2, a: 1 }], ['circle', { cx: 35, cy: 13, r: 5 }], ['path', { d: 'M20 13h10M35 18v12M13 18v17h15' }]],
    AML: [['rect', { x: 8, y: 6, width: 22, height: 30, rx: 3 }], ['path', { d: 'M13 14h12M13 20h8' }], ['circle', { cx: 30, cy: 30, r: 8, a: 1 }], ['path', { d: 'M36 36l6 6' }]],
    AI: [['path', { d: 'M21 7c1.6 9.4 3.6 11.4 13 13-9.4 1.6-11.4 3.6-13 13-1.6-9.4-3.6-11.4-13-13 9.4-1.6 11.4-3.6 13-13z' }], ['path', { d: 'M37 29c.7 4 1.4 4.8 5 5.5-3.6.7-4.3 1.5-5 5.5-.7-4-1.4-4.8-5-5.5 3.6-.7 4.3-1.5 5-5.5z', a: 1 }]],
    CYBER: [['path', { d: 'M24 6l14 5v11c0 9-6 16-14 20-8-4-14-11-14-20V11z' }], ['circle', { cx: 24, cy: 22, r: 4, a: 1 }], ['path', { d: 'M24 26v6' }]],
    VA: [['path', { d: 'M12 28v-4a12 12 0 0124 0v4' }], ['rect', { x: 8, y: 26, width: 8, height: 12, rx: 3, a: 1 }], ['rect', { x: 32, y: 26, width: 8, height: 12, rx: 3 }], ['path', { d: 'M36 38c0 3.5-3.5 5-8 5h-2' }]]
  };
  var SVG_NS = 'http://www.w3.org/2000/svg';
  function art(id) {
    var shapes = ART[id];
    if (!shapes) return null;
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 48 48');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    shapes.forEach(function (sh) {
      var el = document.createElementNS(SVG_NS, sh[0]);
      Object.keys(sh[1]).forEach(function (k) { if (k !== 'a') el.setAttribute(k, String(sh[1][k])); });
      if (sh[1].a) el.setAttribute('class', 'qz-art-a');
      svg.appendChild(el);
    });
    var box = document.createElement('div');
    box.className = 'qz-art';
    box.appendChild(svg);
    return box;
  }

  function render(ctx) {
    var h = ctx.h, r = ctx.result, cfg = ctx.cfg, pw = cfg.pathway, uid = ctx.uid;
    var PS = global.PathwayScoring;
    var parts = [];

    /* ----- call to action: always says where it leads ----- */

    function ctaMode() { return pw.cta.target || 'new-tab'; }

    function destination(kind, name) {
      var what = kind === 'bootcamp' ? 'the ' + name + ' bootcamp page' : 'the career information session booking page';
      var where = { 'new-tab': ' in a new tab', 'same-frame': ' in this window', top: ' (this leaves the current page)', host: ' on this site' }[ctaMode()];
      return 'Opens ' + what + where;
    }

    // opts: { kind: 'bootcamp'|'info-session', pathway?, label, url, placement, style: 'primary'|'ghost' }
    function ctaLink(opts) {
      var mode = ctaMode();
      var url = ctx.Core.safeUrl(opts.url);
      var descId = uid + '-cta-' + opts.placement;
      var cls = opts.style === 'ghost' ? 'qz-btn qz-btn-ghost' : opts.style === 'text' ? 'qz-btn-text' : 'qz-btn qz-btn-primary';
      var attrs = { class: cls, href: url, 'aria-describedby': descId };
      if (mode === 'new-tab') { attrs.target = '_blank'; attrs.rel = 'noopener noreferrer'; }
      else if (mode === 'top') { attrs.target = '_top'; attrs.rel = 'noopener'; }
      var a = h('a', attrs, opts.label, mode === 'new-tab' && h('span', { class: 'qz-ext', 'aria-hidden': 'true', text: '↗' }));
      a.addEventListener('click', function (e) {
        ctx.trackCta({ kind: opts.kind, pathwayId: opts.pathway ? opts.pathway.id : null, url: url, placement: opts.placement });
        // "host" mode: the embedding page decides what happens, the widget does not navigate.
        if (mode === 'host') e.preventDefault();
      });
      return h('div', { class: 'qz-cta' }, a,
        h('span', { id: descId, class: 'qz-sr', text: destination(opts.kind, opts.pathway ? opts.pathway.name : '') }));
    }

    function bootcampCta(entry, placement, style) {
      return ctaLink({
        kind: 'bootcamp', pathway: entry.pathway, placement: placement, style: style,
        label: placement === 'hero' ? 'Explore the bootcamp' : 'View this bootcamp',
        url: pw.cta.bootcamps[entry.id].url
      });
    }

    function infoSessionCta(placement, style) {
      var c = pw.cta.infoSession;
      return ctaLink({ kind: 'info-session', placement: placement, style: style, label: c.label, url: c.url });
    }

    /* ----- not enough information ----- */

    if (r.insufficient) {
      parts.push(h('div', { class: 'qz-result-main qz-path-empty' },
        h('p', { class: 'qz-badge', text: ctx.name ? ctx.name + ', here’s your result' : 'Your result' }),
        h('h2', { id: uid + '-result', class: 'qz-result-title', tabindex: '-1', 'data-focus': true, text: 'Not enough information to recommend a pathway' }),
        h('p', { class: 'qz-lead', text: 'Your answers didn’t point to a clear match yet. That usually means none of the skills, tools or activities listed applied. Retake the quiz and pick what fits you, or talk it through with an adviser.' }),
        infoSessionCta('insufficient', 'primary')));
      parts.push(actionsView());
      return wrap(parts);
    }

    /* ----- best fit ----- */

    var best = r.top[0];
    var topPct = Math.max(best.percent, 1);
    var reasons = best.reasons.slice(0, 3);
    parts.push(h('div', { class: 'qz-hero' },
      art(best.id),
      h('p', { class: 'qz-badge', text: ctx.name ? ctx.name + ', here’s your best fit' : 'Your best fit' }),
      h('h2', { id: uid + '-result', class: 'qz-result-title', tabindex: '-1', 'data-focus': true, text: best.pathway.name }),
      fitLine(best),
      reasons.length > 0 && h('div', { class: 'qz-topics' },
        h('h3', { class: 'qz-h3', text: 'Why it fits' }),
        h('ul', { class: 'qz-chips', 'aria-label': 'Answers that matched' }, reasons.map(function (x) {
          return h('li', {}, h('span', { class: 'qz-sr', text: KIND_LABEL[x.dimension] + ': ' }), x.text);
        }))),
      h('div', { class: 'qz-hero-actions' }, bootcampCta(best, 'hero', 'primary'))));

    /* ----- top 3 ----- */

    parts.push(h('section', { class: 'qz-block', 'aria-labelledby': uid + '-top3' },
      h('h3', { id: uid + '-top3', class: 'qz-block-h', text: 'Your top ' + r.top.length }),
      h('ol', { class: 'qz-top3' }, r.top.map(function (e, i) {
        var fill = h('span', { class: 'qz-bar-fill' });
        fill.style.width = Math.max(4, Math.round(e.percent / topPct * 100)) + '%';
        var p = e.pathway;
        var penalty = r.avoidanceNotes.filter(function (n) { return n.pathwayId === e.id; })[0];
        return h('li', {}, h('details', { class: 'qz-top3-item' },
          h('summary', {},
            h('span', { class: 'qz-top3-rank', text: String(i + 1) }),
            h('span', { class: 'qz-top3-main' },
              h('span', { class: 'qz-top3-name', text: p.name }),
              h('span', { class: 'qz-bar', 'aria-hidden': 'true' }, fill)),
            h('span', { class: 'qz-top3-fit' }, PS.fitLabel(cfg, e.percent).label, h('span', { class: 'qz-top3-pct', text: e.percent + '%' })),
            h('span', { class: 'qz-chev', 'aria-hidden': 'true' })),
          h('div', { class: 'qz-top3-body' },
            p.skillGaps && p.skillGaps.length > 0 && h('div', {},
              h('p', { class: 'qz-role-label', text: 'Skills to build' }),
              h('ul', { class: 'qz-chips qz-chips-plain' }, p.skillGaps.map(function (t) { return h('li', { text: upperFirst(t) }); }))),
            p.starterRoles && p.starterRoles.length > 0 && h('div', {},
              h('p', { class: 'qz-role-label', text: 'Roles to aim for' }),
              h('p', { text: p.starterRoles.join(' · ') + (p.progressionRoles && p.progressionRoles.length ? ', then ' + p.progressionRoles.join(' · ') : '') })),
            p.portfolio && h('div', {},
              h('p', { class: 'qz-role-label', text: 'Portfolio idea' }),
              h('p', { text: p.portfolio })),
            penalty && h('p', { class: 'qz-muted qz-small', text: 'Ranked a little lower because you said you’d rather avoid some of its core work.' }),
            i > 0 && bootcampCta(e, 'top3-' + e.id, 'ghost'))));
      }))));

    /* ----- 90-day plan ----- */

    var rm = r.roadmap;
    if (rm.rows.length) {
      parts.push(h('section', { class: 'qz-block', 'aria-labelledby': uid + '-plan' },
        h('div', { class: 'qz-block-head' },
          h('h3', { id: uid + '-plan', class: 'qz-block-h', text: 'Your 90-day plan' }),
          h('span', { class: 'qz-pill', text: rm.segment })),
        h('ol', { class: 'qz-plan' }, rm.rows.map(function (row) {
          return h('li', {},
            h('span', { class: 'qz-plan-dot', 'aria-hidden': 'true' }),
            h('p', { class: 'qz-plan-period', text: periodLabel(row.period) }),
            h('p', { class: 'qz-plan-action', text: row.action }));
        })),
        rm.addons.length > 0 && h('div', { class: 'qz-tailored' },
          h('p', { class: 'qz-role-label', text: 'Tailored for you' }),
          h('ul', { class: 'qz-list' }, rm.addons.map(function (a) { return h('li', { text: a.text }); }))),
        rm.conditional && pw.ukGuidance && h('div', { class: 'qz-note qz-uk' },
          h('p', { class: 'qz-h4', text: pw.ukGuidance.title }),
          pw.ukGuidance.body.map(function (t) { return h('p', { text: t }); }))));
    }

    /* ----- readiness ----- */

    var levels = pw.readiness.labels.slice().sort(function (a, b) { return a.min - b.min; });
    parts.push(h('section', { class: 'qz-block', 'aria-labelledby': uid + '-ready' },
      h('h3', { id: uid + '-ready', class: 'qz-block-h', text: 'Training readiness' }),
      h('ol', { class: 'qz-levels', 'aria-label': 'Readiness scale' }, levels.map(function (l) {
        var cur = l.id === r.readiness.id;
        return h('li', { class: 'qz-level' + (cur ? ' is-current' : ''), 'aria-current': cur ? 'step' : null, text: l.label });
      })),
      h('p', { class: 'qz-ready-sum', text: r.readiness.summary })));

    /* ----- keep your results ----- */

    var keep = h('section', { class: 'qz-block qz-keep qz-no-print', 'aria-labelledby': uid + '-keep' },
      h('h3', { id: uid + '-keep', class: 'qz-block-h', text: 'Keep your results' }));
    var actions = h('div', { class: 'qz-actions qz-keep-actions' });
    var printBtn = h('button', { type: 'button', class: 'qz-btn qz-btn-ghost', text: 'Save as PDF', onclick: printResults });
    if (ctx.lc && ctx.leadSubmitter) {
      var form = reportForm(function () {
        form.hidden = true; actions.hidden = false;
        emailButton.setAttribute('aria-expanded', 'false');
        emailButton.focus();
        ctx.queueHeight();
      });
      form.id = uid + '-report-form';
      form.hidden = true;
      var emailButton = h('button', {
        type: 'button', class: 'qz-btn qz-btn-primary', text: 'Email it to me',
        'aria-expanded': 'false', 'aria-controls': form.id,
        onclick: function () {
          form.hidden = false; actions.hidden = true;
          emailButton.setAttribute('aria-expanded', 'true');
          form.querySelector('input').focus();
          ctx.queueHeight();
        }
      });
      actions.appendChild(emailButton);
      actions.appendChild(printBtn);
      keep.appendChild(actions);
      keep.appendChild(form);
    } else {
      actions.appendChild(printBtn);
      keep.appendChild(actions);
    }
    keep.appendChild(h('div', { class: 'qz-quiet-actions' },
      infoSessionCta('keep', 'text'),
      h('button', { type: 'button', class: 'qz-btn-text', text: 'Retake the quiz', onclick: ctx.restart })));
    parts.push(keep);
    if (cfg.results && cfg.results.disclaimer) parts.push(h('p', { class: 'qz-disclaimer', text: cfg.results.disclaimer }));
    return wrap(parts);

    function fitLine(e) {
      var fit = PS.fitLabel(cfg, e.percent);
      return h('p', { class: 'qz-fit' },
        h('span', { class: 'qz-fit-chip is-' + fit.id, text: fit.label }),
        h('span', { class: 'qz-fit-pct', text: e.percent + '% match' }));
    }

    /* ----- helpers ----- */

    function wrap(children) {
      return h('section', { class: 'qz-card qz-results qz-path-results', 'aria-labelledby': uid + '-result' }, children);
    }

    function actionsView() {
      return h('div', { class: 'qz-actions qz-actions-center qz-no-print' },
        h('button', { type: 'button', class: 'qz-btn qz-btn-ghost', text: 'Retake the quiz', onclick: ctx.restart }));
    }

    // Open all rows for printing.
    function printResults() {
      var root = document.getElementById(uid + '-result');
      var card = root && root.closest('.qz-results');
      var closed = card ? Array.prototype.slice.call(card.querySelectorAll('details:not([open])')) : [];
      closed.forEach(function (d) { d.open = true; });
      try { global.print(); } catch (e) { /* ignore */ }
      closed.forEach(function (d) { d.open = false; });
    }

    function upperFirst(t) { t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); }
    function periodLabel(p) { return /^\d+-\d+$/.test(p) ? 'Days ' + p.replace('-', '–') : p; }

    /* ----- "Email me my results" form ----- */

    function reportForm(onCancel) {
      var lc = ctx.lc;
      var state = { busy: false, done: false };
      var wrapEl = h('section', { class: 'qz-capture', 'aria-labelledby': uid + '-lead-h' });

      function field(name, label, type, autocomplete, required, hint) {
        var id = uid + '-f-' + name;
        var err = h('p', { class: 'qz-field-error', id: id + '-err', hidden: true });
        var input = h('input', { class: 'qz-text', id: id, name: name, type: type, autocomplete: autocomplete, 'aria-describedby': id + '-err', 'aria-required': required ? 'true' : null, inputmode: type === 'tel' ? 'tel' : null });
        return { input: input, err: err, node: h('div', { class: 'qz-field' }, h('label', { for: id, text: label + (required ? '' : ' (optional)') }), hint && h('p', { class: 'qz-field-hint', text: hint }), input, err) };
      }

      var nameF = lc.collectName ? field('name', 'Name', 'text', 'name', !!lc.nameRequired) : null;
      if (nameF && ctx.name) nameF.input.value = ctx.name;
      var emailF = field('email', 'Email address', 'email', 'email', true);
      var waF = lc.collectWhatsApp ? field('whatsapp', 'WhatsApp number', 'tel', 'tel', false, 'Include your country code, for example +234…') : null;

      var optIns = lc.optIns || {};
      var emailOpt = optIns.email && h('input', { type: 'checkbox', id: uid + '-f-optin-email', name: 'email_marketing_optin' });
      var waOpt = waF && optIns.whatsapp && h('input', { type: 'checkbox', id: uid + '-f-optin-wa', name: 'whatsapp_marketing_optin' });
      var waOptRow = waOpt && h('label', { class: 'qz-check', for: uid + '-f-optin-wa', hidden: true }, waOpt, h('span', { text: optIns.whatsapp.text }));
      if (waF && waOptRow) {
        waF.input.addEventListener('input', function () {
          var has = waF.input.value.trim() !== '';
          waOptRow.hidden = !has;
          if (!has) waOpt.checked = false;
          ctx.queueHeight();
        });
      }

      var formError = h('p', { class: 'qz-form-error', role: 'alert', hidden: true });
      var submit = h('button', { type: 'submit', class: 'qz-btn qz-btn-primary', text: lc.submitLabel || 'Email my full results' });

      var form = h('form', { class: 'qz-lead-form', novalidate: true },
        nameF && nameF.node, emailF.node, waF && waF.node,
        (emailOpt || waOpt) && h('fieldset', { class: 'qz-optins' },
          h('legend', { class: 'qz-legend', text: 'Optional updates (off unless you tick them)' }),
          emailOpt && h('label', { class: 'qz-check', for: uid + '-f-optin-email' }, emailOpt, h('span', { text: optIns.email.text })),
          waOptRow),
        formError,
        h('div', { class: 'qz-actions' }, submit, h('button', { type: 'button', class: 'qz-btn qz-btn-ghost', text: 'Cancel', onclick: function () { if (!state.busy) onCancel(); } })),
        lc.privacyNotice && h('p', { class: 'qz-privacy' }, lc.privacyNotice.text + ' ',
          lc.privacyNotice.url && h('a', { href: ctx.Core.safeUrl(lc.privacyNotice.url), target: '_blank', rel: 'noopener noreferrer', text: 'Privacy policy' })));

      function setErr(f, msg) {
        f.err.hidden = !msg; f.err.textContent = msg || '';
        if (msg) f.input.setAttribute('aria-invalid', 'true'); else f.input.removeAttribute('aria-invalid');
      }

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (state.busy || state.done || ctx.isDestroyed()) return;
        formError.hidden = true;
        var bad = [];
        var name = nameF ? nameF.input.value.trim() : '';
        var email = emailF.input.value.trim();
        var wa = waF ? waF.input.value.trim() : '';
        if (nameF) { var nameBad = !!lc.nameRequired && !name; setErr(nameF, nameBad ? 'Please enter your name.' : ''); if (nameBad) bad.push(nameF.input); }
        if (!email) { setErr(emailF, 'Please enter your email address.'); bad.push(emailF.input); }
        else if (!ctx.Core.isValidEmail(email)) { setErr(emailF, 'That email address doesn’t look right.'); bad.push(emailF.input); }
        else setErr(emailF, '');
        if (waF) {
          var waBad = wa !== '' && !/^\+?[0-9][0-9 ()\-]{6,19}$/.test(wa);
          setErr(waF, waBad ? 'Enter a number with its country code, like +234 801 234 5678.' : '');
          if (waBad) bad.push(waF.input);
        }
        if (bad.length) { bad[0].focus(); return; }

        state.busy = true;
        submit.disabled = true; submit.textContent = 'Sending…';
        form.setAttribute('aria-busy', 'true');

        var payload = PS.leadPayload(cfg, {
          leadId: ctx.leadId, startedAt: ctx.startedAt, completedAt: ctx.completedAt, now: new Date().toISOString(),
          answers: ctx.answers, result: r, courseInterest: ctx.courseInterest,
          privacyNoticeVersion: lc.privacyNoticeVersion,
          form: { name: name, email: email, whatsapp: wa, emailOptIn: !!(emailOpt && emailOpt.checked), whatsappOptIn: !!(waOpt && waOpt.checked) }
        });

        Promise.resolve().then(function () { return ctx.leadSubmitter(payload); }).then(function () {
          if (ctx.isDestroyed()) return;
          state.done = true; state.busy = false;
          wrapEl.textContent = '';
          wrapEl.appendChild(h('p', { class: 'qz-success', role: 'status', text: lc.successMessage || 'Thanks, you’re all set.' }));
          ctx.emit('lead:submitted', {});
          ctx.queueHeight();
        }, function () {
          if (ctx.isDestroyed()) return;
          state.busy = false;
          submit.disabled = false; submit.textContent = lc.submitLabel || 'Email my full results';
          form.removeAttribute('aria-busy');
          formError.textContent = 'Sorry, that didn’t go through. Please check your connection and try again.';
          formError.hidden = false;
          ctx.emit('lead:failed', {});
          ctx.queueHeight();
        });
      });

      wrapEl.appendChild(h('h4', { id: uid + '-lead-h', class: 'qz-lead-h', text: 'Where should we send your results?' }));
      if (lc.description) wrapEl.appendChild(h('p', { class: 'qz-muted', text: lc.description }));
      wrapEl.appendChild(form);
      return wrapEl;
    }
  }

  global.QuizWidgetRenderers = global.QuizWidgetRenderers || {};
  global.QuizWidgetRenderers.pathway = render;
}(window));

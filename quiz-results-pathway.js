/*
 * quiz-results-pathway.js — result screen for `type: 'pathway'` quizzes (the Career Compass).
 * Registered as window.QuizWidgetRenderers.pathway and called by quiz-engine.js with a context
 * object (DOM helper `h`, the scored result, the visitor's answers, event hooks, lead submitter).
 * Like the rest of the widget it only ever inserts text with textContent.
 *
 * Screen order: best match -> two alternatives -> readiness summary -> optional email form.
 * Supporting details are included in the full report payload, rather than the summary screen.
 */
(function (global) {
  'use strict';

  var KIND_LABEL = { interests: 'Interest', experience: 'Experience', strengths: 'Strength', tools: 'Tool' };

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
      var attrs = { class: 'qz-btn ' + (opts.style === 'ghost' ? 'qz-btn-ghost' : 'qz-btn-primary'), href: url, 'aria-describedby': descId };
      if (mode === 'new-tab') { attrs.target = '_blank'; attrs.rel = 'noopener noreferrer'; }
      else if (mode === 'top') { attrs.target = '_top'; attrs.rel = 'noopener'; }
      var a = h('a', attrs, opts.label);
      a.addEventListener('click', function (e) {
        ctx.trackCta({ kind: opts.kind, pathwayId: opts.pathway ? opts.pathway.id : null, url: url, placement: opts.placement });
        // "host" mode: the embedding page decides what happens, the widget does not navigate.
        if (mode === 'host') e.preventDefault();
      });
      return h('div', { class: 'qz-cta' }, a,
        h('p', { id: descId, class: 'qz-cta-dest', text: destination(opts.kind, opts.pathway ? opts.pathway.name : '') }));
    }

    function bootcampCta(entry, placement, style) {
      return ctaLink({
        kind: 'bootcamp', pathway: entry.pathway, placement: placement, style: style,
        label: 'Explore this bootcamp',
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
        h('p', { class: 'qz-badge', text: 'Your result' }),
        h('h2', { id: uid + '-result', class: 'qz-result-title', tabindex: '-1', 'data-focus': true, text: 'Not enough information to recommend a pathway' }),
        h('p', { class: 'qz-lead', text: 'Your answers didn’t point to a clear match yet. That usually means none of the skills, tools or activities listed applied. Retake the quiz and pick what fits you, or talk it through with an adviser.' }),
        infoSessionCta('insufficient', 'primary')));
      parts.push(actionsView());
      return wrap(parts);
    }

    /* ----- hero: best match ----- */

    var best = r.top[0];
    var ring = h('div', { class: 'qz-ring', 'aria-hidden': 'true' });
    ring.style.setProperty('--p', String(best.percent));
    var panel = h('aside', { class: 'qz-panel', 'aria-label': 'Your top match' },
      h('p', { class: 'qz-panel-label', text: 'Your top match' }),
      h('div', { class: 'qz-ring-wrap' }, ring, h('div', { class: 'qz-ring-text' }, h('span', { class: 'qz-ring-pct', text: best.percent + '%' }))),
      h('p', { class: 'qz-panel-sub', text: 'match with your answers' }));

    var reasons = best.reasons.slice(0, 4);
    var main = h('div', { class: 'qz-result-main' },
      h('p', { class: 'qz-badge', text: 'Your best-fit pathway' }),
      h('h2', { id: uid + '-result', class: 'qz-result-title', tabindex: '-1', 'data-focus': true, text: best.pathway.name }),
      h('p', { class: 'qz-lead', text: 'Built around: ' + best.pathway.signals + '.' }),
      reasons.length > 0 && h('div', { class: 'qz-topics' },
        h('h3', { class: 'qz-h3', text: 'Why this fits you' }),
        h('ul', { class: 'qz-benefits qz-reasons' }, reasons.map(function (x) {
          return h('li', {}, h('span', { class: 'qz-tick', 'aria-hidden': 'true' }),
            h('span', {}, h('span', { class: 'qz-reason-kind', text: KIND_LABEL[x.dimension] + ': ' }), x.text));
        }))),
      bootcampCta(best, 'hero', 'primary'));
    parts.push(h('div', { class: 'qz-result-top' }, panel, main));

    /* ----- alternatives: names and matches only ----- */

    if (r.top.length > 1) {
      parts.push(h('section', { class: 'qz-summary-section', 'aria-labelledby': uid + '-others' },
        h('h3', { id: uid + '-others', class: 'qz-summary-heading', text: 'Other pathways to consider' }),
        h('ol', { class: 'qz-summary-pathways' }, r.top.slice(1).map(function (e) {
          return h('li', {},
            h('h4', { class: 'qz-summary-pathway', text: e.pathway.name }),
            h('span', { class: 'qz-summary-match', text: e.percent + '% match' }));
        }))));
    }

    parts.push(h('section', { class: 'qz-summary-section', 'aria-labelledby': uid + '-ready' },
      h('h3', { id: uid + '-ready', class: 'qz-summary-heading', text: 'Your training readiness' }),
      h('p', { class: 'qz-muted' },
        h('strong', { class: 'qz-summary-readiness', text: r.readiness.label + '. ' }), r.readiness.summary)));

    /* ----- one email action; the form opens only when requested ----- */

    var emailSection = h('section', { class: 'qz-summary-email qz-no-print', 'aria-labelledby': uid + '-email' });
    var actions = h('div', { class: 'qz-actions qz-summary-actions' });
    if (ctx.lc && ctx.leadSubmitter) {
      var form = reportForm(function () {
        form.hidden = true;
        emailButton.hidden = false;
        emailButton.setAttribute('aria-expanded', 'false');
        emailButton.focus();
        ctx.queueHeight();
      });
      form.id = uid + '-report-form';
      form.hidden = true;
      var emailButton = h('button', {
        type: 'button', class: 'qz-btn qz-btn-primary', text: 'Email my full results',
        'aria-expanded': 'false', 'aria-controls': form.id,
        onclick: function () {
          form.hidden = false;
          emailButton.hidden = true;
          emailButton.setAttribute('aria-expanded', 'true');
          form.querySelector('input').focus();
          ctx.queueHeight();
        }
      });
      emailSection.appendChild(h('h3', { id: uid + '-email', class: 'qz-summary-heading', text: 'Keep your full results' }));
      emailSection.appendChild(h('p', { class: 'qz-muted', text: 'We’ll email your pathway breakdown, skills to build and personalised 90-day plan.' }));
      actions.appendChild(emailButton);
      emailSection.appendChild(form);
    } else {
      emailSection.appendChild(h('h3', { id: uid + '-email', class: 'qz-summary-heading', text: 'Talk through your results' }));
      emailSection.appendChild(infoSessionCta('next-step', 'primary'));
    }
    actions.appendChild(h('button', { type: 'button', class: 'qz-btn qz-btn-ghost', text: 'Retake the quiz', onclick: ctx.restart }));
    emailSection.appendChild(actions);
    parts.push(emailSection);
    if (cfg.results && cfg.results.disclaimer) parts.push(h('p', { class: 'qz-disclaimer', text: cfg.results.disclaimer }));
    return wrap(parts);

    /* ----- helpers ----- */

    function wrap(children) {
      return h('section', { class: 'qz-card qz-results qz-path-results', 'aria-labelledby': uid + '-result' }, children);
    }

    function actionsView() {
      return h('div', { class: 'qz-actions qz-actions-center qz-no-print' },
        !r.insufficient && h('button', { type: 'button', class: 'qz-btn qz-btn-ghost', onclick: function () { try { global.print(); } catch (e) { /* ignore */ } } }, 'Save my results'),
        h('button', { type: 'button', class: 'qz-btn qz-btn-ghost', text: 'Retake the quiz', onclick: ctx.restart }));
    }

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

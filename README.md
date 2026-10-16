# Quiz widget

A small, framework-free, embeddable quiz for audience engagement and lead generation: intro → one question at a time → results with explanations and a call to action → optional lead capture → retry. Plain HTML, CSS and vanilla JS. No build step, no dependencies, no tracking, no backend.

> `quiz-config.js` is now the **RKY Career Compass** (`type: 'pathway'`). The older "web fundamentals" knowledge quiz lives in `examples/knowledge-config.js` (page: `examples/knowledge.html`). All URLs in the Compass config are `example.com` **placeholders**.

## Career Compass (pathway quiz)

Recommends the top three RKY Careers bootcamp pathways from experience, interests, strengths and tools, shows a separate training-readiness label, a 90-day plan, and an optional "email me my results" form.

**Source of truth.** The stakeholder workbook (`RKY_Career_Compass_Quiz_and_Scoring_Spec (1).xlsx`) holds question wording, answer ids, the 0-3 scoring matrix, weights, avoidance penalties, the pathway catalogue and the 90-day templates. `compass-data.js` is **generated** from it (stdlib Python, no install):

```bash
python3 tools/build-compass-data.py "RKY_Career_Compass_Quiz_and_Scoring_Spec (1).xlsx"
```

The workbook is **not stored in this repo** (it is git-ignored). Get the current copy from the project owner, save it in the repo root, and re-run the command above whenever the spec changes. The site itself only needs the committed `compass-data.js`, so deploys and tests don't depend on the workbook.

Things the workbook only describes in prose (display conditions, exclusive answers, stage grouping) are encoded in `tools/build-compass-data.py`; copy, links, readiness thresholds and lead settings are in `quiz-config.js`.

**Load order** (see `index.html`): `quiz-core.js`, `pathway-scoring.js`, `compass-data.js`, `quiz-config.js`, `quiz-results-pathway.js`, `quiz-engine.js`.

**Scoring** (`pathway-scoring.js`, pure, also runs in Node so a backend can re-score answer ids):

- Only Q05 (experience), Q09 (interests), Q06 (strengths), Q07 (tools) score. Industry, goals, location and UK answers never change the match.
- Per pathway each dimension is 0-100: experience = top 4 points / 12; interests = points / (3 x picks); strengths = top 3 / 9; tools = top 3 / 9.
- `final = 0.35 exp + 0.30 int + 0.20 str + 0.15 tools - avoidance penalty` (10 points for the matching Q12 answer), floored at 0.
- Ties: higher interests, then higher experience, then DATA, PM, BA, AML, AI, CYBER, VA.
- No scored signal: "Not enough information", no match %, info-session CTA only.
- Readiness (Getting started / Building momentum / Well prepared to train) is separate from the match and is **training** readiness, not job readiness. The point scale and thresholds are a proposal in `config.pathway.readiness`, because the workbook gives no formula.
- Workbook ambiguity resolved: "experience max(top 4 score)/12" is implemented as the **sum** of the top four points divided by 12.

**Questions.** `showIf` conditions (`{ q, in: [...] }`, `{ any: [...] }`, `{ all: [...] }`, earlier questions only), `maxSelections` with a live counter, `exclusive` answers ("None of these" clears the rest), `type: 'text'` with `maxLength`, `prefill`, and an optional note under a question (`note`). Hidden questions are skipped, and answers to questions that become hidden are dropped from scoring and from the payload. Progress is per **stage** (`config.stages`), so the bar does not jump when the UK questions appear.

**Calls to action.** Each says where it leads ("Opens the ... bootcamp page in a new tab"). `pathway.cta.target`: `'new-tab' | 'same-frame' | 'top' | 'host'`. With `'host'` the widget does **not** navigate; it only posts `cta:clicked` so the embedding site can open its own modal or route. Every click emits `cta:clicked` with `{ kind: 'bootcamp' | 'info-session', pathwayId, url, placement }`.

**Results form and payload.** Results are shown first and never gated. Nothing leaves the browser until the visitor submits the form. Fields follow the workbook's "CRM Data Fields": `lead_id` (UUID made when the quiz starts, usable as an idempotency key), `assessment_started_at`, `assessment_completed_at`, `full_name`, `email`, `whatsapp?`, `email_marketing_optin`, `whatsapp_marketing_optin` (both default `false`; WhatsApp is only recorded when a number is entered), `privacy_notice_version`, `consent_timestamp` (only when an opt-in is ticked), `answers` (answer ids; Q03 is free text), `current_role`, `location`, `target_markets`, `work_eligibility`, `sponsorship_status`, `sponsored_industry`, `sponsorship_impact`, `ninety_day_goal`, `top_three_pathways`, `scores`, `readiness_label`, `roadmap_segment`, `suggested_cta`, `course_interest` (bootcamp clicks made **before** the form was submitted), and a small `result` summary. `lead_segment` is assigned by the backend/CRM, not the widget. Declining both opt-ins still sends the results and creates the lead, flagged non-promotional.

The demo `examples/compass.html` uses a mock `onLeadSubmit` that logs the payload (email starting `fail@` simulates an error). `index.html` posts to the placeholder `leadCapture.endpoint`, which will fail until you point it at a real API.

**Suggested backend (not built).** A single `POST /v1/career-compass/leads` function (Vercel Function or Cloudflare Worker): CORS allow-list of embedding origins, bot check (Turnstile/hCaptcha), per-IP rate limit, schema validation, idempotency on `lead_id`, and **re-scoring the submitted answer ids with `pathway-scoring.js`** instead of trusting client scores. Store in Postgres as the system of record (answers, consent flags, `privacy_notice_version`, server-set consent time), then push to the CRM and send the results email from a queue so the visitor never waits on them. Keep immigration answers (Q19-Q22) apart from marketing fields, out of logs, and covered in the privacy notice. Review UK GDPR, Nigeria's NDPA and Canada's CASL; WhatsApp marketing needs WhatsApp Business opt-in compliance.

**Save my results** opens the browser print dialog with a print stylesheet that hides the form and controls.

## Project structure

```text
quiz-widget/
├── index.html          Standalone quiz page (also the iframe target)
├── styles.css          All styling, scoped under .qz, themed with --qz-* variables
├── quiz-config.js      Career Compass copy + settings  ← the file you normally edit
├── compass-data.js     GENERATED from the workbook (do not edit)
├── quiz-core.js        Pure logic: validation, conditions, knowledge/outcome scoring, URL/email checks
├── pathway-scoring.js  Pure Career Compass scoring, readiness, roadmap, lead payload
├── quiz-engine.js      UI rendering, navigation, iframe messaging
├── quiz-results-pathway.js  Career Compass result screen + results form
├── tools/              build-compass-data.py (workbook -> compass-data.js)
├── embed.html          Sample "host page" with the iframe snippet
├── embed.js            Optional host-side helper: auto-sizes the iframe
├── examples/           compass.html (mock lead handler), knowledge.html, outcome.html
└── tests/              core.test.js + pathway.test.js (Node), responsive.html (visual harness)
```

## Run locally

```bash
cd quiz-widget
python3 -m http.server 8000      # or: npx serve .
# open http://localhost:8000/            quiz
#      http://localhost:8000/embed.html  iframe host sample
#      http://localhost:8000/examples/outcome.html   outcome quiz + lead form
```

Opening `index.html` directly (`file://`) should also work because the scripts are classic scripts, not ES modules (not tested here). The iframe auto-resize and `postMessage` features need `http(s)://`, so use a server for `embed.html`.

Run the logic tests (Node 18+, no install): `node --test tests/core.test.js tests/pathway.test.js`

## Edit the quiz

Everything lives in `window.QUIZ_CONFIG` in `quiz-config.js`. Question and choice **ids are stable keys**; keep them unique and don't reuse them for different meanings.

```js
{
  id: 'my-quiz', type: 'knowledge',            // 'knowledge' | 'outcome'
  title: '…', description: '…',
  category: '…', audience: '…', estimatedMinutes: 3,   // optional
  navigation: { allowBack: true },
  questions: [{
    id: 'q1', type: 'single',                  // 'single' | 'multiple'
    text: 'Use `backticks` for inline code',
    code: 'optional code block',               // optional
    topic: 'HTML',                             // optional; drives "Worth revisiting"
    required: true,                            // default true
    points: 1,                                 // default 1 (knowledge only)
    explanation: 'Shown in the results review',
    choices: [
      { id: 'a', text: '…', correct: true },
      { id: 'b', text: '…', feedback: 'Shown if the visitor picked this wrong choice' }
    ]
  }],
  results: { … }, cta: { … }, leadCapture: { … }, theme: { … }, integration: { … }
}
```

The config is validated on load. Problems (duplicate ids, a single-choice question without exactly one `correct`, unknown outcome ids, unsafe URLs, …) show an error panel and a console error listing each issue. Nothing is silently defaulted in a way that changes scoring.

Per the stakeholder brief, **no correctness feedback appears during the quiz**. Answers, explanations and feedback appear only in the results.

## Scoring and outcomes

**Knowledge quiz** (`type: 'knowledge'`): mark choices with `correct: true`.

- Single choice: full credit only if the one selected choice is correct.
- Multiple choice: `scoring.multiple` is `'all-or-nothing'` (exact match, the default) or `'partial'` (`(correct picks − wrong picks) / correct total`, floored at 0).
- Optional questions (`required: false`) left blank score 0 and show as "Not answered".
- `results.bands[]`: `{ id, minPercent, title, summary, nextStep? }`. The highest band whose `minPercent` ≤ the score percentage wins; exactly one band must have `minPercent: 0`.

**Outcome quiz** (`type: 'outcome'`): no answer is "correct". Each choice carries `points: { outcomeId: n }`; the outcome with the most points wins. `results.outcomes[]`: `{ id, title, summary, traits?, nextStep? }`.

- **Ties** go to the outcome listed first in `results.outcomes` (`scoring.tieBreak: 'config-order'`, the only supported rule). The result screen says when it was a close call.
- If no answer awards any points, no outcome is shown (rather than a misleading default).
- Add `results.disclaimer` to state what the quiz can and can't infer. The examples do.

See `examples/outcome-config.js` for a complete outcome quiz.

## Intro copy (optional)

```js
intro: { bullets: ['A score and what it means', 'Notes on every answer'],   // shown as "What you'll get"
         note: 'Takes about 3 minutes. Your answers stay in your browser.' }
```

Only keep the `note` wording if it stays true for your setup (it is true unless you enable lead capture and the visitor submits the form).

## Theme

```js
theme: { mode: 'light',            // 'light' | 'dark' | 'auto'
         accent: '#ee7a30', accentContrast: '#111111',   // orange fills + the text colour on them
         accentText: '#b4500f',                          // orange for small text on light surfaces (optional; derived)
         ink: '#000000', shell: '#f4f3f1',               // black panels / the large outer card
         text: '#1b1d21', muted: '#5a606a', surface: '#ffffff', border: '#dcdad2',
         background: 'transparent', fontFamily: 'Georgia, serif',
         radius: '24px', maxWidth: '1280px' }
```

**Light, dark and auto.** `mode: 'dark'` swaps the whole palette. `mode: 'auto'` follows the visitor's system setting (`prefers-color-scheme`); note that inside an iframe this is the browser/OS setting, not the host page's own theme toggle. A host can also choose per embed without touching the config: `src=".../index.html?mode=dark"` (only `light`, `dark` and `auto` are accepted). Any colour you set in `theme` overrides that colour in every mode, so if you set custom `surface`/`text` colours, pick a single mode to match them. The dark score panel and its ring derive from `accent`, so changing `accent` alone re-brands the whole widget.

Only these keys are accepted (values containing `; { } < >` or `url(` are rejected). They map to `--qz-*` CSS variables, so you can also override them in your own CSS. Keep text/background pairs at WCAG AA contrast (4.5:1), including `accentContrast` on `accent`. The default palette is black, orange and white. Orange fills carry black text because white on this orange fails WCAG AA; if you re-brand with a darker accent you can set `accentContrast: '#ffffff'`. Small orange text uses `accentText`, derived automatically as a darker orange so it stays readable. To match a host brand, usually only `accent` (and maybe `accentContrast`/`ink`) needs changing. Fonts default to the system stack; no remote fonts are loaded. The page background is transparent so the widget blends into the host.

## Call to action

```js
cta: { label: 'See the plan', url: 'https://example.com/plan',
       target: 'new-tab',   // 'new-tab' | 'same-frame' | 'top'
       description: 'optional line above the button' }
```

`url` must be `https://…` (or `http://localhost` for development) or a relative path. `javascript:`, `data:`, plain `http:` and protocol-relative URLs are rejected. Inside an iframe, `'top'` navigates the whole host page, so prefer `'new-tab'` unless you mean it. `example.com` in the demo is a placeholder. Remove the `cta` block to hide it.

## Lead capture

Disabled by default. The form appears **after** the result and never gates it. Fields: email (required, format-checked), optional name (`collectName`, `nameRequired`), optional consent checkbox (`consent.required`), optional privacy notice.

```js
leadCapture: {
  enabled: true, heading: '…', description: '…', collectName: true,
  submitLabel: 'Email me the plan', successMessage: 'Thanks!',
  consent: { required: true, text: 'I agree to receive …' },
  privacyNotice: { text: '…', url: 'https://example.com/privacy' },
  endpoint: 'https://your-api.example/quiz-leads'    // option A
}
```

Choose one way to receive submissions:

- **A. `endpoint`**: the widget `POST`s JSON (`credentials: 'omit'`, 15 s timeout, 2xx = success).
- **B. Host callback**: `QuizWidget.mount(el, QUIZ_CONFIG, { onLeadSubmit: async (lead) => { … } })`. Resolve on success, throw/reject on failure. It takes precedence over `endpoint`. See `examples/outcome.html`.

Payload (knowledge and outcome quizzes): `{ quizId, email, name?, consent?, result: { kind, resultId, score?, total?, percent? } }`. These quiz types never send individual answers. The Career Compass payload is different and **does** include answer ids once the visitor submits the form; see "Career Compass" above.

**If `enabled: true` but neither an endpoint nor a callback exists, the form is not shown** and a console warning explains why. The widget never fakes a successful submission. This repo contains **no backend**: the endpoint, CORS, spam protection and consent storage are yours to provide. Nothing is saved to localStorage or put in a URL. Failures show a visible error and re-enable the form; duplicate submits are ignored while one is in flight and after success.

## Deploy as a static site

Upload the folder (at least `index.html`, `styles.css`, `quiz-core.js`, `quiz-config.js`, `quiz-engine.js`) to any static host (Netlify, Vercel, GitHub Pages, S3/CloudFront, nginx). All paths are relative, so it works at a domain root or any subpath, e.g. `https://example.com/tools/quiz/`. Serve over HTTPS.

## Embed with an iframe

```html
<iframe
  data-quiz-widget
  src="https://your-domain.example/quiz/index.html"
  title="Web fundamentals quiz"
  loading="lazy"
  style="width: 100%; min-height: 620px; border: 0;"
></iframe>
<script src="https://your-domain.example/quiz/embed.js" defer></script>
```

- `min-height: 620px` is the supported fallback: it fits a typical question on desktop and phones, and the quiz scrolls inside the frame if it's taller.
- `embed.js` (optional) auto-resizes the iframe to the content, so results show without an inner scrollbar, and removes the fallback `min-height` once it hears from the quiz. Without it, results just scroll inside the frame.
- Layout responds to the widget's own width (CSS container queries, not the page's): single column under ~720px, and a two-column intro, score panel and next-step block above it. The card is capped at `maxWidth` (1280px by default) and centred. From ~960px wide the question screen splits into question (left) and answers (right).
- The quiz fills its container's width, uses a transparent background, has no header/footer, and never touches the host DOM or styles.
- `embed.html` is a working example that has been tested at the same origin only.

## Portable version

Copy the five files listed under "Deploy" (plus `embed.js` if you want auto-sizing) into the other site. To inline on a page without an iframe:

```html
<link rel="stylesheet" href="quiz/styles.css">
<div id="quiz"></div>
<script src="quiz/quiz-core.js" defer></script>
<script src="quiz/quiz-config.js" defer></script>
<script src="quiz/quiz-engine.js" defer></script>
```

All CSS is scoped under `.qz`, but host styles that target bare elements (`button`, `h2`) can still leak in, so the iframe is the safer option. Add `data-manual` to the `#quiz` element to call `QuizWidget.mount(...)` yourself. Each call to `mount` on the same element cleanly replaces the previous instance.

## postMessage events

Only sent when the quiz runs inside an iframe, and only to **explicitly allowed origins**:

```js
integration: { allowedParentOrigins: ['https://www.your-site.example'] }  // no "*", no paths
```

The quiz also trusts its own origin. When the parent origin is known (`location.ancestorOrigins` or the referrer) it posts only to that origin, and only if it is on the list. `'*'` is never used as a target.

Messages look like `{ source: 'quiz-widget', version: 1, type, quizId, payload }`:

| type | payload |
| --- | --- |
| `quiz:started` | `{}` or `{ retry: true }` |
| `quiz:completed` | `{ kind, resultId, score?, total?, percent? }` |
| `quiz:height` | `{ height }` (px; sent on load and whenever content size changes, via `ResizeObserver`) |
| `lead:submitted` / `lead:failed` | `{}` (never contains name or email) |

Incoming: the quiz accepts only `{ source: 'quiz-widget', type: 'quiz:request-height' }`, and only from `window.parent` with an allowed origin. `embed.js` uses this so it works even if it loads after the quiz.

Host side, `embed.js` accepts a message only if `event.source` is that iframe's window **and** `event.origin` equals the iframe `src` origin, clamps heights to 320–6000 px, and re-dispatches events on the iframe:

```js
iframe.addEventListener('quiz-widget:event', e => console.log(e.detail.type, e.detail.payload));
```

For a non-iframe mount, the same events fire as `quiz-widget:event` on the mount element, and `onEvent` can be passed to `mount()`.

## Security and hosting

- All config and user text is inserted with `textContent`; there is no `innerHTML`.
- Config URLs are restricted as described above. No third-party scripts, fonts, analytics or tracking pixels are included.
- **Answers and scoring ship to the browser**, so a determined visitor can read them. This is fine for engagement and low-stakes quizzes, not for exams or anything needing a confidential answer key.
- To control who can embed the quiz, send an HTTP response header from the quiz's host. It cannot be set with a `<meta>` tag:

  ```text
  Content-Security-Policy: frame-ancestors 'self' https://www.your-site.example
  ```

  Don't use `frame-ancestors *`, and don't send `X-Frame-Options: DENY` if you want it embedded. Embedding on a real production domain has **not** been verified, because no deployment exists yet.
- The iframe needs no extra `allow` or `sandbox` permissions. If you add `sandbox`, include `allow-scripts allow-same-origin allow-popups` (the last for the new-tab CTA).
- If your host page has a strict CSP, allow the quiz origin in `frame-src`/`child-src`.

## Look and feel

A large rounded light-grey card holding white answer cards, a black score panel and black next-step band, orange actions, a segmented progress bar (with a quiet "Halfway there" / "Last one!" cue), a two-step Restart control (first tap arms it, second tap restarts; no modal dialogs), a black score panel with a ring on the results screen, and a next-step block that puts the CTA and the lead form side by side on wide widths. All of it is CSS/JS inside the widget; scoring, config and embedding are unchanged.

## Accessibility

Native radio/checkbox inputs in a labelled `fieldset`; selection is shown by a tick and a heavier border, not colour alone; correctness in the review uses a symbol plus a text label. Visible focus rings, full keyboard use (Enter submits the form, arrows move between radios), focus moves to the new heading on each step, a polite live region announces "Question n of N", a labelled `progressbar`, form errors tied to inputs with `aria-describedby`/`aria-invalid`, `prefers-reduced-motion` disables animation, and `forced-colors` has a fallback. Layout uses rem units and wrapping so it holds up at zoom and narrow widths.

## Known limitations and integration points

- No backend: lead submission needs your `endpoint` or `onLeadSubmit`. There is no persistence of progress (a reload restarts the quiz, by design for privacy).
- Question types are single choice, multiple choice and (pathway quizzes only) short text.
- One quiz per page/config. Localisation of built-in UI strings ("Continue", "Back", …) is not yet configurable.
- Not tested: Safari/Firefox (see below), screen readers, production iframe embedding.
- Future hooks: `onLeadSubmit` (CRM/email platform), `onEvent` (analytics, your choice), `integration.allowedParentOrigins`.

## Verification status

- **Run and passing:** `node --test tests/core.test.js tests/pathway.test.js` (50 tests): the original 21 scoring/validation tests, the 8 workbook acceptance scenarios, normalisation and clamping, tie-break chain, penalty floor, conditional visibility and stale-answer pruning, selection limits and exclusive answers, readiness, roadmap segment, and the consent/payload rules. `compass-data.js` regenerates byte-for-byte from the workbook.
- **Checked manually in Chrome (Compass):** UK path with all 23 questions and the non-UK path (19), skip on optional questions, prefill of Q20, Q18->Q19 count change, exclusive answers, the 3-choice limit counter and disabled options, stage progress, results screen, results form (validation, fail and retry, success, opt-in payload), 320/390/768/1100 px with no horizontal overflow once animations settle, the knowledge and outcome examples still working.
- **Cross-origin iframe (three localhost origins):** `quiz:completed`, `quiz:height` and `cta:clicked` reach an allowed host; a host not on `allowedParentOrigins` receives none; `embed.js` auto-resizes; `target: 'host'` does not navigate the frame.
- **Not run:** Firefox/Safari, assistive-technology testing, a real keyboard Tab traversal of the Compass, print output (the print stylesheet is untested), a real backend, a production domain.

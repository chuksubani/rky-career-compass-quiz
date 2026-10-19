# RKY Career Compass

An embeddable quiz that recommends the three best-fit RKY Careers bootcamp pathways, shows a training-readiness label and a 90-day plan, and offers to email the results.

Plain HTML, CSS and JavaScript. No build step, no dependencies, no tracking, no backend.

- **Live:** https://rky-career-compass-quiz.vercel.app/
- **Demo with a working lead form:** `/examples/compass.html` (uses a mock handler)

> **Placeholders.** Every link in `quiz-config.js` (bootcamps, info session, privacy) and the lead endpoint point to `example.com`. Replace them before launch.

## Contents

1. [Quick start](#quick-start)
2. [How it works](#how-it-works)
3. [Common tasks](#common-tasks)
4. [Embed on another site](#embed-on-another-site)
5. [Lead form and data](#lead-form-and-data)
6. [Events](#events)
7. [Deploy](#deploy)
8. [Other quiz types](#other-quiz-types)
9. [Security and privacy](#security-and-privacy)
10. [Testing and known gaps](#testing-and-known-gaps)

## Quick start

```bash
cd quiz-widget
python3 -m http.server 8000
```

| Open | What it is |
| --- | --- |
| `http://localhost:8000/` | The quiz |
| `http://localhost:8000/examples/compass.html` | The quiz with a mock lead handler |
| `http://localhost:8000/embed.html` | A sample host page with the quiz in an iframe |

Run the tests (Node 18+, nothing to install):

```bash
node --test tests/core.test.js tests/pathway.test.js
```

## How it works

### Files

| File | Purpose |
| --- | --- |
| `quiz-config.js` | Copy, links, theme, readiness levels, lead settings. **The file you normally edit.** |
| `compass-data.js` | Questions, scoring matrix, pathways, 90-day templates. **Generated. Do not edit.** |
| `pathway-scoring.js` | Scoring, readiness, roadmap, lead payload. Pure logic, also runs in Node. |
| `quiz-core.js` | Config validation, conditional questions, URL and email checks. |
| `quiz-engine.js` | Screens, navigation, events. |
| `quiz-results-pathway.js` | Results screen and the results form. |
| `styles.css` | All styling, scoped under `.qz`. |
| `index.html` | The quiz page (also the iframe target). |
| `embed.js`, `embed.html` | Optional iframe auto-resize helper and a sample host page. |
| `tools/build-compass-data.py` | Turns the workbook into `compass-data.js`. |
| `examples/`, `tests/` | Demos and tests. |

Scripts must load in this order (see `index.html`): `quiz-core.js`, `pathway-scoring.js`, `compass-data.js`, `quiz-config.js`, `quiz-results-pathway.js`, `quiz-engine.js`.

### The visitor's journey

1. **Intro**, then **19 to 23 questions** in six stages. The UK work questions (Q19–Q22) only appear when relevant. Progress counts within each stage ("About you · 2 of 5"), so the total never jumps. Single-choice answers picked by mouse or touch move on automatically after a short pause (`navigation.autoAdvance`). Keyboard users confirm with Continue, and Back is always available. On phones, Back and Continue stay pinned below long answer lists. Q07 (tools) uses a compact chip layout (`layout: 'chips'` in `quiz-config.js`), and on wide screens Back/Continue sit directly under the answers.
2. A short "Matching your answers…" moment, then the **results**, shown straight away and never gated:
   - **Best fit:** a simple line illustration for the pathway, its name, a fit label (Strong / Good / Possible, set by `pathway.fitLabels`: 45+, 30–44, under 30) next to the workbook's match percentage, three "why it fits" chips and one bootcamp button.
   - **Your top 3:** rows with a relative bar. Open one to see skills to build, roles, a portfolio idea and its bootcamp link.
   - **Your 90-day plan:** the segment's rows from the workbook's "90 Day Templates", tailored lines, and the UK guidance when relevant.
   - **Training readiness** on a three-step scale.
   - **Keep your results:** "Email it to me" (optional form, opt-ins off by default), "Save as PDF" (prints with every detail open), then quiet links to book an information session or retake the quiz.

The email payload still includes the full `report` object. Your email backend must validate answers, reconstruct the report and deliver the email; this static widget does not send email itself. `/examples/compass.html` uses a mock submitter and sends no email.

### Scoring rules

Only four questions score: Q05 (experience), Q09 (interests), Q06 (strengths), Q07 (tools). Industry, goals, location and UK answers never change the match.

| Dimension | Weight | Score (0–100) |
| --- | --- | --- |
| Experience | 35% | top 4 selected points ÷ 12 |
| Interests | 30% | points ÷ (3 × number picked) |
| Strengths | 20% | top 3 points ÷ 9 |
| Tools | 15% | top 3 points ÷ 9 |

- **Final match** = weighted total − 10 if the visitor said they want to avoid that pathway's activity (Q12). Never below 0.
- **Ties:** higher interests, then higher experience, then DATA, PM, BA, AML, AI, CYBER, VA.
- **No scored answers:** "Not enough information", no percentage, and only the info-session CTA.
- **Readiness** (Getting started, Building momentum, Well prepared to train) is separate from the match. It means training readiness, not job readiness.

Two decisions the workbook did not settle, both for stakeholder sign-off:

- The workbook says "experience max(top 4 score)/12". It is implemented as the **sum** of the top four points ÷ 12.
- The workbook gives no readiness formula. The points and thresholds in `config.pathway.readiness` are a proposal.

### Source of truth: the workbook

The stakeholder workbook (`RKY_Career_Compass_Quiz_and_Scoring_Spec (1).xlsx`) holds the question wording, answer IDs, scoring matrix, weights, penalties, pathway catalogue and 90-day templates.

- It is **not in this repo** (git-ignored). Get the current copy from the project owner and save it in the repo root.
- After any spec change, regenerate the data:

  ```bash
  python3 tools/build-compass-data.py "RKY_Career_Compass_Quiz_and_Scoring_Spec (1).xlsx"
  ```

- The site and the tests only need the committed `compass-data.js`, so deploys never depend on the workbook.
- Rules the workbook only describes in prose (when questions show, which answers are exclusive) live in `tools/build-compass-data.py`.

## Common tasks

| I want to… | Do this |
| --- | --- |
| Change a bootcamp, info-session or privacy link | `quiz-config.js`: `pathway.cta` and `leadCapture.privacyNotice.url` |
| Change wording, readiness levels or "Tailored for you" lines | `quiz-config.js` |
| Change a question, answer or score | Edit the workbook, then re-run the generator |
| Change the colours | `theme` in `quiz-config.js` (see [Theme](#theme)) |
| Change the link preview (WhatsApp, Slack) | `og:` tags in `index.html`, and `og-image.png` (1200×630) |
| Point the form at a real API | `leadCapture.endpoint` in `quiz-config.js` |
| Let another site embed it | Add its origin to `integration.allowedParentOrigins` |

### Calls to action

Every CTA states where it leads, for example "Opens the … bootcamp page in a new tab". Set `pathway.cta.target`:

| Value | Behaviour |
| --- | --- |
| `new-tab` (default) | Opens in a new tab |
| `same-frame` | Opens inside the iframe |
| `top` | Navigates the whole host page |
| `host` | The widget does **not** navigate. It only sends `cta:clicked`, and the host site decides what happens. |

URLs must be `https://` (or `http://localhost` in development) or a relative path.

### Theme

```js
theme: { mode: 'light',            // 'light' | 'dark' | 'auto'
         accent: '#ee7a30', accentContrast: '#111111',
         ink: '#000000', shell: '#f4f3f1',
         text: '#1b1d21', muted: '#5a606a', surface: '#ffffff', border: '#dcdad2',
         fontFamily: 'Georgia, serif', radius: '24px', maxWidth: '1280px' }
```

- Changing `accent` alone re-brands the whole widget.
- A host can pick the mode per embed: `src=".../index.html?mode=dark"`.
- Keep text on background at WCAG AA contrast (4.5:1). Orange fills use black text because white on this orange fails.
- Unknown keys, and values containing `; { } < >` or `url(`, are rejected.

### Question options (pathway quizzes)

Questions come from `compass-data.js`. These fields are available:

- `showIf`: show only when earlier answers match, using `{ q, in: [...] }`, `{ any: [...] }` or `{ all: [...] }`. Hidden questions are skipped, and their answers are dropped.
- `maxSelections`: limit with a live "2 of 3 selected" counter.
- `exclusive`: "None of these" style answers that clear the others.
- `type: 'text'` with `maxLength`; `prefill`; `note` (small text under the question).
- Progress is per stage (`config.stages`), so the bar doesn't jump when the UK questions appear.

The config is validated on load. Problems show an error panel and a console error listing every issue.

## Embed on another site

```html
<iframe
  data-quiz-widget
  src="https://rky-career-compass-quiz.vercel.app/"
  title="RKY Career Compass"
  loading="lazy"
  style="width: 100%; min-height: 620px; border: 0;"
></iframe>
<script src="https://rky-career-compass-quiz.vercel.app/embed.js" defer></script>
```

- `embed.js` is optional. It resizes the iframe to the content, so there's no inner scrollbar.
- The layout responds to the widget's own width, not the page's.
- The quiz never touches the host page's DOM or styles. The iframe needs no `allow` or `sandbox` settings. If you add `sandbox`, include `allow-scripts allow-same-origin allow-popups`.
- To receive events, add the host's origin to the allow-list in `quiz-config.js`:

  ```js
  integration: { allowedParentOrigins: ['https://www.your-site.example'] }  // no "*", no paths
  ```

To control who may embed it, send this header from your host. It can't be set in a `<meta>` tag:

```text
Content-Security-Policy: frame-ancestors 'self' https://www.your-site.example
```

**Inline instead of an iframe:** include `styles.css` and all six scripts in the order above, and add `<div id="quiz"></div>`. Host styles that target bare elements (`button`, `h2`) can leak in, so the iframe is safer.

## Lead form and data

Results always show first. **Nothing leaves the browser until the visitor submits the form.**

### Connect it

Choose one:

- **Endpoint:** set `leadCapture.endpoint`. The widget POSTs JSON (no cookies, 15 s timeout, any 2xx counts as success).
- **Host callback:** `QuizWidget.mount(el, QUIZ_CONFIG, { onLeadSubmit: async (lead) => { … } })`. Resolve on success, throw on failure. It takes priority over `endpoint`. See `examples/compass.html`.

If neither exists, the form is hidden and a console warning says why. The widget never fakes a successful submit.

### What is sent

Field names follow the workbook's "CRM Data Fields":

| Group | Fields |
| --- | --- |
| Lead | `lead_id` (UUID made when the quiz starts, usable as an idempotency key), `full_name`, `email`, `whatsapp` (optional) |
| Consent | `email_marketing_optin`, `whatsapp_marketing_optin` (both default `false`), `privacy_notice_version`, `consent_timestamp` (only when an opt-in is ticked) |
| Timing | `assessment_started_at`, `assessment_completed_at` |
| Answers | `answers` (answer IDs; Q03 is free text), `current_role`, `location`, `target_markets`, `ninety_day_goal` |
| UK (only if asked) | `work_eligibility`, `sponsorship_status`, `sponsored_industry`, `sponsorship_impact` |
| Result | `top_three_pathways`, `scores`, `readiness_label`, `roadmap_segment`, `suggested_cta`, `course_interest`, `result`, `report` |

- `course_interest` lists bootcamp clicks made **before** the form was submitted.
- `lead_segment` is **not** sent. The backend or CRM assigns it.
- Declining both opt-ins still sends the results and creates the lead, flagged non-promotional.
- A WhatsApp opt-in is only recorded when a number is entered.

### Suggested backend (not built)

One `POST /v1/career-compass/leads` function (Vercel Function or Cloudflare Worker):

1. Allow-list the embedding origins (CORS), check for bots (Turnstile or hCaptcha), rate-limit per IP, validate the schema.
2. Make it idempotent on `lead_id`.
3. **Re-score the submitted answer IDs with `pathway-scoring.js`.** Don't trust client scores.
4. Store in Postgres as the system of record: answers, consent flags, `privacy_notice_version` and a server-set consent time.
5. Push to the CRM and send the results email from a queue, so the visitor never waits.

Keep immigration answers (Q19–Q22) apart from marketing fields, out of logs, and covered in the privacy notice. Review UK GDPR, Nigeria's NDPA and Canada's CASL. WhatsApp marketing needs WhatsApp Business opt-in compliance.

## Events

The widget sends events to the host page. Inside an iframe they go **only to allowed origins**, never `*`. The same events also fire as `quiz-widget:event` on the mount element, and `onEvent` can be passed to `mount()`.

Shape: `{ source: 'quiz-widget', version: 1, type, quizId, payload }`

| type | payload |
| --- | --- |
| `quiz:started` | `{}` or `{ retry: true }` |
| `quiz:completed` | `{ kind, resultId, percent, readiness }` |
| `cta:clicked` | `{ kind: 'bootcamp' \| 'info-session', pathwayId, url, placement }` |
| `quiz:height` | `{ height }` in px, sent on load and whenever the content size changes |
| `lead:submitted`, `lead:failed` | `{}` (never contains a name or email) |

On the host, `embed.js` accepts a message only from that iframe's window **and** the iframe's origin, clamps heights to 320–6000 px, and re-dispatches events on the iframe:

```js
iframe.addEventListener('quiz-widget:event', e => console.log(e.detail.type, e.detail.payload));
```

The quiz accepts one incoming message, `quiz:request-height`, and only from its parent on the allow-list.

## Deploy

It's a static site. Upload the folder to any static host, over HTTPS. All paths are relative, so it works at a root or a subpath.

- **Publish at least:** `index.html`, `styles.css`, the six scripts, and `og-image.png`. Add `embed.js` if hosts will embed it.
- **Vercel (current setup):** import the repo, framework preset "Other", no build command. `.vercelignore` keeps `tests/`, `tools/`, the workbook and this README out of the public site.
- **Link preview:** `index.html` has Open Graph tags and `og-image.png`. If the domain changes, update the two `og:` URLs. WhatsApp caches previews, so add `?v=2` to the link to force a refresh.

## Other quiz types

The widget also supports two simpler types, kept as examples and regression tests. Both are used by setting `type` in a config.

**Knowledge quiz** (`examples/knowledge-config.js`, `examples/knowledge.html`)

- Mark correct choices with `correct: true`.
- Multiple choice scores `'all-or-nothing'` (default) or `'partial'`.
- Result bands are matched on percentage, and exactly one band must start at 0.
- Answers, explanations and feedback appear only in the results.

**Outcome quiz** (`examples/outcome-config.js`, `examples/outcome.html`)

- Each choice adds points to named outcomes, and the highest total wins.
- Ties go to the outcome listed first. If nothing scores, no outcome is shown.
- These two types send only `{ quizId, email, name?, consent?, result }` to the lead endpoint, never individual answers.

## Security and privacy

- All text is inserted with `textContent`. There is no `innerHTML`.
- No third-party scripts, fonts, analytics or tracking pixels.
- Config URLs are restricted: `javascript:`, `data:`, plain `http:` and protocol-relative URLs are rejected.
- **Answers and scoring ship to the browser**, so a determined visitor can read them. That's fine here, but not for exams.
- Nothing is saved to localStorage or put in a URL. A reload restarts the quiz.
- UK work-permission answers never affect the match, and the results say they aren't legal advice.

## Testing and known gaps

**Run and passing:** 50 Node tests: the original 21, the 8 workbook acceptance scenarios, scoring maths, tie-breaks, penalty floor, conditional questions, limits and exclusive answers, readiness, roadmap and consent rules. `compass-data.js` regenerates byte-for-byte from the workbook.

**Checked by hand in Chrome:**
- Full flow on the UK path (23 questions) and the non-UK path (19).
- The results form: validation, error and retry, success, opt-in payload.
- 320 / 390 / 768 / 1100 px with no horizontal overflow.
- A cross-origin iframe: events reach an allowed host and none reach an unlisted one, `embed.js` resizes, and `host` mode doesn't navigate.

**Not tested:**
- Firefox and Safari.
- Screen readers and a full keyboard-only pass.
- Print output ("Save my results" uses a print stylesheet).
- The live Vercel site in a browser (files were checked to match, and the flow was not run there).
- A real backend.
- WhatsApp preview rendering.

**Limitations:**
- No backend is included.
- One quiz per page.
- Built-in UI text ("Continue", "Back") isn't configurable yet.
- Pathway quizzes are the only type with text questions and conditional questions.

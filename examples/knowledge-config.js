/*
 * EXAMPLE knowledge quiz (kept as a regression fixture and a copy-paste starting point).
 * quiz-config.js — all quiz content and settings. Edit this file; you should not
 * need to touch quiz-engine.js. The demo below is ILLUSTRATIVE content.
 *
 * Shape (see README for the full reference):
 *   id, type ('knowledge' | 'outcome'), title, description, category, audience, estimatedMinutes
 *   questions[]: { id, type: 'single'|'multiple', text, code?, topic?, required?, points?, explanation?,
 *                  choices[]: { id, text, correct? (knowledge), feedback? (knowledge), points? (outcome) } }
 *   scoring:     { multiple: 'all-or-nothing' | 'partial', tieBreak: 'config-order' }
 *   results:     knowledge -> { bands: [...] }   outcome -> { outcomes: [...] }, plus optional disclaimer
 *   cta, leadCapture, navigation, theme, integration
 */
window.QUIZ_CONFIG = {
  id: 'web-foundations-v1',
  type: 'knowledge',
  title: 'How solid are your web fundamentals?',
  description: 'Six quick questions on HTML, CSS, JavaScript, HTTP and security. See where you are strong and what to brush up on next.',
  category: 'Web development',
  audience: 'Beginners to working developers',
  estimatedMinutes: 3,

  // Optional. Short reassurance and a "what you'll get" list on the intro screen.
  intro: {
    bullets: [
      'A score and what it means for you',
      'Plain-English notes on every answer',
      'One clear next step, no sign-up needed'
    ],
    note: 'Takes about 3 minutes. Your answers stay in your browser.'
  },

  navigation: { allowBack: true },

  scoring: {
    // How "select all that apply" questions are marked:
    //   'all-or-nothing' – full credit only when the selection exactly matches the correct set
    //   'partial'        – (correct picks − wrong picks) / correct total, never below 0
    multiple: 'all-or-nothing'
  },

  questions: [
    {
      id: 'q-semantic-html',
      type: 'single',
      topic: 'HTML',
      text: 'Which element is the best fit for a page’s main navigation links?',
      explanation: '<nav> is a landmark element: screen readers and browsers can identify and jump to it. A styled <div> looks the same but carries no meaning.',
      choices: [
        { id: 'a', text: '<div class="nav">', feedback: 'A div renders fine, but it exposes no navigation landmark to assistive technology.' },
        { id: 'b', text: '<nav>', correct: true },
        { id: 'c', text: '<section>', feedback: 'A section groups content, but it is not specifically a navigation landmark.' },
        { id: 'd', text: '<menu>', feedback: '<menu> is meant for lists of commands or toolbar actions, not site navigation.' }
      ]
    },
    {
      id: 'q-http-status',
      type: 'single',
      topic: 'HTTP',
      text: 'A browser requests a URL that does not exist on the server. Which status code should the server normally return?',
      explanation: '404 means the server could not find the requested resource. 403 means it was found but access is refused; 500 signals a server-side failure; 301 is a permanent redirect.',
      choices: [
        { id: 'a', text: '403 Forbidden', feedback: '403 means the resource may exist but you are not allowed to see it.' },
        { id: 'b', text: '500 Internal Server Error', feedback: '500 means the server failed while handling a valid request.' },
        { id: 'c', text: '404 Not Found', correct: true },
        { id: 'd', text: '301 Moved Permanently', feedback: '301 tells the client the resource has a new location, which is not the case here.' }
      ]
    },
    {
      id: 'q-const-array',
      type: 'single',
      topic: 'JavaScript',
      text: 'What happens when this code runs?',
      code: 'const items = [1, 2, 3];\nitems.push(4);\nconsole.log(items);',
      explanation: '`const` prevents reassigning the variable, not changing the array it points to. push() mutates the array, so the output is [1, 2, 3, 4].',
      choices: [
        { id: 'a', text: 'A TypeError, because items is const', feedback: 'A TypeError would only occur on reassignment, such as items = [].' },
        { id: 'b', text: 'It logs [1, 2, 3, 4]', correct: true },
        { id: 'c', text: 'It logs [1, 2, 3] because const arrays are frozen', feedback: 'const does not freeze values. Object.freeze() would do that.' },
        { id: 'd', text: 'It logs undefined', feedback: 'push() returns the new length, but this code logs the array itself.' }
      ]
    },
    {
      id: 'q-css-specificity',
      type: 'single',
      topic: 'CSS',
      text: 'Which colour does the paragraph inside the card get?',
      code: '.card p { color: blue; }\np { color: red; }\n\n<div class="card"><p>Hello</p></div>',
      explanation: 'Specificity decides before source order. `.card p` (one class, one element) outranks `p` (one element), so the text is blue even though the red rule comes later.',
      choices: [
        { id: 'a', text: 'Red, because it is declared last', feedback: 'Source order only breaks ties between rules of equal specificity.' },
        { id: 'b', text: 'Blue, because `.card p` is more specific', correct: true },
        { id: 'c', text: 'Neither, because the two rules conflict', feedback: 'The cascade always resolves conflicts; it never discards both rules.' },
        { id: 'd', text: 'Red, because element selectors always win', feedback: 'Element selectors have the lowest specificity of the common selector types.' }
      ]
    },
    {
      id: 'q-xss',
      type: 'multiple',
      topic: 'Security',
      text: 'Which practices reduce the risk of cross-site scripting (XSS) when showing user-submitted text?',
      explanation: 'Insert text with textContent, sanitise any HTML you must allow with a maintained library, and add a strict Content-Security-Policy as a second layer. Hiding fields with CSS and validating only in client-side JavaScript do not stop an attacker, who controls the request.',
      choices: [
        { id: 'a', text: 'Insert it with textContent instead of innerHTML', correct: true },
        { id: 'b', text: 'Sanitise any allowed HTML with a well-maintained library', correct: true },
        { id: 'c', text: 'Validate the input only in client-side JavaScript', feedback: 'Client-side checks can be bypassed by sending requests directly.' },
        { id: 'd', text: 'Deploy a strict Content-Security-Policy', correct: true },
        { id: 'e', text: 'Hide the input field with CSS after submission', feedback: 'Hiding an element changes appearance, not what the server or page does with the data.' }
      ]
    },
    {
      id: 'q-render-blocking',
      type: 'single',
      topic: 'Performance',
      text: 'A page feels slow because a large JavaScript bundle delays the first render. What is the best first step?',
      explanation: 'Start by measuring (for example with the browser’s performance tools) to see what is blocking rendering, then defer or split non-critical scripts. Guessing at fixes often optimises the wrong thing.',
      choices: [
        { id: 'a', text: 'Compress all the images on the page', feedback: 'Worthwhile in general, but it does not address a blocking script.' },
        { id: 'b', text: 'Upgrade the server hardware', feedback: 'A faster server does not shrink what the browser must download and run.' },
        { id: 'c', text: 'Inline every script into the HTML', feedback: 'Inlining usually makes the document larger and can delay first render further.' },
        { id: 'd', text: 'Profile what is blocking rendering, then defer or split non-critical scripts', correct: true }
      ]
    }
  ],

  results: {
    // Bands are matched on percentage score; exactly one band must start at 0.
    bands: [
      {
        id: 'building',
        minPercent: 0,
        title: 'You’re building your foundations',
        summary: 'A few core ideas are still settling, which is completely normal. Focus on the topics below and revisit the explanations in your answer review.',
        nextStep: 'Pick one topic from the list below and practise it with a tiny project this week.'
      },
      {
        id: 'solid',
        minPercent: 50,
        title: 'You have a solid base',
        summary: 'You handle most of the fundamentals and have a few gaps to close. The review below shows exactly where.',
        nextStep: 'Close the gaps below, then try building something that combines several of these areas.'
      },
      {
        id: 'strong',
        minPercent: 80,
        title: 'You’re strong on the fundamentals',
        summary: 'You answered nearly everything correctly. Check the review for any detail you missed and think about deeper topics next.',
        nextStep: 'Look for a project or role where you can apply these skills at a larger scale.'
      }
    ],
    disclaimer: 'Six questions is a quick check, not a certification. Treat this as a starting point for what to learn next.'
  },

  // Optional. Remove the whole block to hide the call to action.
  // url must be https:// or a relative path. example.com is a placeholder.
  cta: {
    label: 'See a learning plan for your level',
    url: 'https://example.com/web-learning-plan',
    target: 'new-tab', // 'new-tab' | 'same-frame' | 'top'
    description: 'A short, practical plan for your next four weeks of learning.'
  },

  // Optional lead capture, shown AFTER the result. Disabled by default.
  // When enabled you must provide an `endpoint` or pass `onLeadSubmit` to QuizWidget.mount();
  // otherwise the form is NOT shown (the widget never pretends to submit).
  leadCapture: {
    enabled: false,
    heading: 'Get your learning plan by email',
    description: 'We’ll send the plan and nothing else.',
    collectName: true,
    submitLabel: 'Email me the plan',
    successMessage: 'Thanks. Check your inbox shortly.',
    consent: { required: true, text: 'I agree to receive this email and understand I can unsubscribe at any time.' },
    privacyNotice: { text: 'Your details are used only to send the plan.', url: 'https://example.com/privacy' }
    // endpoint: 'https://your-api.example/quiz-leads'   // POST JSON, see README
  },

  // Optional. Colours are CSS values; see README for what each key controls.
  theme: {
    mode: 'light'
    // accent: '#ee7a30',   // orange: buttons, progress, selected mark
    // ink: '#000000',      // black panels
    // fontFamily: 'Georgia, serif',
    // radius: '14px',
    // maxWidth: '640px'
  },

  // Optional iframe messaging. The quiz only posts events to origins listed here
  // (plus its own origin). Add the origin(s) of the sites that embed it.
  integration: {
    allowedParentOrigins: []
  }
};

/*
 * quiz-config.js — RKY Career Compass. Edit THIS file for copy, links, theme and lead settings.
 *
 * Question wording, answer ids, the scoring matrix, weights, avoidance penalties, the pathway
 * catalogue and the 90-day templates come from the stakeholder workbook via compass-data.js
 * (generated: python3 tools/build-compass-data.py "<workbook>.xlsx"). Do not copy them here.
 *
 * All URLs below are PLACEHOLDERS on example.com. Replace them before launch.
 *
 * Load order: quiz-core.js, pathway-scoring.js, compass-data.js, quiz-config.js,
 *             quiz-results-pathway.js, quiz-engine.js
 */
window.QUIZ_CONFIG = (function (D) {
  'use strict';

  var SITE = 'https://example.com/rky';                                   // PLACEHOLDER
  var UTM = '?utm_source=career-compass&utm_medium=quiz&utm_campaign=pathway-result';
  var SLUGS = {
    DATA: 'data-analysis-bi', PM: 'project-management', BA: 'business-analysis', AML: 'kyc-aml',
    AI: 'ai-automation', CYBER: 'cybersecurity', VA: 'virtual-assistant'
  };

  /* ----- Per-question copy that is not in the workbook ----- */
  var WHY_UK = 'This only helps us point you to the right guidance. It never changes your career match, and it isn’t legal advice.';
  var QUESTION_COPY = {
    Q03: { placeholder: 'For example: Customer service assistant', suggest: 'jobTitles' },
    Q19: { note: WHY_UK },
    Q20: { note: WHY_UK },
    Q21: { note: WHY_UK },
    Q22: { note: WHY_UK }
  };

  var questions = D.questions.map(function (q) {
    return Object.assign({}, q, QUESTION_COPY[q.id] || {});
  });

  var bootcamps = {};
  D.pathways.forEach(function (p) {
    bootcamps[p.id] = { url: SITE + '/bootcamps/' + SLUGS[p.id] + UTM };
  });

  return {
    id: 'rky-career-compass-v1',
    type: 'pathway',
    title: 'RKY Career Compass',
    description: 'Tell us about your skills, interests and goals. We’ll recommend the three RKY Careers pathways that fit you best, with a 90-day plan for what to do next.',
    category: 'Career pathways',
    audience: 'Career changers, graduates and job seekers',
    estimatedMinutes: 6,

    intro: {
      bullets: [
        'Your top three pathway matches',
        'The skills to build and roles to explore',
        'A 90-day plan shaped by your goals'
      ],
      note: 'Takes about 6 minutes. Nothing is sent unless you ask for your results by email.'
    },

    navigation: { allowBack: true, autoAdvance: true },

    // Progress is shown per stage, because the UK questions only appear for some visitors.
    stages: [
      { id: 'about',     title: 'About you',          questions: ['Q01', 'Q02', 'Q03', 'Q04', 'Q05'] },
      { id: 'skills',    title: 'Skills & interests', questions: ['Q06', 'Q07', 'Q08', 'Q09'] },
      { id: 'goals',     title: 'Your goals',         questions: ['Q10', 'Q11', 'Q12'] },
      { id: 'readiness', title: 'Readiness',          questions: ['Q13', 'Q14', 'Q15', 'Q16'] },
      { id: 'location',  title: 'Location',           questions: ['Q17', 'Q18', 'Q19', 'Q20', 'Q21', 'Q22'] },
      { id: 'next',      title: 'Next 90 days',       questions: ['Q23'] }
    ],

    questions: questions,

    results: {
      disclaimer: 'Your match shows how closely your answers line up with each pathway. It isn’t a prediction of getting a job, and training readiness isn’t job readiness. Anything about UK work permission is general guidance, not legal advice.'
    },

    pathway: {
      pathways: D.pathways,
      weights: D.weights,
      avoidance: D.avoidance,
      avoidanceQuestion: 'Q12',

      // Plain-language label shown next to each match percentage (display only, never scored).
      // Agreed cut-offs: 45+ strong, 30-44 good, under 30 possible.
      fitLabels: [
        { id: 'strong', min: 45, label: 'Strong fit' },
        { id: 'good', min: 30, label: 'Good fit' },
        { id: 'possible', min: 0, label: 'Possible fit' }
      ],
      templates: D.templates,

      // Readiness is a separate label from the match (workbook row 16). Not a job-readiness claim.
      // Points: Q04 + Q08 + Q14 (0-3 each) + tools (0-2) = 0-11. Thresholds are a proposal for sign-off.
      readiness: {
        points: {
          Q04: { ZERO: 0, LT2: 1, Y2_5: 2, GT5: 3 },
          Q08: { BEGINNER: 0, BASIC: 1, INTERMEDIATE: 2, ADVANCED: 3 },
          Q14: { H0_2: 0, H3_5: 1, H6_10: 2, H10PLUS: 3 }
        },
        tools: { question: 'Q07', none: 'NONE', bands: [{ min: 1, points: 1 }, { min: 3, points: 2 }] },
        barrierQuestion: 'Q15',
        labels: [
          { id: 'starting', min: 0, label: 'Getting started',
            summary: 'You’re at the start of the journey, which is a perfectly good place to begin.',
            advice: 'Build foundations first. A guided pathway and a conversation with an adviser will help you choose a sensible first step.' },
          { id: 'building', min: 4, label: 'Building momentum',
            summary: 'You already have some experience, tools or time to build on.',
            advice: 'A structured programme can turn what you have into focused progress. Compare your top pathways before you commit.' },
          { id: 'prepared', min: 8, label: 'Well prepared to train',
            summary: 'You have the experience, tool familiarity and weekly time to get the most from a bootcamp.',
            advice: 'You’re in a strong position to start. Check the prerequisites for your top pathway and plan your first month.' }
        ]
      },

      // Roadmap segment (first matching rule wins), see "90 Day Templates" in the workbook.
      segments: [
        { name: 'Job search', when: { any: [{ q: 'Q01', in: ['SEARCH'] }, { q: 'Q23', in: ['NEW_JOB'] }] } },
        { name: 'Exploring',  when: { q: 'Q13', in: ['EXPLORE', 'M612'] } }
      ],
      defaultSegment: 'Ready to train',
      // Adds the "Sponsored / conditional UK work" template row and the UK guidance block.
      conditionalWork: { q: 'Q19', in: ['SPONSORED', 'STUDENT', 'GRADUATE', 'OTHER_PERMIT', 'UNSURE'] },
      conditionalSegment: 'Sponsored / conditional UK work',

      // "Tailored for you" lines (draft copy for stakeholder review). One per question, in this order.
      roadmap: {
        order: ['Q15', 'Q23', 'Q16'],
        addons: {
          Q15: {
            PATH: 'Start with a career information session. It’s built for people still choosing between routes.',
            SKILLS: 'Spend your first 30 days on the core skills for your top pathway before anything else.',
            PORTFOLIO: 'A small portfolio project is the quickest way to show what you can do without a long work history.',
            JOBSEARCH: 'Pair your training with CV and interview preparation so they build on each other.',
            COST: 'Ask an adviser about costs and options before you commit to anything.',
            TIME: 'Pick a steady weekly slot you can keep, rather than a big push you can’t sustain.'
          },
          Q23: {
            NEW_JOB: 'Collect job descriptions for your target roles in week one so your learning matches real requirements.',
            SWITCH: 'Talk to an adviser early about which of your current skills carry over.',
            PROMOTION: 'Pick one project at work where you can apply what you learn.',
            UPSKILL: 'Plan short, regular study sessions that fit around your current job.',
            SPONSOR: 'Check any sponsorship requirements separately. This quiz can’t confirm what a role allows.',
            IMMIGRATION: 'Keep your plans within the conditions of your permission, and check them with a regulated adviser.',
            REMOTE: 'Build a small portfolio you can show to remote clients or employers.',
            EXPLORE: 'Try a beginner taster task in your top two pathways before choosing one.'
          },
          Q16: {
            LIVE: 'Ask about the live, expert-led option when you speak to an adviser.',
            SELF: 'Look for a self-paced option so learning fits around your week.',
            PROJECTS: 'Favour a pathway with real project work you can put in your portfolio.',
            COACH: 'Ask about CV and interview coaching alongside your training.',
            MENTOR: 'Book a career conversation to talk through your top results.'
          }
        }
      },

      ukGuidance: {
        title: 'About UK work permission',
        body: [
          'Your UK work answers never change your career match. We use them only to point you to the right guidance.',
          'This isn’t legal advice and we can’t confirm whether you’re allowed to take a particular job or course. Check your permission and any sponsorship conditions with your employer and, where needed, a regulated immigration adviser.'
        ]
      },

      // Where each CRM field comes from (workbook sheet "CRM Data Fields").
      crmMap: {
        current_role: 'Q03', location: 'Q17', target_markets: 'Q18', work_eligibility: 'Q19',
        sponsorship_status: 'Q20', sponsored_industry: 'Q21', sponsorship_impact: 'Q22', ninety_day_goal: 'Q23'
      },

      // Every call to action says where it leads. `target`: 'new-tab' | 'same-frame' | 'top' | 'host'.
      // 'host' makes the widget NOT navigate: it only posts a cta:clicked event for the embedding page.
      cta: {
        target: 'new-tab',
        bootcamps: bootcamps,
        infoSession: {
          label: 'Book a career information session',
          url: SITE + '/info-session' + UTM,
          description: 'Talk through your results with an adviser.'
        }
      }
    },

    // Shown after the result and never gates it. PLACEHOLDER endpoint: replace with your API.
    leadCapture: {
      enabled: true,
      heading: 'Keep your full results',
      description: 'Your full report includes pathway matches, skills, roles and your 90-day plan. Marketing updates are optional.',
      collectName: true,
      nameRequired: true,
      collectWhatsApp: true,
      submitLabel: 'Email my full results',
      successMessage: 'Thanks. Your full results have been requested. Check your inbox shortly.',
      optIns: {
        email: { text: 'Email me news, events and course updates from RKY Careers.' },
        whatsapp: { text: 'Message me on WhatsApp about courses and events.' }
      },
      privacyNotice: { text: 'We use your details to send your results. Your answers are shared with RKY Careers so an adviser can follow up if you ask.', url: SITE + '/privacy' },
      privacyNoticeVersion: '2026-10-draft',
      endpoint: 'https://api.example.com/v1/career-compass/leads'
    },

    theme: { mode: 'light' },

    // Origins of the sites allowed to embed this and receive its postMessage events.
    integration: { allowedParentOrigins: [] }
  };
}(window.COMPASS_DATA));

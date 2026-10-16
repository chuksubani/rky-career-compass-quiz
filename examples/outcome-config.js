/*
 * Example OUTCOME quiz. No answer is "correct"; each choice adds points to one or more
 * outcomes. Highest total wins; ties go to the outcome listed first (scoring.tieBreak).
 */
window.QUIZ_CONFIG = {
  id: 'learning-style-demo',
  type: 'outcome',
  title: 'Which way of learning tech suits you?',
  description: 'Four questions about how you like to work. You’ll get a suggestion for how to approach your next skill. It’s a prompt for reflection, not a diagnosis.',
  category: 'Career development',
  estimatedMinutes: 2,
  scoring: { tieBreak: 'config-order' },
  questions: [
    {
      id: 'q1', type: 'single', text: 'You’re learning a new tool. What do you do first?',
      choices: [
        { id: 'a', text: 'Open it and start clicking around', points: { builder: 2 } },
        { id: 'b', text: 'Read the documentation or watch an overview', points: { studier: 2 } },
        { id: 'c', text: 'Ask a colleague or friend to show me', points: { collaborator: 2 } }
      ]
    },
    {
      id: 'q2', type: 'single', text: 'Which sounds like the best use of a free Saturday?',
      choices: [
        { id: 'a', text: 'Building a small project, even a messy one', points: { builder: 2 } },
        { id: 'b', text: 'Working through a structured course', points: { studier: 2 } },
        { id: 'c', text: 'Joining a study group or meetup', points: { collaborator: 2 } }
      ]
    },
    {
      id: 'q3', type: 'multiple', text: 'What helps you stay motivated? Pick all that apply.',
      choices: [
        { id: 'a', text: 'Seeing something working quickly', points: { builder: 1 } },
        { id: 'b', text: 'A clear syllabus and checkpoints', points: { studier: 1 } },
        { id: 'c', text: 'Accountability from other people', points: { collaborator: 1 } },
        { id: 'd', text: 'Explaining ideas to someone else', points: { collaborator: 1, studier: 1 } }
      ]
    },
    {
      id: 'q4', type: 'single', text: 'When you get stuck, you usually…',
      choices: [
        { id: 'a', text: 'Try variations until something works', points: { builder: 2 } },
        { id: 'b', text: 'Go back and re-read the fundamentals', points: { studier: 2 } },
        { id: 'c', text: 'Post the problem and ask for help', points: { collaborator: 2 } }
      ]
    }
  ],
  results: {
    outcomes: [
      { id: 'builder', title: 'The Builder', summary: 'You seem to learn by doing. Hands-on projects are likely to stick better for you than long stretches of reading.',
        traits: ['Start with a small project and learn each piece as you need it', 'Keep a short list of concepts to revisit later'],
        nextStep: 'Pick a tiny project you can finish in a weekend.' },
      { id: 'studier', title: 'The Systematic Learner', summary: 'You seem to prefer structure and understanding the “why” before you build. Courses and reference material probably suit you.',
        traits: ['Follow a structured path with checkpoints', 'Add a small practice project after each module'],
        nextStep: 'Choose one structured course and schedule it in your calendar.' },
      { id: 'collaborator', title: 'The Collaborator', summary: 'You seem to learn best with other people: asking, explaining and sharing progress keep you moving.',
        traits: ['Find a study partner or community', 'Teach what you learn through short write-ups or talks'],
        nextStep: 'Join one community or find a learning partner this week.' }
    ],
    disclaimer: 'This is a short, informal quiz. It describes tendencies in how you answered today, not your abilities or who you are. Most people use a mix of approaches.'
  },
  cta: { label: 'Browse learning resources', url: 'https://example.com/resources', target: 'new-tab' },
  leadCapture: {
    enabled: true,
    heading: 'Want tips for your style?',
    description: 'Demo only: submissions go to a mock handler in this page, not a real service.',
    collectName: true,
    submitLabel: 'Send me tips',
    successMessage: 'Thanks. (Demo: nothing was actually sent.)',
    consent: { required: true, text: 'I agree to receive learning tips by email.' },
    privacyNotice: { text: 'Demo notice.', url: 'https://example.com/privacy' }
  },
  integration: { allowedParentOrigins: [] }
};

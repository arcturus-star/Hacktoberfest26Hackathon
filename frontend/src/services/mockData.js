/**
 * Mock data adhering strictly to the backend contract specified in:
 * docs/superpowers/plans/2026-10-28-backend.md and PROJECT.md
 */

export const MOCK_STUDENTS = [
  {
    id: 'student-1',
    name: 'Alex Rivera',
    interests: ['running', 'fitness', 'outdoor']
  },
  {
    id: 'S001',
    name: 'Emma Thompson',
    interests: ['sport', 'football', 'creative', 'social']
  },
  {
    id: 'S002',
    name: 'James Chen',
    interests: ['sport', 'badminton', 'art', 'wellbeing']
  },
  {
    id: 'S005',
    name: 'Priya Patel',
    interests: ['creative', 'music', 'pottery', 'wellbeing']
  },
  {
    id: 'student-empty',
    name: 'Zoe Walker (No Upcoming Matches)',
    interests: ['underwater-hockey', 'astrophysics']
  }
];

export const MOCK_ACTIVITIES = [
  {
    id: 'activity-1',
    name: 'Campus Social Morning Run',
    description: 'A relaxed 5km social run around campus paths. All paces welcome, with refreshments at LSU after.',
    tags: ['running', 'fitness', 'social', 'outdoor'],
    start: '2026-11-01T09:30:00Z',
    end: '2026-11-01T10:30:00Z',
    location: 'Campus Fountain / Towers',
    source: 'synthetic'
  },
  {
    id: 'E001',
    name: 'Men\'s Football League Match vs Coventry',
    description: 'Watch the Loughborough Men\'s Football team take on Coventry in a thrilling league fixture.',
    tags: ['sport', 'football', 'team-sport', 'social'],
    start: '2026-11-01T14:00:00Z',
    end: '2026-11-01T16:00:00Z',
    location: 'Loughborough Stadium',
    source: 'synthetic'
  },
  {
    id: 'E002',
    name: 'Badminton Club Open Training Session',
    description: 'Open training session for all skill levels. Rackets available to borrow.',
    tags: ['sport', 'badminton', 'training', 'fitness'],
    start: '2026-11-01T18:30:00Z',
    end: '2026-11-01T20:00:00Z',
    location: 'Rutland Sports Complex',
    source: 'synthetic'
  },
  {
    id: 'E003',
    name: 'Beginner Pottery Workshop: Handbuilding',
    description: 'A beginner-friendly pottery workshop led by student ceramicists. Create your first mug or bowl.',
    tags: ['creative', 'art', 'pottery', 'workshop'],
    start: '2026-11-02T15:00:00Z',
    end: '2026-11-02T17:00:00Z',
    location: 'Art Studio Block A',
    source: 'synthetic'
  },
  {
    id: 'E005',
    name: 'Acoustic Guitar Circle & Jam',
    description: 'Bring your acoustic guitar or borrow one to jam and meet other musicians. Casual, fun vibe.',
    tags: ['creative', 'music', 'social', 'casual'],
    start: '2026-11-03T17:30:00Z',
    end: '2026-11-03T19:00:00Z',
    location: 'Student Union Music Room',
    source: 'synthetic'
  },
  {
    id: 'E006',
    name: 'Meditation & Mindfulness Evening',
    description: 'Guided meditation session to reduce study stress, improve focus, and relax before midterm submissions.',
    tags: ['wellbeing', 'mental-health', 'relaxation', 'guided'],
    start: '2026-11-03T18:00:00Z',
    end: '2026-11-03T19:00:00Z',
    location: 'Wellness Centre Room 1',
    source: 'synthetic'
  },
  {
    id: 'E013',
    name: 'Yoga & Flexibility for Athletes',
    description: 'Targeted mobility and flexibility session for students involved in sports or fitness.',
    tags: ['sport', 'wellbeing', 'yoga', 'fitness'],
    start: '2026-11-06T17:30:00Z',
    end: '2026-11-06T18:30:00Z',
    location: 'Wellness Centre Room 2',
    source: 'synthetic'
  },
  {
    id: 'E023',
    name: 'Sunrise Spin & High-Energy Cycling',
    description: 'High-cadence indoor cycle workout with motivational music and experienced student instructors.',
    tags: ['sport', 'cycling', 'fitness', 'training'],
    start: '2026-11-11T06:30:00Z',
    end: '2026-11-11T07:15:00Z',
    location: 'Holywell Fitness Centre',
    source: 'synthetic'
  }
];

export const MOCK_ATTENDANCE = [
  { studentId: 'student-1', activityId: 'activity-past-1' },
  { studentId: 'S001', activityId: 'E001-past' },
  { studentId: 'S002', activityId: 'E002-past' }
];

/**
 * Generates mock recommendations that simulate the backend response contract.
 * @param {string} studentId
 * @param {number} limit
 * @returns {{ studentId: string, recommendations: Array<{activityId: string, reason: string}>, mode: string, notice: string }}
 */
export function generateMockRecommendations(studentId, limit = 5) {
  const student = MOCK_STUDENTS.find(s => s.id === studentId);
  if (!student) {
    const error = new Error('Student not found.');
    error.status = 404;
    error.code = 'STUDENT_NOT_FOUND';
    throw error;
  }

  // Zoe Walker has empty recommendations scenario
  if (studentId === 'student-empty') {
    return {
      studentId,
      recommendations: [],
      mode: 'fallback',
      notice: 'Mock Mode: No matching upcoming activities found for this student profile.'
    };
  }

  const studentInterests = (student.interests || []).map(i => i.toLowerCase().trim());
  const scored = [];

  for (const act of MOCK_ACTIVITIES) {
    const actTags = (act.tags || []).map(t => t.toLowerCase().trim());
    const matchingInterests = studentInterests.filter(i => actTags.includes(i));

    if (matchingInterests.length > 0) {
      const score = matchingInterests.length * 2;
      const reason = `Matches your interest in ${matchingInterests.join(' and ')}.`;
      scored.push({
        activityId: act.id,
        reason,
        score,
        start: act.start
      });
    }
  }

  // Sort by score desc, then start asc
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(a.start) - new Date(b.start);
  });

  const recommendations = scored.slice(0, Math.max(1, limit)).map(item => ({
    activityId: item.activityId,
    reason: item.reason
  }));

  return {
    studentId,
    recommendations,
    mode: 'fallback',
    notice: 'Mock Mode Active: Using synthetic offline fixture data (matches backend contract).'
  };
}

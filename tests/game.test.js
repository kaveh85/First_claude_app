const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game.js');
const T = require('../js/tricks.js');

// Deterministic RNG so failures are reproducible.
function seeded(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALL_OPS = Object.keys(G.OPS);

test('generated questions have whole, non-negative answers at every skill', () => {
  const rng = seeded(1);
  for (let skill = 1; skill <= 22; skill++) {
    for (const op of ALL_OPS) {
      for (let i = 0; i < 200; i++) {
        const q = G.generateQuestion([op], skill, rng);
        assert.equal(q.op, op);
        assert.ok(Number.isInteger(q.answer), `${q.text} = ${q.answer}`);
        assert.ok(q.answer > 0, `${q.text} = ${q.answer}`);
        if (op === 'div') assert.ok(q.b >= 2);
      }
    }
  }
});

test('numbers grow with skill', () => {
  let prev = 0;
  for (let skill = 1; skill <= 22; skill++) {
    const { hi } = G.addRange(skill);
    assert.ok(hi > prev);
    prev = hi;
  }
  assert.equal(G.addRange(1).hi, 10);
});

test('skill combines difficulty, level and adjustment within bounds', () => {
  assert.equal(G.skillFor('easy', 1), 1);
  assert.equal(G.skillFor('medium', 1), 6);
  assert.equal(G.skillFor('hard', 10), 20);
  assert.equal(G.skillFor('easy', 1, -2), 1);
  assert.equal(G.skillFor('hard', 10, 5), 22);
});

test('every trick generates questions it applies to, and its steps reach the answer', () => {
  const rng = seeded(2);
  for (const trick of T.list) {
    for (const skill of [trick.minSkill, 12, 20]) {
      for (let i = 0; i < 100; i++) {
        const q = G.trickQuestion(trick, skill, rng);
        assert.ok(trick.applies(q), `${trick.id} should apply to ${q.text}`);
        assert.ok(Number.isInteger(q.answer) && q.answer > 0, `${trick.id}: ${q.text} = ${q.answer}`);
        const steps = trick.solve(q);
        assert.ok(steps.length >= 2);
        assert.match(steps[steps.length - 1], new RegExp(`\\b${q.answer}$`), `${trick.id}: ${steps.join(' | ')}`);
      }
    }
  }
});

test('worked steps for specific tricks are correct', () => {
  const steps = (a, op, b) => T.findFor(G.makeQuestion(a, op, b));
  assert.equal(steps(11, 'mul', 36).trick.id, 'times-11');
  assert.deepEqual(steps(11, 'mul', 36).steps.at(-1), '3 9 6 → 396');
  assert.match(steps(78, 'mul', 11).steps.at(-1), /carry 1 → 8 5 8 → 858$/);
  assert.equal(steps(35, 'mul', 35).trick.id, 'square-5');
  assert.equal(steps(8, 'add', 7).trick.id, 'make-ten');
  assert.equal(steps(47, 'add', 29).trick.id, 'round-add');
  assert.equal(steps(62, 'sub', 35).trick.id, 'count-up');
  assert.equal(steps(62, 'sub', 38).trick.id, 'round-sub');
  assert.equal(steps(72, 'div', 8).trick.id, 'halve-to-divide');
  assert.equal(steps(42, 'div', 7).trick.id, 'think-multiply');
  assert.equal(steps(4, 'add', 3), null);
});

test('lessons are picked in curriculum order for the chosen operations', () => {
  assert.equal(G.pickLesson([], ['add'], 1).id, 'make-ten');
  assert.equal(G.pickLesson(['make-ten'], ['add'], 1), null);
  assert.equal(G.pickLesson(['make-ten'], ['add'], 3).id, 'round-add');
  assert.equal(G.pickLesson([], ['mul'], 1), null);
  assert.equal(G.pickLesson([], ['mul'], 2).id, 'times-5');
  const all = T.list.map((t) => t.id);
  assert.equal(G.pickLesson(all, ALL_OPS, 22), null);
});

test('a level session runs 10 questions and weaves in the lesson', () => {
  const s = G.createSession({ difficulty: 'easy', level: 3, ops: ['add'], lessonId: 'round-add', rng: seeded(3) });
  const trick = T.get('round-add');
  let lessonQs = 0;
  while (!G.isFinished(s)) {
    const q = G.nextQuestion(s);
    if (trick.applies(q)) lessonQs++;
    G.submitAnswer(s, String(q.answer), 2);
  }
  assert.equal(s.index, 10);
  assert.ok(lessonQs >= 3);
  const r = G.results(s);
  assert.equal(r.correct, 10);
  assert.equal(r.stars, 3);
  assert.ok(r.score >= 10 * 10);
});

test('scoring, streaks and adaptive difficulty', () => {
  const s = G.createSession({ difficulty: 'medium', level: 5, ops: ['mul'], rng: seeded(4) });
  G.nextQuestion(s);
  const wrong = G.submitAnswer(s, String(s.current.answer + 1), 3);
  assert.equal(wrong.correct, false);
  assert.equal(wrong.points, 0);
  G.nextQuestion(s);
  G.submitAnswer(s, '', 3);
  assert.equal(s.adjust, -1, 'two misses in a row ease off');

  for (let i = 0; i < 3; i++) {
    G.nextQuestion(s);
    const res = G.submitAnswer(s, String(s.current.answer), 1);
    assert.ok(res.correct);
  }
  assert.equal(s.adjust, 0, 'three fast answers push back up');
  assert.equal(s.streak, 3);
});

test('stars thresholds', () => {
  assert.equal(G.starsFor(10, 10), 3);
  assert.equal(G.starsFor(9, 10), 2);
  assert.equal(G.starsFor(7, 10), 1);
  assert.equal(G.starsFor(6, 10), 0);
});

test('progress unlocks the next level only when passed and keeps best stars', () => {
  const p = G.defaultProgress();
  const play = (level, correctCount) => {
    const s = G.createSession({ difficulty: 'easy', level, ops: ['add'], rng: seeded(level * 10 + correctCount) });
    for (let i = 0; i < 10; i++) {
      const q = G.nextQuestion(s);
      G.submitAnswer(s, String(i < correctCount ? q.answer : q.answer + 1), 5);
    }
    return G.recordResult(p, s);
  };

  play(1, 5);
  assert.equal(p.levels.easy.unlocked, 1);
  play(1, 10);
  assert.equal(p.levels.easy.unlocked, 2);
  assert.equal(p.levels.easy.stars['1'], 3);
  play(1, 7);
  assert.equal(p.levels.easy.stars['1'], 3, 'best stars are kept');
  assert.equal(p.stats.answered, 30);
  assert.equal(p.stats.correct, 22);

  const practice = G.createSession({ mode: 'practice', difficulty: 'easy', level: 1, ops: [], lessonId: 'times-9', rng: seeded(9) });
  while (!G.isFinished(practice)) {
    const q = G.nextQuestion(practice);
    assert.ok(T.get('times-9').applies(q));
    G.submitAnswer(practice, String(q.answer), 1);
  }
  G.recordResult(p, practice);
  assert.equal(p.levels.easy.unlocked, 2, 'practice does not unlock levels');
});

test('normalizeProgress tolerates missing or bad saved data', () => {
  assert.deepEqual(G.normalizeProgress(null), G.defaultProgress());
  const p = G.normalizeProgress({ levels: { hard: { unlocked: 4 } }, learned: ['times-9', 'nope'] });
  assert.equal(p.levels.hard.unlocked, 4);
  assert.deepEqual(p.levels.hard.stars, {});
  assert.equal(p.levels.easy.unlocked, 1);
  assert.deepEqual(p.learned, ['times-9']);
});

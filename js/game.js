// Core game logic: question generation, level sessions, scoring and progress.
// No DOM access here so it can be unit-tested in Node.
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(isNode ? require('./tricks.js') : root.MathTricks);
  if (isNode) module.exports = api;
  else root.MathGame = api;
})(typeof self !== 'undefined' ? self : this, function (Tricks) {
  'use strict';

  const OPS = {
    add: { symbol: '+', label: 'Addition' },
    sub: { symbol: '−', label: 'Subtraction' },
    mul: { symbol: '×', label: 'Multiplication' },
    div: { symbol: '÷', label: 'Division' },
  };

  // `offset` shifts the skill curve; `time` is the seconds allowed for a speed bonus.
  const DIFFICULTIES = {
    easy: { label: 'Easy', offset: 0, time: 15 },
    medium: { label: 'Medium', offset: 5, time: 12 },
    hard: { label: 'Hard', offset: 10, time: 10 },
  };

  const LEVELS = 10;
  const QUESTIONS_PER_LEVEL = 10;
  const MIN_SKILL = 1;
  const MAX_SKILL = 22;
  const MAX_ADJUST = 2;
  // Positions (0-based) in a level where a newly taught trick is practised.
  const LESSON_SLOTS = [1, 4, 7];

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  function randInt(rng, lo, hi) {
    return lo + Math.floor(rng() * (hi - lo + 1));
  }

  function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length)];
  }

  function skillFor(difficulty, level, adjust = 0) {
    return clamp(DIFFICULTIES[difficulty].offset + level + adjust, MIN_SKILL, MAX_SKILL);
  }

  // Number range for addition and subtraction: grows ~27% per skill step,
  // from single digits (skill 1) to three-digit numbers (skill 15+).
  function addRange(skill) {
    const hi = Math.round(10 * Math.pow(1.27, skill - 1));
    return { lo: Math.max(1, Math.floor(hi / 6)), hi };
  }

  // Two factors for multiplication (and, reversed, division).
  function mulFactors(rng, skill) {
    if (skill <= 8) {
      const hi = Math.min(12, 3 + skill);
      return [randInt(rng, 2, hi), randInt(rng, 2, hi)];
    }
    if (skill <= 14) {
      return [randInt(rng, 11, Math.min(99, 10 + (skill - 8) * 12)), randInt(rng, 2, 9)];
    }
    return [randInt(rng, 11, Math.min(99, 12 + (skill - 14) * 6)), randInt(rng, 11, Math.min(25, skill))];
  }

  function makeQuestion(a, op, b) {
    let answer;
    if (op === 'add') answer = a + b;
    else if (op === 'sub') answer = a - b;
    else if (op === 'mul') answer = a * b;
    else if (op === 'div') answer = a / b;
    else throw new Error(`Unknown operation: ${op}`);
    return { a, op, b, answer, text: `${a} ${OPS[op].symbol} ${b}` };
  }

  function generateQuestion(ops, skill, rng = Math.random) {
    const op = pick(rng, ops);
    if (op === 'add' || op === 'sub') {
      const { lo, hi } = addRange(skill);
      let a = randInt(rng, lo, hi);
      let b = randInt(rng, lo, hi);
      if (op === 'sub') {
        if (a < b) [a, b] = [b, a];
        if (a === b) a += randInt(rng, 1, 9);
      }
      return makeQuestion(a, op, b);
    }
    let [x, y] = mulFactors(rng, skill);
    if (rng() < 0.5) [x, y] = [y, x];
    // Division is multiplication backwards, so the answer is always whole.
    return op === 'mul' ? makeQuestion(x, 'mul', y) : makeQuestion(x * y, 'div', y);
  }

  function trickQuestion(trick, skill, rng = Math.random) {
    const { a, op, b } = trick.generate(rng, skill);
    return makeQuestion(a, op, b);
  }

  // The next trick worth teaching for these settings, or null.
  function pickLesson(learned, ops, skill) {
    return (
      Tricks.curriculum().find((t) => !learned.includes(t.id) && ops.includes(t.op) && t.minSkill <= skill) || null
    );
  }

  function starsFor(correct, total) {
    const ratio = total ? correct / total : 0;
    if (ratio >= 1) return 3;
    if (ratio >= 0.9) return 2;
    if (ratio >= 0.7) return 1;
    return 0;
  }

  // mode 'level': a normal level, optionally weaving in a newly taught trick.
  // mode 'practice': every question drills the given trick.
  function createSession({ mode = 'level', difficulty = 'easy', level = 1, ops = ['add'], lessonId = null, rng = Math.random }) {
    return {
      mode,
      difficulty,
      level,
      ops: ops.slice(),
      lessonId,
      rng,
      total: QUESTIONS_PER_LEVEL,
      index: 0,
      correct: 0,
      score: 0,
      streak: 0,
      bestStreak: 0,
      adjust: 0,
      fastRun: 0,
      missRun: 0,
      timeLimit: DIFFICULTIES[difficulty].time,
      current: null,
      seen: [],
      history: [],
    };
  }

  function currentSkill(s) {
    return skillFor(s.difficulty, s.level, s.adjust);
  }

  function nextQuestion(s) {
    const skill = currentSkill(s);
    const trick = s.lessonId ? Tricks.get(s.lessonId) : null;
    const useTrick = trick && (s.mode === 'practice' || LESSON_SLOTS.includes(s.index));
    let q;
    // Re-roll a few times to avoid repeating a question within the session.
    for (let tries = 0; tries < 8; tries++) {
      q = useTrick ? trickQuestion(trick, skill, s.rng) : generateQuestion(s.ops, skill, s.rng);
      if (!s.seen.includes(q.text)) break;
    }
    s.seen.push(q.text);
    s.current = q;
    return q;
  }

  function speedBonus(seconds, limit) {
    return Math.max(0, Math.round(5 * (1 - seconds / limit)));
  }

  // Record an answer to the current question. Returns what the UI needs to show.
  function submitAnswer(s, value, seconds) {
    const q = s.current;
    const correct = Number(value) === q.answer && String(value).trim() !== '';
    let points = 0;

    if (correct) {
      s.correct++;
      s.streak++;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      s.missRun = 0;
      points = 10 + speedBonus(seconds, s.timeLimit) + (s.streak >= 3 ? 2 : 0);
      s.score += points;
      // Quick, consistent answers nudge the numbers up a little...
      s.fastRun = seconds <= s.timeLimit / 2 ? s.fastRun + 1 : 0;
      if (s.fastRun >= 3) {
        s.adjust = Math.min(MAX_ADJUST, s.adjust + 1);
        s.fastRun = 0;
      }
    } else {
      s.streak = 0;
      s.fastRun = 0;
      // ...and repeated misses ease them off, so it stays challenging but fair.
      s.missRun++;
      if (s.missRun >= 2) {
        s.adjust = Math.max(-MAX_ADJUST, s.adjust - 1);
        s.missRun = 0;
      }
    }

    s.history.push({ text: q.text, answer: q.answer, given: value, correct, seconds });
    s.index++;
    return { correct, expected: q.answer, points, hint: correct ? null : Tricks.findFor(q) };
  }

  function isFinished(s) {
    return s.index >= s.total;
  }

  function results(s) {
    const stars = starsFor(s.correct, s.total);
    return {
      correct: s.correct,
      total: s.total,
      score: s.score,
      bestStreak: s.bestStreak,
      stars,
      passed: stars > 0,
      missed: s.history.filter((h) => !h.correct),
    };
  }

  // ---- Progress (plain JSON so the UI can persist it) ----

  function defaultProgress() {
    const levels = {};
    for (const d of Object.keys(DIFFICULTIES)) levels[d] = { unlocked: 1, stars: {}, best: {} };
    return { levels, learned: [], stats: { answered: 0, correct: 0 } };
  }

  // Fill in anything missing from older or partial saved data.
  function normalizeProgress(saved) {
    const p = defaultProgress();
    if (!saved || typeof saved !== 'object') return p;
    for (const d of Object.keys(DIFFICULTIES)) Object.assign(p.levels[d], saved.levels && saved.levels[d]);
    if (Array.isArray(saved.learned)) p.learned = saved.learned.filter((id) => Tricks.get(id));
    Object.assign(p.stats, saved.stats);
    return p;
  }

  function recordResult(progress, session) {
    const r = results(session);
    progress.stats.answered += r.total;
    progress.stats.correct += r.correct;
    if (session.mode !== 'level') return r;
    const lv = progress.levels[session.difficulty];
    const key = String(session.level);
    lv.stars[key] = Math.max(lv.stars[key] || 0, r.stars);
    lv.best[key] = Math.max(lv.best[key] || 0, r.score);
    if (r.passed && session.level < LEVELS) lv.unlocked = Math.max(lv.unlocked, session.level + 1);
    return r;
  }

  function markLearned(progress, trickId) {
    if (!progress.learned.includes(trickId)) progress.learned.push(trickId);
  }

  return {
    OPS,
    DIFFICULTIES,
    LEVELS,
    QUESTIONS_PER_LEVEL,
    skillFor,
    addRange,
    makeQuestion,
    generateQuestion,
    trickQuestion,
    pickLesson,
    starsFor,
    createSession,
    nextQuestion,
    submitAnswer,
    isFinished,
    results,
    defaultProgress,
    normalizeProgress,
    recordResult,
    markLearned,
  };
});

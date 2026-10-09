// UI layer: wires the game logic in game.js / tricks.js to the page.
(function () {
  'use strict';

  const G = window.MathGame;
  const T = window.MathTricks;
  const STORAGE_KEY = 'mindmath:v1';

  const $ = (id) => document.getElementById(id);
  const screens = ['home', 'lesson', 'play', 'results', 'skills'];

  // ---- Persistence ----

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return {
        progress: G.normalizeProgress(raw && raw.progress),
        settings: Object.assign({ difficulty: 'easy', ops: ['add', 'sub'] }, raw && raw.settings),
      };
    } catch (e) {
      return { progress: G.defaultProgress(), settings: { difficulty: 'easy', ops: ['add', 'sub'] } };
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ progress: state.progress, settings: state.settings }));
    } catch (e) {
      // Storage can be unavailable (private mode); the game still works for this visit.
    }
  }

  const state = Object.assign(load(), {
    session: null,
    questionStartedAt: 0,
    timerFrame: 0,
    awaitingNext: false,
    advanceTimeout: 0,
    onLessonDone: null,
  });

  if (!G.DIFFICULTIES[state.settings.difficulty]) state.settings.difficulty = 'easy';
  state.settings.ops = state.settings.ops.filter((op) => G.OPS[op]);
  if (!state.settings.ops.length) state.settings.ops = ['add'];

  // ---- Navigation ----

  function show(name) {
    for (const s of screens) $(`screen-${s}`).hidden = s !== name;
    if (name !== 'play') stopTimer();
    if (name === 'home') renderHome();
    if (name === 'skills') renderSkills();
    window.scrollTo(0, 0);
  }

  document.querySelectorAll('[data-nav]').forEach((btn) =>
    btn.addEventListener('click', () => {
      clearTimeout(state.advanceTimeout);
      state.session = null;
      show(btn.dataset.nav);
    })
  );

  // ---- Home ----

  function renderHome() {
    const { difficulty, ops } = state.settings;

    const diffEl = $('difficulty');
    diffEl.innerHTML = '';
    for (const [key, d] of Object.entries(G.DIFFICULTIES)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(key === difficulty));
      b.textContent = d.label;
      b.addEventListener('click', () => {
        state.settings.difficulty = key;
        save();
        renderHome();
      });
      diffEl.appendChild(b);
    }

    const opsEl = $('ops');
    opsEl.innerHTML = '';
    for (const [key, op] of Object.entries(G.OPS)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(ops.includes(key)));
      b.innerHTML = `<span class="symbol">${op.symbol}</span><span class="name">${op.label}</span>`;
      b.addEventListener('click', () => {
        const set = state.settings.ops;
        if (set.includes(key)) {
          if (set.length > 1) set.splice(set.indexOf(key), 1);
        } else set.push(key);
        save();
        renderHome();
      });
      opsEl.appendChild(b);
    }

    const lv = state.progress.levels[difficulty];
    const grid = $('levels');
    grid.innerHTML = '';
    for (let n = 1; n <= G.LEVELS; n++) {
      const b = document.createElement('button');
      b.type = 'button';
      const locked = n > lv.unlocked;
      const stars = lv.stars[n] || 0;
      b.disabled = locked;
      if (n === lv.unlocked && !stars) b.classList.add('current');
      b.innerHTML = locked
        ? '<span aria-hidden="true">🔒</span>'
        : `${n}<span class="mini-stars">${'★'.repeat(stars)}</span>`;
      b.setAttribute('aria-label', locked ? `Level ${n}, locked` : `Level ${n}, ${stars} of 3 stars`);
      b.addEventListener('click', () => startLevel(n));
      grid.appendChild(b);
    }

    const { answered, correct } = state.progress.stats;
    $('stats').textContent = answered
      ? `${answered} questions answered · ${Math.round((100 * correct) / answered)}% correct · ${state.progress.learned.length} skill${state.progress.learned.length === 1 ? '' : 's'} learned`
      : 'Pick a level to start. Each level has 10 questions — get 7 right to unlock the next.';
    updateBadge();
  }

  function updateBadge() {
    const badge = $('skills-badge');
    const n = state.progress.learned.length;
    badge.hidden = n === 0;
    badge.textContent = n;
  }

  // ---- Lessons ----

  function showLesson(trick, note, onDone) {
    const q = G.trickQuestion(trick, trick.minSkill);
    $('lesson-title').textContent = trick.title;
    $('lesson-summary').textContent = trick.summary;
    $('lesson-example').textContent = `${q.text} = ?`;
    fillSteps($('lesson-steps'), trick.solve(q));
    $('lesson-note').textContent = note;
    state.onLessonDone = onDone;
    show('lesson');
    $('lesson-go').focus();
  }

  $('lesson-go').addEventListener('click', () => {
    const done = state.onLessonDone;
    state.onLessonDone = null;
    if (done) done();
  });

  function fillSteps(ol, steps) {
    ol.innerHTML = '';
    for (const s of steps) {
      const li = document.createElement('li');
      li.textContent = s;
      ol.appendChild(li);
    }
  }

  // ---- Starting a game ----

  function startLevel(level) {
    const { difficulty, ops } = state.settings;
    const trick = G.pickLesson(state.progress.learned, ops, G.skillFor(difficulty, level));
    if (!trick) return begin({ mode: 'level', difficulty, level, ops });
    showLesson(trick, "You'll get to try it a few times in this level.", () => {
      G.markLearned(state.progress, trick.id);
      save();
      begin({ mode: 'level', difficulty, level, ops, lessonId: trick.id });
    });
  }

  function startPractice(trickId) {
    G.markLearned(state.progress, trickId);
    save();
    begin({ mode: 'practice', difficulty: state.settings.difficulty, level: 1, ops: [], lessonId: trickId });
  }

  function begin(opts) {
    state.session = G.createSession(opts);
    show('play');
    nextQuestion();
  }

  // ---- Playing ----

  function nextQuestion() {
    const s = state.session;
    if (G.isFinished(s)) return finish();
    const q = G.nextQuestion(s);
    state.awaitingNext = false;

    $('play-title').textContent =
      s.mode === 'practice'
        ? `Practice: ${T.get(s.lessonId).title}`
        : `${G.DIFFICULTIES[s.difficulty].label} · Level ${s.level}`;
    $('play-count').textContent = `${s.index + 1}/${s.total}`;
    $('play-score').textContent = s.score;
    $('progress-bar').style.width = `${(100 * s.index) / s.total}%`;
    $('streak').innerHTML = s.streak >= 3 ? `🔥 ${s.streak} in a row` : '&nbsp;';

    const qEl = $('question');
    qEl.textContent = `${q.text} = ?`;
    qEl.classList.remove('pop');
    void qEl.offsetWidth; // restart animation
    qEl.classList.add('pop');

    $('feedback').hidden = true;
    const input = $('answer');
    input.value = '';
    input.disabled = false;
    $('answer-btn').disabled = false;
    input.focus();
    startTimer();
  }

  function startTimer() {
    stopTimer();
    state.questionStartedAt = performance.now();
    const limit = state.session.timeLimit * 1000;
    const bar = $('timer-bar');
    const tick = () => {
      const left = Math.max(0, 1 - (performance.now() - state.questionStartedAt) / limit);
      bar.style.width = `${left * 100}%`;
      if (left > 0) state.timerFrame = requestAnimationFrame(tick);
    };
    tick();
  }

  function stopTimer() {
    cancelAnimationFrame(state.timerFrame);
  }

  $('answer-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!state.session || state.awaitingNext) return;

    const input = $('answer');
    const value = input.value.trim().replace(/[\s,]/g, '').replace('−', '-');
    if (value === '' || !/^-?\d+$/.test(value)) {
      input.classList.remove('shake');
      void input.offsetWidth;
      input.classList.add('shake');
      input.focus();
      return;
    }

    stopTimer();
    const seconds = (performance.now() - state.questionStartedAt) / 1000;
    const res = G.submitAnswer(state.session, value, seconds);
    $('play-score').textContent = state.session.score;
    $('progress-bar').style.width = `${(100 * state.session.index) / state.session.total}%`;
    input.disabled = true;

    const fb = $('feedback');
    fb.hidden = false;
    fb.innerHTML = '';
    if (res.correct) {
      fb.className = 'feedback good';
      fb.textContent = `✓ Correct! +${res.points}`;
      $('answer-btn').disabled = true;
      state.advanceTimeout = setTimeout(nextQuestion, 750);
      return;
    }

    fb.className = 'feedback bad';
    const verdict = document.createElement('p');
    verdict.className = 'verdict';
    verdict.textContent = `✗ ${state.session.current.text} = ${res.expected}`;
    fb.appendChild(verdict);
    if (res.hint) {
      const tip = document.createElement('p');
      tip.className = 'tip';
      tip.textContent = `💡 Try this: ${res.hint.trick.title}`;
      const ol = document.createElement('ol');
      fillSteps(ol, res.hint.steps);
      fb.append(tip, ol);
    }
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'primary';
    next.addEventListener('click', nextQuestion);
    next.textContent = G.isFinished(state.session) ? 'See results' : 'Next';
    fb.appendChild(next);
    $('answer-btn').disabled = true;
    state.awaitingNext = true;
    next.focus();
  });

  $('quit').addEventListener('click', () => {
    clearTimeout(state.advanceTimeout);
    state.session = null;
    show('home');
  });

  // ---- Results ----

  function finish() {
    const s = state.session;
    const r = G.recordResult(state.progress, s);
    save();

    $('result-stars').innerHTML = [1, 2, 3].map((i) => `<span class="${i <= r.stars ? '' : 'off'}">★</span>`).join('');
    $('result-title').textContent =
      s.mode === 'practice'
        ? 'Practice complete'
        : ['Almost there — try again!', 'Level passed!', 'Great job!', 'Perfect!'][r.stars];
    $('result-score').textContent = r.score;
    $('result-detail').textContent =
      `${r.correct} of ${r.total} correct` + (r.bestStreak >= 3 ? ` · best streak ${r.bestStreak}` : '');

    const missedEl = $('result-missed');
    missedEl.innerHTML = '';
    if (r.missed.length) {
      const box = document.createElement('div');
      box.className = 'missed';
      box.innerHTML = '<p>Worth another look</p>';
      const ul = document.createElement('ul');
      for (const m of r.missed) {
        const li = document.createElement('li');
        li.textContent = `${m.text} = ${m.answer} (you said ${m.given})`;
        ul.appendChild(li);
      }
      box.appendChild(ul);
      missedEl.appendChild(box);
    }

    const nextBtn = $('result-next');
    const diffKeys = Object.keys(G.DIFFICULTIES);
    const nextDiff = diffKeys[diffKeys.indexOf(s.difficulty) + 1];
    nextBtn.hidden = true;
    nextBtn.onclick = null;
    if (s.mode === 'level' && r.passed) {
      if (s.level < G.LEVELS) {
        nextBtn.hidden = false;
        nextBtn.textContent = 'Next level';
        nextBtn.onclick = () => startLevel(s.level + 1);
      } else if (nextDiff) {
        nextBtn.hidden = false;
        nextBtn.textContent = `Try ${G.DIFFICULTIES[nextDiff].label}`;
        nextBtn.onclick = () => {
          state.settings.difficulty = nextDiff;
          save();
          startLevel(1);
        };
      }
    }
    $('result-retry').onclick = () =>
      s.mode === 'practice'
        ? startPractice(s.lessonId)
        : begin({ mode: 'level', difficulty: s.difficulty, level: s.level, ops: s.ops });

    state.session = null;
    show('results');
    (nextBtn.hidden ? $('result-retry') : nextBtn).focus();
  }

  $('result-home').addEventListener('click', () => show('home'));

  // ---- Skills library ----

  function unlockHint(trick) {
    const op = G.OPS[trick.op].label.toLowerCase();
    const where = trick.minSkill <= G.LEVELS ? `Easy level ${trick.minSkill}` : `Medium level ${trick.minSkill - 5}`;
    return `Unlocks at ${where} with ${op}`;
  }

  function renderSkills() {
    const list = $('skills-list');
    list.innerHTML = '';
    for (const trick of T.curriculum()) {
      const learned = state.progress.learned.includes(trick.id);
      const card = document.createElement('div');
      card.className = `card skill${learned ? '' : ' locked'}`;

      const head = document.createElement('div');
      head.className = 'skill-head';
      const h = document.createElement('h3');
      h.textContent = `${learned ? '' : '🔒 '}${trick.title}`;
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = `${G.OPS[trick.op].symbol} ${G.OPS[trick.op].label}`;
      head.append(h, tag);

      const p = document.createElement('p');
      p.textContent = learned ? trick.summary : unlockHint(trick);
      if (!learned) p.className = 'muted';

      const row = document.createElement('div');
      row.className = 'row';
      const learn = document.createElement('button');
      learn.type = 'button';
      learn.textContent = learned ? 'Review' : 'Learn it now';
      learn.addEventListener('click', () =>
        showLesson(trick, 'Then try 10 questions that use it.', () => startPractice(trick.id))
      );
      row.appendChild(learn);
      if (learned) {
        const practice = document.createElement('button');
        practice.type = 'button';
        practice.className = 'primary';
        practice.textContent = 'Practise';
        practice.addEventListener('click', () => startPractice(trick.id));
        row.appendChild(practice);
      }

      card.append(head, p, row);
      list.appendChild(card);
    }
  }

  show('home');
})();

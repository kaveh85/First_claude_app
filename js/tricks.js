// Mental math tricks: each one can explain itself, recognise questions it
// helps with, walk through a worked solution, and generate practice questions.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MathTricks = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function randInt(rng, lo, hi) {
    return lo + Math.floor(rng() * (hi - lo + 1));
  }

  function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length)];
  }

  // Order matters: findFor() returns the first (most specific) match.
  const list = [
    {
      id: 'square-5',
      op: 'mul',
      minSkill: 12,
      title: 'Squaring numbers ending in 5',
      summary:
        'Take the tens digit, multiply it by the next number up, then stick 25 on the end.',
      applies: (q) => q.op === 'mul' && q.a === q.b && q.a % 10 === 5 && q.a >= 15 && q.a < 100,
      solve(q) {
        const t = Math.floor(q.a / 10);
        return [`Tens digit is ${t}; next number up is ${t + 1}`, `${t} × ${t + 1} = ${t * (t + 1)}`, `Attach 25 → ${q.answer}`];
      },
      generate(rng) {
        const n = 10 * randInt(rng, 1, 9) + 5;
        return { a: n, op: 'mul', b: n };
      },
    },
    {
      id: 'times-11',
      op: 'mul',
      minSkill: 9,
      title: 'Times 11 for two-digit numbers',
      summary:
        'Spread the two digits apart and put their sum in the middle. If the sum is 10 or more, carry the 1 to the left digit.',
      applies: (q) =>
        q.op === 'mul' && ((q.a === 11 && q.b >= 10 && q.b <= 99) || (q.b === 11 && q.a >= 10 && q.a <= 99)),
      solve(q) {
        const n = q.a === 11 ? q.b : q.a;
        const d1 = Math.floor(n / 10);
        const d2 = n % 10;
        const s = d1 + d2;
        const steps = [`Digits of ${n}: ${d1} _ ${d2}`, `Middle: ${d1} + ${d2} = ${s}`];
        if (s < 10) steps.push(`${d1} ${s} ${d2} → ${q.answer}`);
        else steps.push(`${s} is too big: keep ${s - 10}, carry 1 → ${d1 + 1} ${s - 10} ${d2} → ${q.answer}`);
        return steps;
      },
      generate(rng) {
        const n = randInt(rng, 12, 99);
        return rng() < 0.5 ? { a: 11, op: 'mul', b: n } : { a: n, op: 'mul', b: 11 };
      },
    },
    {
      id: 'times-25',
      op: 'mul',
      minSkill: 13,
      title: 'Times 25 = divide by 4, times 100',
      summary: '25 is a quarter of 100. Divide the other number by 4, then multiply by 100.',
      applies: (q) =>
        q.op === 'mul' && ((q.a === 25 && q.b % 4 === 0) || (q.b === 25 && q.a % 4 === 0)),
      solve(q) {
        const n = q.a === 25 ? q.b : q.a;
        return [`${n} ÷ 4 = ${n / 4}`, `${n / 4} × 100 = ${q.answer}`];
      },
      generate(rng) {
        const n = 4 * randInt(rng, 2, 15);
        return rng() < 0.5 ? { a: 25, op: 'mul', b: n } : { a: n, op: 'mul', b: 25 };
      },
    },
    {
      id: 'times-5',
      op: 'mul',
      minSkill: 2,
      title: 'Times 5 = half of times 10',
      summary: 'Multiplying by 10 is easy, and 5 is half of 10. So multiply by 10, then halve.',
      applies: (q) => q.op === 'mul' && (q.a === 5 || q.b === 5),
      solve(q) {
        const n = q.a === 5 ? q.b : q.a;
        if (n % 2 === 0) return [`Halve first: ${n} ÷ 2 = ${n / 2}`, `${n / 2} × 10 = ${q.answer}`];
        return [`${n} × 10 = ${n * 10}`, `Half of ${n * 10} = ${q.answer}`];
      },
      generate(rng, skill) {
        const n = skill > 8 ? randInt(rng, 12, 48) : randInt(rng, 3, 12);
        return rng() < 0.5 ? { a: 5, op: 'mul', b: n } : { a: n, op: 'mul', b: 5 };
      },
    },
    {
      id: 'times-9',
      op: 'mul',
      minSkill: 4,
      title: 'Times 9 = times 10, minus one more',
      summary: '9 lots of something is 10 lots minus one lot.',
      applies: (q) => q.op === 'mul' && (q.a === 9 || q.b === 9),
      solve(q) {
        const n = q.a === 9 ? q.b : q.a;
        return [`${n} × 10 = ${n * 10}`, `${n * 10} − ${n} = ${q.answer}`];
      },
      generate(rng, skill) {
        const n = skill > 8 ? randInt(rng, 12, 30) : randInt(rng, 3, 12);
        return rng() < 0.5 ? { a: 9, op: 'mul', b: n } : { a: n, op: 'mul', b: 9 };
      },
    },
    {
      id: 'double-halve',
      op: 'mul',
      minSkill: 6,
      title: 'Double and halve',
      summary:
        'Halve the even number and double the other one: the answer stays the same, but the sum gets easier. Great when one number ends in 5.',
      applies: (q) =>
        q.op === 'mul' &&
        ((q.a % 2 === 0 && q.a >= 4 && q.b % 10 === 5) || (q.b % 2 === 0 && q.b >= 4 && q.a % 10 === 5)),
      solve(q) {
        const evenFirst = q.a % 2 === 0 && q.a >= 4 && q.b % 10 === 5;
        const e = evenFirst ? q.a : q.b;
        const o = evenFirst ? q.b : q.a;
        return [`Halve ${e} → ${e / 2}`, `Double ${o} → ${o * 2}`, `${e / 2} × ${o * 2} = ${q.answer}`];
      },
      generate(rng, skill) {
        const e = 2 * randInt(rng, 2, 6);
        const o = 10 * randInt(rng, 1, skill > 10 ? 4 : 2) + 5;
        return rng() < 0.5 ? { a: e, op: 'mul', b: o } : { a: o, op: 'mul', b: e };
      },
    },
    {
      id: 'split-multiply',
      op: 'mul',
      minSkill: 9,
      title: 'Split into tens and ones',
      summary: 'Break the big number into tens and ones, multiply each part, then add the results.',
      applies: (q) => {
        if (q.op !== 'mul') return false;
        const big = Math.max(q.a, q.b);
        const small = Math.min(q.a, q.b);
        return big >= 11 && big <= 99 && big % 10 !== 0 && small >= 2 && small <= 9;
      },
      solve(q) {
        const big = Math.max(q.a, q.b);
        const s = Math.min(q.a, q.b);
        const tens = big - (big % 10);
        const ones = big % 10;
        return [
          `${big} = ${tens} + ${ones}`,
          `${tens} × ${s} = ${tens * s}`,
          `${ones} × ${s} = ${ones * s}`,
          `${tens * s} + ${ones * s} = ${q.answer}`,
        ];
      },
      generate(rng) {
        let big;
        do big = randInt(rng, 12, 49);
        while (big % 10 === 0);
        const s = randInt(rng, 3, 9);
        return rng() < 0.5 ? { a: big, op: 'mul', b: s } : { a: s, op: 'mul', b: big };
      },
    },
    {
      id: 'divide-5',
      op: 'div',
      minSkill: 5,
      title: 'Divide by 5: double, then ÷ 10',
      summary: 'Dividing by 5 is the same as doubling and then dividing by 10.',
      applies: (q) => q.op === 'div' && q.b === 5,
      solve(q) {
        return [`${q.a} × 2 = ${q.a * 2}`, `${q.a * 2} ÷ 10 = ${q.answer}`];
      },
      generate(rng, skill) {
        const quotient = skill > 8 ? randInt(rng, 12, 40) : randInt(rng, 3, 12);
        return { a: 5 * quotient, op: 'div', b: 5 };
      },
    },
    {
      id: 'halve-to-divide',
      op: 'div',
      minSkill: 6,
      title: 'Divide by 4 or 8 by halving',
      summary: 'Dividing by 4 is halving twice. Dividing by 8 is halving three times.',
      applies: (q) => q.op === 'div' && (q.b === 4 || q.b === 8),
      solve(q) {
        const times = q.b === 4 ? 2 : 3;
        const steps = [];
        let n = q.a;
        for (let i = 0; i < times; i++) {
          steps.push(`Half of ${n} = ${n / 2}`);
          n /= 2;
        }
        return steps;
      },
      generate(rng, skill) {
        const b = skill > 8 ? pick(rng, [4, 8]) : 4;
        return { a: b * randInt(rng, 3, skill > 8 ? 25 : 15), op: 'div', b };
      },
    },
    {
      id: 'think-multiply',
      op: 'div',
      minSkill: 1,
      title: 'Turn division into multiplication',
      summary: 'Instead of "what is 42 ÷ 6?", ask "6 times what makes 42?" Your times tables do the work.',
      applies: (q) => q.op === 'div',
      solve(q) {
        return [`Ask: ${q.b} × ? = ${q.a}`, `${q.b} × ${q.answer} = ${q.a}`, `So ${q.a} ÷ ${q.b} = ${q.answer}`];
      },
      generate(rng, skill) {
        const b = randInt(rng, 2, skill > 6 ? 12 : 6);
        return { a: b * randInt(rng, 2, 10), op: 'div', b };
      },
    },
    {
      id: 'round-sub',
      op: 'sub',
      minSkill: 4,
      title: 'Subtract a round number, then fix it',
      summary: 'To take away 19, take away 20 (easy!) and then add the extra 1 back.',
      applies: (q) => {
        if (q.op !== 'sub' || ![8, 9].includes(q.b % 10)) return false;
        return q.a >= q.b + (10 - (q.b % 10));
      },
      solve(q) {
        const extra = 10 - (q.b % 10);
        const r = q.b + extra;
        return [`Round ${q.b} up to ${r} (that's ${extra} too many)`, `${q.a} − ${r} = ${q.a - r}`, `${q.a - r} + ${extra} = ${q.answer}`];
      },
      generate(rng) {
        const b = 10 * randInt(rng, 1, 4) + pick(rng, [8, 9]);
        return { a: b + randInt(rng, 5, 50), op: 'sub', b };
      },
    },
    {
      id: 'count-up',
      op: 'sub',
      minSkill: 3,
      title: 'Count up to subtract',
      summary:
        'Subtraction is the distance between two numbers. Hop from the smaller number to the next ten, then on to the bigger number, and add the hops.',
      applies: (q) => q.op === 'sub' && q.b >= 10 && q.a % 10 < q.b % 10,
      solve(q) {
        const t = Math.ceil(q.b / 10) * 10;
        return [`${q.b} → ${t} is ${t - q.b}`, `${t} → ${q.a} is ${q.a - t}`, `${t - q.b} + ${q.a - t} = ${q.answer}`];
      },
      generate(rng) {
        const tens = randInt(rng, 1, 5);
        const units = randInt(rng, 5, 9);
        const b = 10 * tens + units;
        const a = 10 * randInt(rng, tens + 1, tens + 5) + randInt(rng, 0, units - 1);
        return { a, op: 'sub', b };
      },
    },
    {
      id: 'round-add',
      op: 'add',
      minSkill: 3,
      title: 'Round and adjust',
      summary: 'Round a number ending in 8 or 9 up to the next ten, add, then take away the extra.',
      applies: (q) =>
        q.op === 'add' && Math.max(q.a, q.b) >= 10 && ([8, 9].includes(q.a % 10) || [8, 9].includes(q.b % 10)),
      solve(q) {
        const n = [8, 9].includes(q.b % 10) ? q.b : q.a;
        const other = n === q.b ? q.a : q.b;
        const extra = 10 - (n % 10);
        const r = n + extra;
        return [`Round ${n} up to ${r} (that's ${extra} too many)`, `${other} + ${r} = ${other + r}`, `${other + r} − ${extra} = ${q.answer}`];
      },
      generate(rng) {
        const a = randInt(rng, 12, 60);
        const b = 10 * randInt(rng, 1, 5) + pick(rng, [8, 9]);
        return { a, op: 'add', b };
      },
    },
    {
      id: 'make-ten',
      op: 'add',
      minSkill: 1,
      title: 'Make a ten',
      summary:
        'Borrow a little from one number to fill the other up to the next ten. Adding to a round number is easy.',
      applies: (q) => q.op === 'add' && q.a % 10 !== 0 && q.b % 10 !== 0 && (q.a % 10) + (q.b % 10) > 10,
      solve(q) {
        // Fill up whichever number is closer to its next ten.
        const fillA = q.a % 10 >= q.b % 10;
        const f = fillA ? q.a : q.b;
        const g = fillA ? q.b : q.a;
        const need = 10 - (f % 10);
        return [`${f} needs ${need} to reach ${f + need}`, `Take ${need} from ${g} → ${g - need}`, `${f + need} + ${g - need} = ${q.answer}`];
      },
      generate(rng, skill) {
        let a = randInt(rng, 5, 9);
        const b = randInt(rng, Math.max(2, 11 - a), 9);
        if (skill > 4) a += 10 * randInt(rng, 1, 4);
        return rng() < 0.5 ? { a, op: 'add', b } : { a: b, op: 'add', b: a };
      },
    },
  ];

  const byId = Object.fromEntries(list.map((t) => [t.id, t]));

  function get(id) {
    return byId[id] || null;
  }

  // The most specific trick that helps with this question, plus a worked solution.
  function findFor(question) {
    const trick = list.find((t) => t.applies(question));
    return trick ? { trick, steps: trick.solve(question) } : null;
  }

  // Tricks sorted in the order a player should meet them.
  function curriculum() {
    return list.slice().sort((x, y) => x.minSkill - y.minSkill);
  }

  return { list, get, findFor, curriculum };
});

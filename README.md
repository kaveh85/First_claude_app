# Mind Math 🧠

A small mental math game that keeps your mind sharp. Solve quick sums in your head, climb through levels, and pick up new calculation tricks along the way.

## Play

No install or build step. Open `index.html` in any browser (it works on phones too). Or serve the folder:

```sh
npm start   # then visit http://localhost:8000
```

## How it works

- **Difficulty**: Easy, Medium or Hard. Each one has 10 levels, and the numbers get bigger level by level.
- **Operations**: choose any mix of addition, subtraction, multiplication and division.
- **Levels**: each level has 10 questions. Get 7 right to unlock the next level. You earn up to 3 stars per level (7, 9 and 10 correct).
- **Challenging, not stressful**: a timer bar gives bonus points for fast answers, but there is no penalty when it runs out. The game also adapts as you play. Three quick correct answers in a row make the numbers a little harder, and two misses in a row make them a little easier.
- **New skills**: when you reach a level where a new mental math trick becomes useful, the game teaches it first and then works it into that level. Examples are *make a ten*, *times 11*, *count up to subtract* and *squaring numbers ending in 5*. If you miss a question, it shows a step-by-step solution using a matching trick. The **Skills** page lists every trick, so you can review or practise any of them.
- Your progress is saved in your browser (localStorage).

## Project layout

| File | Purpose |
| --- | --- |
| `index.html`, `css/style.css` | Page structure and styling (light and dark mode) |
| `js/game.js` | Game logic: question generation, levels, scoring, adaptive difficulty, progress |
| `js/tricks.js` | Mental math tricks: explanations, worked solutions, practice questions |
| `js/app.js` | UI wiring |
| `tests/` | Unit tests for the logic |

## Tests

```sh
npm test
```

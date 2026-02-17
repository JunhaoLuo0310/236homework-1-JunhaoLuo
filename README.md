# 236homework-1-JunhaoLuo
# Report

## Summary
This homework builds a small GitHub Pages website as a personal coding blog hub. It includes (1) a homepage designed to be expandable for future assignments, (2) a Valentine’s-themed Pac-Man game playable directly in the browser, and (3) an auto-updating arXiv paper feed page that refreshes nightly via GitHub Actions. For Problems 1–2, I primarily used ChatGPT to scaffold the webpage and implement/debug the Pac-Man game. For Problem 3, I used GitHub Copilot CLI as the primary tool to scaffold, implement, and automate the arXiv pipeline, as required.

## Links
- Homepage (Problem 1): **https://junhaoluo0310.github.io/236homework-1-JunhaoLuo/**
- Valentine’s Pac-Man (Problem 2): **https://junhaoluo0310.github.io/236homework-1-JunhaoLuo/pacman.html**
- arXiv Feed (Problem 3): **https://junhaoluo0310.github.io/236homework-1-JunhaoLuo/arxiv.html**

## Tools used
- GitHub Pages (deployment / hosting)
- Git and GitHub (version control, commits, submission)
- GitHub Actions (automation for Problem 3)
- AI tools:
  - **ChatGPT** (primary for Problems 1–2: site structure, UI text, gameplay implementation, debugging)
  - **GitHub Copilot CLI** (primary for Problem 3: scaffolding + implementation + automation)

---

## Problem 1. GitHub Website Homepage for Coding Blog

### Goal
Create a homepage for a coding blog website hosted on GitHub Pages. The design should be expandable to add more content from future assignments. The homepage should link to the Pac-Man page and the arXiv feed page.

### What I built
- A simple homepage (`index.html`) with a short intro and a navigation area linking to:
  - Valentine’s Pac-Man (Problem 2)
  - arXiv Feed (Problem 3)
- Styling choices: **[briefly describe your style: minimal / dark theme / card layout / etc.]**
- The layout is intentionally modular so I can add more pages and sections later.

### How I used ChatGPT (Problem 1)
I used ChatGPT to draft the structure and content of the homepage and to resolve early GitHub Pages setup issues. In particular:
- I asked for a homepage layout that can scale as a “coding blog hub” (navigation + expandable sections).
- I debugged an early “blank page” issue on GitHub Pages by verifying which branch/folder Pages was serving and ensuring the correct entry file (e.g., `index.html`) existed in the published location.

### Files touched (Problem 1)
- `index.html`
- `assets/style.css`

---

## Problem 2. Game Coding: Valentine’s Pac-Man 💘

### Goal
Create a new page on the website with a playable Pac-Man-like game that includes:
- Maze + pellets
- Ghosts that chase Pac-Man
- Lives and game over condition
- Rose power-up 🌹 that triggers continuous heart shooting 💕
- Hearts eliminate ghosts on hit

### What I built
- A canvas-based Pac-Man game running entirely in the browser (static hosting; no backend).
- Player controls: arrows/WASD; restart with **R**. **[edit if different]**
- Ghost AI: simple chase logic and grid-based movement.
- Rose power-up: spawns periodically; when collected, Pac-Man enters a powered state that continuously fires hearts in the facing direction for a limited time.
- Heart projectiles: collide with ghosts to eliminate them temporarily; ghosts respawn after a short delay.

### How I used ChatGPT (Problem 2): interaction + iterations
I used ChatGPT as the primary tool to implement the game and iterate through multiple debugging cycles:

1. **Gameplay tuning**
   - After the first working version, I asked to reduce player movement speed because the game felt too hard.

2. **Cross-browser bug discovery (Safari vs Chrome)**
   - I observed that the game could behave differently across devices/browsers: on Safari it looked correct, while on Chrome some ghosts became static or partially moved then froze.

3. **Debugging stability (tile-centering + floating point tolerance)**
   - I shared the movement function (`stepTileMovement`) and described the behavior.
   - The root issue was that movement/turning logic relied on strict “at tile center” checks. Different browsers can accumulate floating-point drift differently, so ghosts might never be recognized as “exactly at center” in Chrome and therefore never choose new directions.
   - The fix strategy was to use tolerance-based snapping near tile centers (instead of exact float equality) so direction selection and tile transitions happen reliably across browsers.

4. **Version control recovery**
   - When a code change broke controls, I asked how to return to a previous GitHub version and used commit history to restore a working baseline.

### Key issues encountered and how they were resolved
- **Ghost freezing in Chrome:** adjusted tile-centering detection to be tolerance-based and/or snap-to-center more reliably.
- **Player control breaking after edits:** reverted to a known-good commit and re-applied only minimal changes.
- **Pellets not being eaten / pass-through:** avoided strict float equality; checked pellet pickup at stable states (e.g., when snapped to tile center).
- **“Works sometimes” behavior:** addressed browser caching by hard refresh and (when needed) cache-busting the JS URL.

### Files touched (Problem 2)
- `pacman.html` **[or your game page filename]**
- `assets/pacman.js`

---

# Problem 3. Data Scaffolding from the Internet: Auto-updating arXiv Feed (Copilot CLI)

## Goal
Build an arXiv feed page that displays the latest arXiv papers matching keywords of my choice. Each entry must show the paper **title, authors, abstract, and a direct PDF link**. The list must **auto-update every midnight** via GitHub Actions. The homepage must link to this page. The repo must include the `.github` directory with workflows/config files. **Copilot CLI must be the primary coding tool**.

## Workflow overview
Nightly GitHub Actions run → call arXiv Atom API → parse results → write `assets/arxiv.json` → commit/push updates → GitHub Pages serves latest JSON → `arxiv.html` fetches and renders the list.

## Copilot CLI Integration Summary (actual usage)

### Component 1: Data Fetching Script (`scripts/fetch_arxiv.py`)

**Initial prompt**  
Create `scripts/fetch_arxiv.py` for a GitHub Pages site. It should query arXiv using the Atom API (`http://export.arxiv.org/api/query`), fetch latest 15 papers matching keywords: `("large language model" OR LLM OR RAG) AND (biostatistics OR medical OR clinical)`. Parse Atom XML into JSON and write `assets/arxiv.json` with fields: `generated_at_utc`, `search_query`, `count`, `papers[]`. Each paper: `title`, `authors`, `abstract`, `pdf_url`, `arxiv_url`, `published`, `updated`, `categories`. Use only Python standard library.

**Copilot output**
- A full stdlib-based implementation using `urllib`, `json`, `xml.etree.ElementTree`, `datetime`, and filesystem utilities
- Correct XML namespace handling for Atom parsing
- Try/except error handling
- JSON output structured exactly with required fields

**What worked well**
1. Namespace handling: provided the correct namespace dict for Atom/arXiv
2. Author extraction: looping through `atom:author` elements worked reliably
3. PDF URL construction: fallback PDF derivation when link element wasn’t present
4. Error reporting: useful stderr output for debugging on CI/CD

**What required iteration**
1. Search query refinement: I temporarily tested a category-based query like `(cat:cs.CL OR cat:cs.LG OR cat:stat.ML) AND all:(RAG OR "large language model" OR LLM)`, then reverted back to the biostatistics/medical/clinical query per requirements.
2. JSON structure validation: I verified all required fields were present and correctly populated.

**Final file**
- `scripts/fetch_arxiv.py` (made executable with `chmod +x`)

---

### Component 2: Frontend Display (`arxiv.html`)

**Initial prompt**  
Write `arxiv.html` that loads `assets/arxiv.json` (cache-busting) and renders cards with title, authors, abstract, and PDF link. No frameworks, plain HTML/CSS/JS. Use a dark theme to match an existing Pac-Man page style.

**Copilot output**
- A full HTML page with embedded CSS and vanilla JS
- Loading/error UI states
- Dynamic rendering using fetch + template strings
- HTML escaping helper to reduce XSS risk

**What worked well**
1. Cache-busting: used a timestamp query string to reduce stale browser caching
2. Dark theme integration: reused CSS variables to match site theme
3. Card styling: clean layout and hover transitions
4. Responsive behavior: grid layout that adapts to mobile
5. Accessibility: semantic elements and reasonable structure

**What required iteration**
1. File creation issues: heredoc/shell escaping issues when creating large HTML in terminal; resolved by writing the file using a safer method.
2. Navigation consistency: updated header links to match the homepage.
3. Abstract truncation: refined visual hierarchy by limiting abstract preview length.

**Final file**
- `arxiv.html` (renders up to 15 papers dynamically)

---

### Component 3: GitHub Actions Workflow (`.github/workflows/update-arxiv.yml`)

**Initial prompt**  
Write `.github/workflows/update-arxiv.yml` to run nightly (00:00 UTC) and on `workflow_dispatch`, run `python scripts/fetch_arxiv.py`, then commit and push `assets/arxiv.json` if changed. Include `permissions: contents: write`.

**Copilot output**
- A working Actions workflow with:
  - cron schedule: `0 0 * * *` (00:00 UTC daily)
  - Python setup via `actions/setup-python`
  - diff check to avoid unnecessary commits
  - conditional commit/push behavior

**What worked well**
1. Conditional commits: avoids spam commits if the feed is unchanged
2. Permissions: `contents: write` allows committing without a separate PAT
3. Git user config: clean attribution for Actions commits
4. Skip CI marker: prevents workflow loops from the bot’s commit

**What required iteration**
1. Permissions missing in an early draft: added `permissions: contents: write`.
2. Checkout version: confirmed usage of `actions/checkout@v4`.

**Final file**
- `.github/workflows/update-arxiv.yml`

---

## Interaction summary: what worked well (Copilot CLI)
| Area | Success factor |
|---|---|
| Stdlib-only approach | No dependency install needed in Actions |
| Namespace handling | Correct Atom/arXiv namespace patterns |
| Cache-busting | Simple query-string approach reduced stale JSON |
| Conditional commits | Only commits when JSON changes |
| Error handling | Script + page both included fallback behavior |

## Iteration summary: what required changes (Copilot CLI)
| Issue | Root cause | Resolution |
|---|---|---|
| File writing failures | Shell escaping problems | Used a safer file creation method |
| Search query changes | Tested alternate filtering | Reverted to spec keywords |
| Missing workflow permissions | Incomplete initial YAML | Added `permissions: contents: write` |
| Navigation mismatch | Old template links | Updated to match homepage |

## Final deliverables checklist (Problem 3)
- `scripts/fetch_arxiv.py` generates the feed JSON ✅
- `assets/arxiv.json` produced by the script ✅
- `arxiv.html` renders the feed with cache-busting ✅
- `.github/workflows/update-arxiv.yml` runs nightly + supports manual trigger ✅
- `.github/` directory included in repo ✅

---

## What I learned
- For web/game development, ChatGPT helped me rapidly prototype and iterate, but cross-browser reliability required careful handling of timing and floating-point assumptions.
- For the arXiv feed, Copilot CLI was especially useful for quickly generating correct boilerplate (Atom namespace parsing, workflow YAML, and vanilla JS rendering) and supporting an agentic workflow: plan → implement → automate.
If you paste this and it still shows “no formatting,” it usually means you accidentally wrapped everything inside triple backticks in your README. In that case, remove the outer ```md fences and paste the content directly (the headings like # and ## will render automatically)


---


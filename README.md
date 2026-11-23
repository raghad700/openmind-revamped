# OpenMind — Interactive Learning 

OpenMind is a bilingual educational platform descended from [EduMind Game Studio](https://github.com/YassoBases/edumind-game-studio). It helps students build understanding through exploration, interaction, feedback, and applying what they learn. The interface supports English and Arabic with RTL layouts and bundles the Cairo variable font.

- **Primary school (grades 1–6).** Students choose a lesson or enter a topic to create an AI-assisted Lesson World, then play through stages using five hand-built Phaser game families.
- **Middle school (grades 7–9).** Students use Flutter lessons, interactive tools, and checkpoints. Bundled curriculum currently covers Grade 7 mathematics and social studies in Arabic. The English interface can show the Arabic content, and grades 8 and 9 have a coming-soon view.
- **Student support.** Ask Hudhud offers conversational guidance and can use the current lesson as context. Nahla celebrates progress and rewards during games.

The AI generates structured educational content such as teaching cards and practice items. The bundled Phaser runtime supplies the executable game code and uses the same content format for generated games and demos.

## Why OpenMind Is a Revamp of EduMind

The comparison uses [EduMind's documented architecture](https://github.com/YassoBases/edumind-game-studio/blob/0349702/README.md) and OpenMind's current implementation.

| Area | Original EduMind | Current OpenMind |
| --- | --- | --- |
| LLM output | Generated a structured spec and executable Phaser JavaScript for each game. | Generates structured JSON content for game specs, world plans and stages. The game pipeline has no JavaScript generation step. |
| Mechanics and templates | Six pedagogical templates and four archetypes guided code generation. | Five hand-built Phaser families. Four support standalone generation, and all five support Lesson World stages. Number City supports stage generation. |
| Validation and repair | Validated generated code, repaired failures, and ran a Playwright playability check in the generation pipeline. | Fresh game and stage specs use schema and semantic validation, a model-based fact-check, bounded item repair where applicable, and moderation. World plans have their own validation and moderation gates. Playwright runs separately against the bundled shell. |
| Runtime consistency | Each generated script supplied part of the runtime behavior, so two generations could behave differently. | Demos and generated specs use the same versioned shell and mechanics. Content, variants, and game outcomes can still differ. |
| AI model choices | Claude Sonnet 4.6 for specs and code, with Haiku 4.5 for normalization, repair, and feedback. | Configurable defaults are Haiku 4.5 and Sonnet 4.6 for escalation. Normalization, fact-checking, and tutoring use the default model. Keyless development uses Mock. |
| Generation cost and latency | Included a separate code-generation call and browser check. The historical documentation reports estimates and cache-dependent timings. | Eliminates those per-generation steps. The figures below describe historical measurements, live estimates, and targets. |
| Security implications | The player executed generated JavaScript after validation and repair. | The application is designed to play validated data in bundled code. JSON is still embedded in HTML, so correct escaping is part of the security boundary. |
| Target learners | Grades 7–12. | Lesson Worlds for grades 1–6 and a Flutter learning area for grades 7–9, with bundled curriculum currently limited to Grade 7 on the middle-school side. |
| Offline replay | Stored saved game HTML for offline replay where local storage was available. | Stores game specs and replays them with the bundled shell. Cached playback is separate from pending progress uploads, which have no automatic retry in the primary app. |
| Educational interaction | Adaptive gameplay guided by pedagogical templates, with a structured learning summary. | Staged Lesson Worlds combine teaching, practice, feedback, and application. Middle-school lessons use Flutter interactives, readiness checkpoints, and contextual tutoring. |

Standalone generation normally attempts the default model twice and then the escalation model. High complexity, low normalization confidence, or Arabic with `ESCALATE_ARABIC=true` can trigger direct escalation. World planning uses complexity and confidence for direct escalation and otherwise tries the default model followed by escalation. Stage generation uses the default model or content supplied by the world planner first, then can retry with the escalation model. [Standalone pipeline](backend/src/pipeline/generator.ts) · [World routing](backend/src/routes/worlds.ts) · [World and stage pipeline](backend/src/pipeline/worlds.ts)

The backend HTML assembler escapes the JSON for its script slot. Flutter's assembler currently leaves literal less-than characters unchanged, so the data-only design should not be read as a guarantee that model output cannot enter an executable context. [Backend assembler](backend/src/pipeline/assembler.ts) · [Flutter assembler](edumind-ui/lib/core/spec_assembler.dart)

## Stack and repository map

| Location | Responsibility |
| --- | --- |
| [edumind-ui/](edumind-ui/) | Current Flutter app, with Dart `^3.8.1`, Material, Provider, SharedPreferences and an HTTP client. Start at `lib/main.dart` and `lib/edumind_root.dart`. The web player embeds the shell in an iframe. Native playback uses `webview_flutter`. |
| [backend/](backend/) | Node.js 22+, TypeScript, Fastify 5, Pino, Zod 4 and Swagger UI. `src/app.ts` registers students, worlds, games, tutor, learning progress/evidence, tools, review, stats, curriculum and placement routes. Prisma 6 supports PostgreSQL 16, with in-memory storage for development. |
| [backend/src/llm/](backend/src/llm/) and [backend/src/pipeline/](backend/src/pipeline/) | Anthropic structured output and prompt caching. Defaults are Claude Haiku 4.5 and Sonnet 4.6 for generation escalation. OpenAI omni-moderation is the registered moderation provider. An optional image endpoint supports standalone game thumbnails, with SVG as the default. |
| [shared/](shared/) | Zod contracts, structured-output schemas, semantic validators and assembly for game and world specs. |
| [shells/](shells/) and [samples/](samples/) | Phaser 4.1.0 games and shared runtime, golden JSON specs, browser preview and Playwright tests. The build emits one `edumind.html` and a manifest, and copies assets into the backend and both Flutter apps. |
| [flutter_module/](flutter_module/) | Separate reference Flutter app with the standalone game composer, player, local library and review flow. Its navigation and feature coverage differ from the learner app in `edumind-ui/`. |
| [scripts/](scripts/) | Optional asset tooling. See the [Kenney asset notes](scripts/KENNEY_README.md). |
| [docs/](docs/) and [backend/prisma/](backend/prisma/) | Integration guides, Prisma schema and migration history. Root Composer files declare a Swagger dependency. The documented runtime uses the Node workspaces and Flutter. |

### Game templates

| Template | Mechanics and generation coverage |
| --- | --- |
| Quest Path (`quest_path`) | Path-based questions with bridge and lantern variants. Bundled demos, standalone generation and world stages. |
| Goal Shootout (`goal_shootout`) | Football-themed questions with draw-pass and keeper variants. Bundled demos, standalone generation and world stages. |
| Draw & Connect (`draw_connect`) | Diagram connections and classification boards. Bundled demos, standalone generation and world stages. |
| My Town / Number City (`number_city`) | Tap, collect, sequence and build activities. Bundled demos and world-stage generation. |
| Scene Play / Wonder Lab (`scene_play`) | Rotation, cause and effect, find and fix, and creative interactions. Bundled demos, standalone generation and world stages. |

See the [generation allowlists and mechanics](shared/src/constants.ts) and [game implementations](shells/src/games/).

## Architecture and data flow

1. **Identity.** Onboarding creates a nickname-based student profile through `POST /api/v1/students`. Flutter saves the device bearer token and uses `GET /api/v1/students/me` to check the session and refresh grade and stage. Registration and profile changes have retry paths for offline use. The API stores token hashes. Live generation and moderation can send learner questions or learning context to their providers. Treat device tokens as credentials.
2. **Primary learning.** Home opens the lesson picker, which sends a catalog lesson or free-text topic to `POST /api/v1/worlds`. The backend plans the world and returns its map and first stage spec. The app loads later stages from its cache or the stage API. It can request generation and poll for a spec when one is pending. On completion, the player returns a summary through the Phaser bridge. The Flutter map records progress locally and attempts to post the summary to the stage session API. A failed upload can leave a pending summary on the device. See the implementation status below for offline upload coverage.
3. **Generation and playback.** The backend selects live or mock providers. Standalone generation normalizes the request, moderates input, generates content, validates the spec, fact-checks and repairs items, and moderates output. World planning and stage generation use their own structured schemas and validation gates. Flutter injects the resulting spec into its bundled shell and receives ready, progress and completion events through a JavaScript bridge. API clients can also request assembled HTML for standalone games. See the [REST API guide](docs/API.md) and local Swagger UI for integration details.
4. **Middle-school learning.** Start and Journey open Flutter lesson experiences from bundled catalog JSON. The lesson player renders the steps and interactive widgets in Flutter. The app records local progress and evidence, synchronizes them through `/api/v1/learn/progress` and `/api/v1/learn/evidence`, and uses readiness to select checkpoints and support. Balance-scale and timeline widgets can call `POST /api/v1/tools/:toolId/verify`. The lesson-tool endpoint grades the supplied puzzle and answer, while the tutor can check a submitted answer against its own previously issued puzzle.
5. **Storage.** Flutter uses SharedPreferences for session, world metadata and learning state, and IndexedDB on web or Drift/SQLite on native for saved specs. Cached stages can replay with the bundled shell. Server stores include students, game and world records, sessions, tutor history, learning progress/evidence and spec caches. Without a usable PostgreSQL connection, server data and tokens are lost when the process restarts.

## Implementation status

| Status | Scope |
| --- | --- |
| **Verified Working** | The Node build, backend typecheck, Node and Flutter tests, and keyless HTTP smoke checks listed below. This includes a Flutter web smoke test of session restore and Ask Hudhud, mock world API coverage and a PostgreSQL profile persistence check. |
| **Implemented but Not Verified** | End-to-end Flutter onboarding, Lesson Worlds, stage caching and replay, the Grade 7 Journey and the contextual lesson-help sheet. The main tutor tab was exercised in the web smoke test. The live Anthropic, OpenAI moderation and optional image integrations have code paths. See verification below for runtime coverage. |
| **Implemented but Not Verified** | Standalone game creation and review have registered endpoints and call sites in the reference Flutter app. The current app's primary creation entry point uses Lesson Worlds. |
| **Not connected in the primary app** | Placement and curriculum APIs are registered in Fastify. The Flutter app has no placement-test UI or caller, and Journey uses its bundled catalog. Stored stage summaries have no automatic upload retry. |
| **Partially Implemented** | Primary navigation covers grades 1–6, with bundled math and science material for grades 1–3. The middle-school shell covers grades 7–9. The Grade 7 math and social studies catalogs are Arabic assets, with an Arabic content fallback for English UI. Grades 8 and 9 show a coming-soon view. |
| **Mock/Fallback** | Keyless game and world generation uses fixtures and simulated latency. The mock tutor uses scripted and keyword-based responses, including study-mode branches and tool selection. Missing or unreachable PostgreSQL selects the in-memory store. Missing thumbnail integration selects SVG. |
| **Planned** | Full AI-generated background sets are design work. The interactive platform guide also proposes more tools and curriculum coverage. See [DECISIONS.md](DECISIONS.md) and the [interactive platform roadmap](docs/INTERACTIVE_PLATFORM.md). |
| **Unverified with live providers** | Educational quality, latency and actual AI cost across both languages and learning flows. [PERF.md](PERF.md) distinguishes historical measurements from estimates. |

## Ask Hudhud

- **How it opens.** Both grade-based shells navigate to `AskScreen`, and middle-school Start and Journey shortcuts can select that tab. An experience step's help button opens the contextual `openAskHudhud` sheet. Both surfaces use `TutorChat`. The sheet passes the subject, path, current step, widget state, recent attempts, skills and readiness, and offers quick actions that submit real tutor questions. The chat tab remembers its active conversation and can restore it.
- **What runs.** With a registered session, typing a question or choosing a starter sends an authenticated JSON request to `POST /api/v1/tutor/messages`. The backend rate-limits and moderates the question, retrieves conversation context, calls the configured provider and returns a structured reply. The client can render explanations, follow-ups and approved interactive blocks. The backend validates tool payloads, grades supported answers against the issued instance, stores conversation turns and can record verified skill evidence. History is read from `GET /api/v1/tutor/conversations/:id`.
- **Which tools exist.** The tutor has six registered tools: `number_line`, `order_sequence`, `sort_buckets`, `match_pairs`, `balance_scale` and `timeline`. The lesson widget registry has `triangle_area`, `balance_scale` and `timeline`. Balance scale and timeline share logic across the two surfaces. If the tutor identifies a missing mechanic, the backend can log the suggestion and return a conversational fallback. The app has no runtime mechanism to generate or install new widgets.
- **Which study modes exist.** The middle-school tutor tab offers exam preparation, lesson discovery, backlog planning, solve diagnosis and quick review. The selection sends `context.mode` through the regular conversation. Mode-specific Claude prompts and mock branches are implemented. The modes operate as conversations. The current code has no separate scheduling or task-tracking workflow for them.
- **What requires a backend.** An unregistered learner gets a registration/retry prompt. Both the live and mock tutor require the HTTP API. The keyless backend smoke verifies a mock clarification turn and restored history. The primary web smoke also verified the main-tab exam-prep request. Live model pedagogy and lesson-sheet behavior in a running app remain unverified.

The wired entry points are [the root navigation](edumind-ui/lib/edumind_root.dart) and [the lesson experience](edumind-ui/lib/features/learn/experience_screen.dart). See the [tutor route](backend/src/routes/tutor.ts) and [Ask Hudhud interactive tutoring](docs/ASK_HUDHUD_INTERACTIVE.md) for the contract. The guide’s future-study-mode section predates the current study-mode implementation.

## Local setup

Install Git, Node.js 22+ with npm, and a Flutter SDK whose Dart version satisfies the app's `^3.8.1` constraint. Use Chrome for local Flutter web development. For phone builds, install the relevant Flutter platform tooling and check it with `flutter doctor`. Docker Compose is optional for PostgreSQL.

From a fresh clone:

```bash
git clone https://github.com/raghad700/openmind-revamped.git
cd openmind-revamped
npm ci
npm run build
npm -w backend run prisma:generate
npm run dev:backend
```

The root build compiles shared TypeScript and packages game assets. It can refresh tracked Flutter manifests. The backend listens on port 8080 by default. Check `http://localhost:8080/api/v1/health` and open Swagger UI at `http://localhost:8080/api/docs`. Use keyless mock mode and memory storage for your first run.

In a second terminal:

```bash
cd edumind-ui
flutter pub get
flutter run -d chrome
```

For a release-style web preview:

```bash
cd edumind-ui
flutter build web --no-web-resources-cdn
node tool/serve.mjs
```

Open `http://localhost:5000`. The build flag uses the bundled Flutter web renderer assets. Set the preview server's `PORT` in its own terminal if needed. The Flutter API base defaults to `http://localhost:8080`. On a physical phone or emulator, pass a host reachable from that device using `--dart-define=API_BASE_URL=...` or update the API URL in Settings. Run `flutter devices` to select a supported target.

For local persistence, run `docker compose up -d db` from the root and configure `DATABASE_URL` and `DIRECT_URL` for a new, disposable database. The checked-in migration chain currently fails on a fresh database. For local feature testing, you can initialize a separate empty database from the current Prisma schema with `npm -w backend exec -- prisma db push --skip-generate`, then check the backend startup log for a PostgreSQL connection. Use memory mode or a new disposable database if you already attempted the failing migrations.

`npm -w backend run prisma:deploy` is the repository's migration command. The [migration guide](backend/prisma/MIGRATIONS.md) describes an earlier migration history. Existing databases require a review of their applied migration records before any schema change.

## GitHub Codespaces

Use Node.js 22+ and Flutter 3.50.1 with Dart 3.14.0. The repository does not install Flutter automatically. In a Bash terminal, install it once if it is missing:

```bash
if [ ! -x "$HOME/flutter/bin/flutter" ]; then
  git clone --depth 1 --branch 3.50.1 https://github.com/flutter/flutter.git "$HOME/flutter"
fi
grep -qxF 'export PATH="$HOME/flutter/bin:$PATH"' "$HOME/.bashrc" ||
  printf '\nexport PATH="$HOME/flutter/bin:$PATH"\n' >> "$HOME/.bashrc"
source "$HOME/.bashrc"
flutter --version
```

### First run

From the repository root, install dependencies and build the shared assets:

```bash
npm ci
npm run build
npm -w backend run prisma:generate
```

**Terminal 1 — Backend**

```bash
cd "$(git rev-parse --show-toplevel)"
MOCK_LLM=true DATABASE_URL= HOST=0.0.0.0 PORT=8080 npm run dev:backend
```

Keep this terminal running. In the **Ports** panel, forward port **8080** and copy its HTTPS URL.

**Terminal 2 — Flutter web**

```bash
cd "$(git rev-parse --show-toplevel)/edumind-ui"
flutter pub get
read -rp 'Forwarded HTTPS URL for port 8080: ' OPENMIND_API_URL
flutter build web --no-web-resources-cdn \
  --dart-define="API_BASE_URL=${OPENMIND_API_URL%/}"
PORT=5000 node tool/serve.mjs
```

Keep this terminal running. Open port **5000** from the **Ports** panel to use OpenMind. Check the backend at `https://<forwarded-8080-url>/api/v1/health`.

### Restart an existing Codespace

Start the backend and web preview in separate terminals:

```bash
cd "$(git rev-parse --show-toplevel)"
MOCK_LLM=true DATABASE_URL= HOST=0.0.0.0 PORT=8080 npm run dev:backend
```

```bash
cd "$(git rev-parse --show-toplevel)/edumind-ui"
PORT=5000 node tool/serve.mjs
```

Rebuild the Flutter web app if its source or the backend URL changes. Backend data uses temporary in-memory storage and is cleared when the backend restarts.

## Configuration

No credentials are required for keyless development. The backend reads process variables and uses dotenv from its working directory. With npm workspace commands, use `backend/.env` or export variables in the shell. The root [.env.example](.env.example) is a reference. Store Codespaces credentials as secrets and keep local credential files out of Git.

| Use | Names and behavior |
| --- | --- |
| HTTP and logging | `HOST`, `PORT`, `CORS_ORIGINS`, `LOG_LEVEL`, `NODE_ENV` |
| PostgreSQL | `DATABASE_URL`, `DIRECT_URL`. Prisma uses the direct connection for migration workflows. |
| Live generation and tutor | `ANTHROPIC_API_KEY`, `MODEL_DEFAULT`, `MODEL_ESCALATION`, `PROMPT_CACHE_TTL`, `ESCALATE_ARABIC` |
| Mock development | `MOCK_LLM`, `MOCK_LATENCY_MS`. The backend selects mock automatically when the Anthropic key is absent. |
| Moderation | `MODERATION_API_KEY` or `OPENAI_API_KEY`, `MODERATION_PROVIDER`, `MODERATION_STRICT`, `MODERATION_DISABLED`. Live startup requires a moderation credential unless the development bypass is explicitly enabled. Strict moderation fails closed by default in live mode. |
| Optional AI thumbnails | `IMAGE_PROVIDER_API_KEY`, `IMAGE_PROVIDER_URL` |
| Quotas | `MAX_GENERATIONS_PER_HOUR`, `MAX_WORLDS_PER_HOUR`, `MAX_TUTOR_MESSAGES_PER_HOUR`, `MAX_TOOL_VERIFY_PER_MINUTE` |
| Preview and Flutter build | `PREVIEW_PORT` for shell preview, `PORT` for the Flutter static server, and Flutter define `API_BASE_URL`. The reference app uses `SHOW_DEMOS`. The current app declares the same flag and opens its Settings gallery unconditionally. |

## Preview and tests

Run these from the repository root after setup. The checkout includes local test scripts and no checked-in GitHub Actions workflow.

```bash
npm run preview
npm test
npm -w backend run typecheck
npx playwright install chromium
npm run test:e2e
```

The shell preview at `http://localhost:8765` exercises golden examples and offers progressive-start and generation-failure simulations. In Flutter, open **Settings → Demo Games** on the primary navigation to try bundled specs. The gallery is in the Debug Tools section of Settings.

For Flutter checks, run `flutter pub get`, `flutter test`, `flutter analyze` and `flutter build web` in `edumind-ui/`. Run the same checks in `flutter_module/` when working on reference-app or shell parity. The optional `npm run seed` command creates a demo student and prints a device token. Use it only against a disposable development store.

### Developer entry points

| Specialty | Start here |
| --- | --- |
| Frontend | Follow the [root navigation](edumind-ui/lib/edumind_root.dart) into worlds, Journey, tutor and player. |
| Backend | Start with [route registration](backend/src/app.ts), then inspect the specific handler and store adapter. |
| AI | Trace the [content provider](backend/src/pipeline/provider.ts), [prompts](backend/src/llm/prompts.ts), [shared schemas](shared/src/) and [tutor contract](backend/src/tutor/contract.ts). |
| QA | Use the [backend tests](backend/test/), [Flutter tests](edumind-ui/test/) and [shell browser suite](shells/test/e2e/shells.spec.mjs) as starting points. |

### Verification at `6b96c23`

- **Passed on Node.js 24.22.3.** `npm ci` succeeded with a writable cache after the default cache path failed. The root build, Prisma Client generation and backend typecheck passed.
- **Passed.** `npm test` reported 319 tests across shared (96), shells (55), and backend (168), including 12 backend study-mode tests.
- **Passed.** Keyless HTTP smoke checks covered backend health, Swagger UI, student registration, a mock exam-prep clarification, saved tutor history in the in-memory store, and the standalone preview HTTP page.
- **Shell Playwright.** Of 16 cases, 12 passed on the first attempt and 2 passed on retry (keeper and lanterns). Goal Shootout draw-pass and Quest Path bridge failed both attempts because the mixed-answer test received a correct result where it expected an incorrect one. All five game families had at least one completed browser session.
- **Flutter 3.50.1 / Dart 3.14.0.** Dependency resolution succeeded. The primary app passed 172 tests and the reference app passed 2. Primary-app analysis exited nonzero with 97 informational findings, mostly SDK deprecations.
- **Flutter web.** The release build passed. The default renderer CDN failed certificate validation in the test browser. Rebuilding with `--no-web-resources-cdn` booted in Chromium, and a seeded Grade 7 profile restored its session, opened My Tutor, and successfully sent an exam-prep request to the mock API. First-time browser onboarding, the contextual lesson sheet and stage replay were outside this smoke test.
- Native-device playback and replay, Codespaces setup and live external providers remain unverified.
- **PostgreSQL.** On a fresh PostgreSQL 16 database, `prisma:deploy` failed with Prisma `P3018` and PostgreSQL `42P07` at `20260717080422_add_student_interests` because the `Student` table already existed. On a separate empty database, `prisma db push --skip-generate` succeeded, and a registered profile and its device token survived a backend restart. That verifies basic persistence with the current schema. Migration history remains a setup blocker.

### Performance and cost context

- **Historical measurements.** In the environment recorded in PERF.md, headless boot to menu took about 1.1–1.8 seconds and mock generation took about 4.3 seconds. These measurements cover an earlier shell and mock pipeline.
- **Live estimates.** PERF.md estimates a fresh standalone game at $0.030–$0.045 and 12–40 seconds on the Haiku path, and $0.09–$0.12 and 15–45 seconds on the escalated path. These are token-based cost estimates and expected timings for standalone games. Actual costs, timings, and content quality with live providers remain unverified, including for Lesson Worlds.
- **Product targets.** The brief targets an average of at most $0.05 per standalone game and at most 25% escalation. Progressive start is intended to reduce perceived wait where supported. Bundled demos and fully local replay can run without a generation call.
- **Measurement limits.** `estCostPerGameUsd` combines tracked model calls across different flows and divides by successful standalone generations. Use separate measurements for standalone games, Lesson Worlds, and tutor turns when verifying live cost. [Metrics implementation](backend/src/pipeline/metrics.ts)

See [PERF.md](PERF.md) for the original measurement conditions and estimates.

## Documentation follow-up

Update the [API guide](docs/API.md) with Lesson Worlds, current tutor modes, evidence and placement endpoints. Refresh the [Ask Hudhud guide](docs/ASK_HUDHUD_INTERACTIVE.md) after validating the live study modes, and reconcile the [migration guide](backend/prisma/MIGRATIONS.md) with the checked-in migration chain.

## License

MIT. See [LICENSE](LICENSE).

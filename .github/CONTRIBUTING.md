# Contributing Guide

Hi! We're really excited that you are interested in contributing to ADAMANT. Before submitting your contribution, please make sure to take a moment and read through the following guidelines:

- [Pull Request Guidelines](#pull-request-guidelines)
- [Development Setup](#development-setup)
- [Scripts](#scripts)
- [Project Structure](#project-structure)
- [Financial Contribution](#financial-contribution)

## Pull Request Guidelines

- The `master` branch is just a snapshot of the latest stable release. All development should be done in dedicated branches. Do not submit PRs against the `master` branch.

- Checkout a topic branch from the relevant branch, e.g. `dev`, and merge back against that branch.

- [Make sure to tick the "Allow edits from maintainers" box](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/allowing-changes-to-a-pull-request-branch-created-from-a-fork). This allows us to directly make minor edits / refactors and saves a lot of time.

- If adding a new feature, provide a convincing reason to add this feature. Ideally, you should open a suggestion issue first and have it approved before working on it.

- If fixing a bug:

  - If you are resolving a special issue, add `(fix #xxxx[,#xxxx])` (#xxxx is the issue id) in your PR title for a better release log, e.g. `update entities encoding/decoding (fix #3899)`.
  - Provide a detailed description of the bug in the PR.

- It's OK to have multiple small commits as you work on the PR - GitHub can automatically squash them before merging.

- Commit messages must follow the [commit message convention](https://www.conventionalcommits.org/). Commit messages are automatically validated before commit (by invoking Git Hooks).

### Advanced Pull Request Tips

- The PR should fix the intended bug **only** and not introduce unrelated changes. This includes unnecessary refactors - a PR should focus on the fix and not code style, this makes it easier to trace changes in the future.

## Development Setup

You will need [Node.js](https://nodejs.org) **version 20.11+**, [PNPM](https://pnpm.io) **version 8+** and [MongoDB](https://www.mongodb.com/) **version 6+** or Docker Compose.

A high level overview of tools used:

- [TypeScript](https://www.typescriptlang.org/) as the development language
- [Nest.js](https://nestjs.com/) as the server-side framework
- [MongoDB](https://www.mongodb.com/) for database
- [Zod](https://zod.dev/) for validation
- [Docker](https://www.docker.com/) for production
- [ESLint](https://eslint.org/) for static error prevention (outside of types)

### Using Docker

Install dependencies:

```
pnpm install
```

Copy the default config file:

```
cp config.default.jsonc config.jsonc
```

Run MongoDB with Docker:

```
docker compose up
```

### Without Docker

Install dependencies:

```
pnpm install
```

Copy the default config file:

```
cp config.default.jsonc config.jsonc
```

Install MongoDB and update `server.mongodb` value in `config.jsonc`. For example:

```json
{
  "server": {
    "port": 36661,
    "mongodb": {
      "port": 27017,
      "host": "127.0.0.1"
    }
  }
}
```

## Scripts

- [`npm run start:dev`](#npm-run-start-dev)

### `npm run start:dev`

The `dev` script builds the app in dev mode. This is useful when you want to start the app for quick debugging:

```bash
$ npm run start:dev

Successfully compiled: 33 files with swc (96.83ms)
...
```

## Project Structure

The source code is located under the `src` directory:

- `main.ts`: Entry point for the app.

- `app.module.ts`: Database connection and modules initialization.

- `shared`: The utilities used across the app.

- `global`: Global modules available that can be used in any part of the app, e.g. logger, config or notifier.

- `rates`:

  - `api`: Contains all the API for each of the sources.

  - `merger`: Module responsible for merging rates from multiple sources.

  - `rates.service.ts`: Service for fetching rates from all the available sources.

## Financial Contribution

We also welcome financial contributions via cryptocurrency. See https://adamant.im/donate.

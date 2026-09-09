/**
 * Repository-wide relative link checker for Markdown sources.
 *
 * `vitepress build` already fails on a dead link inside `docs/`, but it sees only the pages it
 * renders. This script covers the rest of the surface an operator actually follows: `README.md`,
 * `CONTRIBUTING.md`, `AGENTS.md`, and links from documentation pages to repository files outside
 * `docs/`. It also validates heading anchors, which keeps deep links such as
 * `../guide/upgrading.md#backup` honest after a heading is renamed.
 *
 * Absolute links to the published documentation site are resolved against the local `docs/` tree
 * as well, so a `README.md` link to a page or heading that does not exist fails here rather than
 * after deployment.
 *
 * Dependency free by design, so it runs in CI straight after `pnpm install --ignore-scripts`.
 *
 * Usage: node scripts/check-docs-links.mjs
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { dirname, join, relative, resolve, extname } from 'path';
import { fileURLToPath } from 'url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Published documentation site. Links to it must resolve inside the local `docs/` tree. */
const docsSiteOrigin = 'https://currencyinfo.docs.adamant.im';

/** Directories never worth walking: build output, dependencies, and agent scratch space. */
const ignoredDirectories = new Set([
  '.git',
  '.ai-ignored',
  '.ai-tasks',
  '.claude',
  'node_modules',
  'dist',
  'coverage',
  'logs',
]);

/**
 * Recursively collects every Markdown file in the repository worth checking.
 *
 * @param {string} directory - Absolute directory to walk
 * @param {string[]} found - Accumulator of absolute file paths
 * @returns {string[]} Absolute paths of the Markdown files found
 */
function collectMarkdownFiles(directory, found = []) {
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) {
      continue;
    }

    const absolutePath = join(directory, entry);

    if (statSync(absolutePath).isDirectory()) {
      // VitePress build output lives inside `docs/.vitepress`, which is git-ignored but may be
      // present locally after `pnpm run docs:build`.
      if (entry === '.vitepress') {
        continue;
      }

      collectMarkdownFiles(absolutePath, found);
      continue;
    }

    if (extname(entry) === '.md') {
      found.push(absolutePath);
    }
  }

  return found;
}

/**
 * Converts a heading's text into the anchor slug VitePress and GitHub generate for it.
 *
 * @param {string} heading - Raw heading text, possibly carrying inline Markdown
 * @returns {string} Anchor slug without the leading `#`
 */
function slugify(heading) {
  return heading
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/\s+/g, '-');
}

/**
 * Extracts every heading anchor a Markdown file exposes, including explicit `{#custom}` ids.
 *
 * @param {string} content - File contents
 * @returns {Set<string>} Anchor slugs
 */
function collectAnchors(content) {
  const anchors = new Set();
  let insideFence = false;

  for (const line of content.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      insideFence = !insideFence;
      continue;
    }

    if (insideFence) {
      continue;
    }

    const heading = /^#{1,6}\s+(.*)$/.exec(line);

    if (!heading) {
      continue;
    }

    let text = heading[1].trim();
    const explicitId = /\{#([^}]+)\}\s*$/.exec(text);

    if (explicitId) {
      anchors.add(explicitId[1]);
      text = text.slice(0, explicitId.index).trim();
    }

    anchors.add(slugify(text));
  }

  return anchors;
}

/**
 * Extracts the link targets of a Markdown file, skipping fenced code blocks.
 *
 * @param {string} content - File contents
 * @returns {Array<{ target: string, line: number }>} Link targets with their 1-based line numbers
 */
function collectLinks(content) {
  const links = [];
  const lines = content.split('\n');
  let insideFence = false;

  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      insideFence = !insideFence;
      return;
    }

    if (insideFence) {
      return;
    }

    for (const match of line.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      links.push({ target: match[1], line: index + 1 });
    }
  });

  return links;
}

/**
 * Resolves a link target to the Markdown file that serves it, honouring VitePress clean URLs.
 *
 * @param {string} sourceFile - Absolute path of the file holding the link
 * @param {string} targetPath - Path portion of the link, without its hash
 * @returns {string | undefined} Absolute path of the resolved file, or undefined when nothing matches
 */
function resolveTarget(sourceFile, targetPath) {
  // Root-relative links inside the documentation site resolve against `docs/`, not the repository.
  const base = targetPath.startsWith('/') ? join(repositoryRoot, 'docs') : dirname(sourceFile);
  const absolutePath = resolve(base, targetPath.replace(/^\//, ''));

  const candidates = [
    absolutePath,
    `${absolutePath}.md`,
    join(absolutePath, 'index.md'),
    // `/guide/architecture` with clean URLs, and `docs/public` assets served from the site root.
    join(repositoryRoot, 'docs', 'public', targetPath.replace(/^\//, '')),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return undefined;
}

const anchorCache = new Map();

/**
 * Returns the anchors of a Markdown file, reading it at most once.
 *
 * @param {string} absolutePath - Absolute path of a Markdown file
 * @returns {Set<string>} Anchor slugs the file exposes
 */
function anchorsOf(absolutePath) {
  if (!anchorCache.has(absolutePath)) {
    anchorCache.set(absolutePath, collectAnchors(readFileSync(absolutePath, 'utf-8')));
  }

  return anchorCache.get(absolutePath);
}

const problems = [];
const files = collectMarkdownFiles(repositoryRoot);

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const displayPath = relative(repositoryRoot, file);

  for (const { target, line } of collectLinks(content)) {
    let link = target;

    // A link to the published site is really a link into `docs/`, so it is checked rather than
    // skipped: `README.md` and the wiki tombstones address the documentation that way.
    if (link.startsWith(docsSiteOrigin)) {
      link = link.slice(docsSiteOrigin.length) || '/';
    } else if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(link)) {
      // Every other external link, protocol-relative link, and mail address is out of scope:
      // this check must stay offline and deterministic.
      continue;
    }

    const [targetPath, hash] = link.split('#');

    if (!targetPath) {
      if (hash && !anchorsOf(file).has(hash)) {
        problems.push(`${displayPath}:${line} missing anchor #${hash}`);
      }

      continue;
    }

    // A site link is always root-relative, even when the origin was written out in full.
    const resolved = resolveTarget(file, link.startsWith('/') ? targetPath || '/' : targetPath);

    if (!resolved) {
      problems.push(`${displayPath}:${line} broken link ${target}`);
      continue;
    }

    if (hash && extname(resolved) === '.md' && !anchorsOf(resolved).has(hash)) {
      problems.push(`${displayPath}:${line} missing anchor ${target}`);
    }
  }
}

if (problems.length) {
  console.error(`Found ${problems.length} documentation link problem(s):`);
  for (const problem of problems) {
    console.error(`  ${problem}`);
  }
  process.exit(1);
}

console.log(`Checked ${files.length} Markdown files, all relative links and anchors resolve.`);

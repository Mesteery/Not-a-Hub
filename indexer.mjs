import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Get the creation date of a path from git, and fallback to the file
 * creation date from the filesystem (= the file is not yet committed)
 */
function getCreationDate(file) {
  const creationDate = spawnSync('git', ['log', '-1', '--format=%ai', '--reverse', file]).stdout.toString('utf8');
  return creationDate ? new Date(creationDate) : statSync(file).birthtime;
}

const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

/**
 * Transform multiple posts into stringified posts grouped and sorted by their creation date
 * ```md
 * ### Juillet 2021
 * * [Ceci est un post <kbd>langages</kbd> <kbd>python</kbd>](/langages/python/ceci-est-un-post)
 *
 * ### Juin 2021
 * * [Ceci est un post <kbd>langages</kbd> <kbd>python</kbd>](/langages/python/ceci-est-un-post)
 * ```
 */
function makeIndex(base, posts) {
  // groups posts by the month and year
  const groups = {};
  // iterate over posts sorted by creation date
  for (const post of posts.sort((a, b) => b.createdAt - a.createdAt)) {
    // Date -> "Juillet 2021"
    const dating = `${months[post.createdAt.getMonth()]} ${post.createdAt.getFullYear()}`;
    if (!(dating in acc)) acc[dating] = [];
    // the post relative path, extension excluded, and backslashs converted to slashs (for Windows users)
    const relativePath = './' + relative(base, post.path.slice(0, -3)).replaceAll('\\', '/');
    groups[dating].push(`* [${post.title} ${post.tags.map((tag) => `<kbd>${tag}</kbd>`).join(' ')}](${relativePath})`);
  }
  // merge groups' title and posts
  return Object.entries(groups).map(([date, posts]) => `### ${date}\n${posts.join('\n')}`).join('\n\n');
}

// Match the Articles sections of a README.md
// The `d` flag allows to have the match indices (start and end).
// This will deliberately not match the extra line breaks (at the end of the section).
const postSectionRegex = /## Articles\n(?:### .+\n(?:\* \[.+\]\(.+\)\n)*(?:\* \[.+\]\(.+\))\n\n)*(?:### .+\n(?:\* \[.+\]\(.+\)\n)*(?:\* \[.+\]\(.+\)))|## Articles/di;

/**
 * Write a index in the given directory.
 * If the index file and Articles sections already exists,
 * the Articles sections will be updated.
 * If the index file already exists but non the Articles sections,
 * the index file will be appended.
 * If the index file does not exists, it will be created,
 * with only the Articles section.
 */
async function writeIndex(dirpath, posts) {
  const path = join(dirpath, 'README.md');
  const indexSection = `## Articles\n${makeIndex(dirpath, posts)}`;
  let content;

  try {
    content = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    content = '';
  }

  // if the file is empty (or doesn't exist),
  // create/write to it with only the Articles section.
  if (content === '') {
    return writeFile(path, indexSection + '\n');
  }

  const match = content.match(postSectionRegex);
  if (!match) {
    // If the file already ends with a line break,
    // there is no need to add a new one.
    // Else we add prefix the index with a line break.
    const prefix = content.endsWith('\n') ? '' : '\n';
    content += `${prefix}\n${indexSection}\n`;
  } else {
    // replace the Articles section with the new one
    const [start, end] = match.indices[0];
    content = content.slice(0, start) + indexSection + content.slice(end);
  }

  return writeFile(path, content);
}

const ignoredPaths = [fileURLToPath(new URL('./assets', import.meta.url))];
const ignoredNames = ['README.md', 'index.md'];
/**
 * Recursively scan the given directory and return an array of posts,
 * with their path, title, creation date, and tags, and create the
 * indexes files in each parent folder.
 * Assets' folder, README.md, and index.md, and files/folders starting with a dot
 * are excluded.
 */
async function* makeIndexes(path, tags = []) {
  for (const content of await readdir(path, { withFileTypes: true })) {
    const contentPath = join(path, content.name);
    if (content.name.startsWith('.') || ignoredPaths.includes(contentPath) || ignoredNames.includes(content.name)) {
      continue;
    }

    if (content.isDirectory()) {
      const posts = [];
      for await (const post of makeIndexes(contentPath, tags.concat(content.name))) {
        yield post;
        posts.push(post);
      }
      if (posts.length) await writeIndex(contentPath, posts);
    } else if (content.name.endsWith('.md')) {
      const file = await readFile(contentPath, 'utf8');
      // retrieve the post title
      const titleStart = file.indexOf('# ');
      yield {
        tags,
        title: file.slice(titleStart + 2, file.indexOf('\n', titleStart)),
        path: contentPath,
        createdAt: getCreationDate(contentPath),
      };
    }
  }
}

const dirpath = fileURLToPath(new URL('.', import.meta.url));
const posts = [];
for await (const post of makeIndexes(dirpath)) posts.push(post);
await writeIndex(dirpath, posts);

import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

function getCreationDate(file) {
  const creationDate = spawnSync('git', ['log', '-1', '--format=%ai', '--reverse', file]).stdout.toString('utf8');
  return creationDate ? new Date(creationDate) : statSync(file).birthtime;
}

const months = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Août',
  'Juin',
  'Juillet',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];
function makeIndex(base, posts) {
  return Object.entries(
    posts
      .sort((a, b) => b.createdAt - a.createdAt)
      .reduce((acc, post) => {
        const dating = `${months[post.createdAt.getMonth()]} ${post.createdAt.getFullYear()}`;
        if (!(dating in acc)) acc[dating] = [];
        acc[dating].push(
          `* [${post.title} ${post.tags.map((tag) => `<kbd>${tag}</kbd>`).join(' ')}](./${relative(
            base,
            post.path.slice(0, -3),
          ).replaceAll('\\', '/')}) `.trimEnd(),
        );
        return acc;
      }, {}),
  )
    .map(([date, posts]) => `### ${date}\n${posts.join('\n')}`)
    .join('\n\n');
}

async function writeIndex(dirpath, posts) {
  const path = join(dirpath, 'README.md');
  const index = `## Articles\n${makeIndex(dirpath, posts)}`;
  let content;

  try {
    content = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    return writeFile(path, index + '\n');
  }

  const match = content.match(
    /## Articles\n(?:### .+\n(?:\* \[.+\]\(.+\)\n)*(?:\* \[.+\]\(.+\))\n\n)*(?:### .+\n(?:\* \[.+\]\(.+\)\n)*(?:\* \[.+\]\(.+\)))|## Articles/di,
  );
  if (!match) {
    content += content === '' ? `${index}\n` : `${content.endsWith('\n') ? '' : '\n'}\n${index}\n`;
  } else {
    const [start, end] = match.indices[0];
    content = content.slice(0, start) + index + content.slice(end);
  }
  return writeFile(path, content);
}

async function* makeIndexes(path, tags = []) {
  for (const content of await readdir(path, { withFileTypes: true })) {
    if (content.name[0] === '.' || content.name === 'assets') {
      continue;
    }

    const contentPath = join(path, content.name);
    if (content.isDirectory()) {
      const posts = [];
      for await (const post of makeIndexes(contentPath, tags.concat(content.name))) {
        yield post;
        posts.push(post);
      }
      if (posts.length) await writeIndex(contentPath, posts);
    } else if (content.name.endsWith('.md') && !['index.md', 'README.md'].includes(content.name)) {
      const file = await readFile(contentPath, 'utf8');
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

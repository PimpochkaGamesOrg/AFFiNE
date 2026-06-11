import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.resolve(fileURLToPath(import.meta.url), '..');
const PRISMA_BIN = path.join(APP_ROOT, 'node_modules', 'prisma', 'build', 'index.js');
const MAIN_BIN = path.join(APP_ROOT, 'dist', 'main.js');
const SELF_HOST_CONFIG_DIR = `${homedir()}/.affine/config`;

function generatePrivateKey() {
  const key = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  }).privateKey.export({
    type: 'sec1',
    format: 'pem',
  });

  if (key instanceof Buffer) {
    return key.toString('utf-8');
  }

  return key;
}

/**
 * @type {Array<{ to: string; generator: () => string }>}
 */
const files = [{ to: 'private.key', generator: generatePrivateKey }];

function prepare() {
  fs.mkdirSync(SELF_HOST_CONFIG_DIR, { recursive: true });

  for (const { to, generator } of files) {
    const targetFilePath = path.join(SELF_HOST_CONFIG_DIR, to);
    if (!fs.existsSync(targetFilePath)) {
      console.log(`creating config file [${targetFilePath}].`);
      fs.writeFileSync(targetFilePath, generator(), 'utf-8');
    }
  }
}

function runPrismaMigrations() {
  console.log('running prisma migrations.');
  execFileSync(process.execPath, [PRISMA_BIN, 'migrate', 'deploy'], {
    cwd: APP_ROOT,
    env: process.env,
    stdio: 'inherit',
  });
}

function repairPgvectorEmbeddingTables() {
  console.log('repairing copilot pgvector embedding tables.');
  const sql = fs.readFileSync(
    path.join(import.meta.dirname, 'repair-pgvector-embedding-tables.sql'),
    'utf-8'
  );
  execFileSync(
    process.execPath,
    [PRISMA_BIN, 'db', 'execute', '--stdin', '--schema', 'schema.prisma'],
    {
      cwd: APP_ROOT,
      env: process.env,
      input: sql,
      stdio: ['pipe', 'inherit', 'inherit'],
    }
  );
}

function runDataMigrations() {
  console.log('running data migrations.');
  execFileSync(process.execPath, [MAIN_BIN, 'run'], {
    cwd: APP_ROOT,
    env: { ...process.env, SERVER_FLAVOR: 'script' },
    stdio: 'inherit',
  });
}

function fixFailedMigrations() {
  console.log('fixing failed migrations.');
  const maybeFailedMigrations = [
    '20250521083048_fix_workspace_embedding_chunk_primary_key',
  ];
  for (const migration of maybeFailedMigrations) {
    try {
      execFileSync(
        process.execPath,
        [PRISMA_BIN, 'migrate', 'resolve', '--rolled-back', migration],
        {
          cwd: APP_ROOT,
          env: process.env,
          stdio: 'pipe',
          encoding: 'utf-8',
        }
      );
      console.log(`migration [${migration}] has been rolled back.`);
    } catch (err) {
      const message = err.stderr?.toString() ?? err.message ?? String(err);
      if (
        message.includes(
          'cannot be rolled back because it is not in a failed state'
        ) ||
        message.includes(
          'cannot be rolled back because it was never applied'
        ) ||
        message.includes(
          'called markMigrationRolledBack on a database without migrations table'
        )
      ) {
        continue;
      }
      console.log(
        `migration [${migration}] rolled back failed. ${message}`
      );
    }
  }
}

prepare();
fixFailedMigrations();
runPrismaMigrations();
repairPgvectorEmbeddingTables();
runDataMigrations();

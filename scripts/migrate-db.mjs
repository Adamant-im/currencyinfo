import mongoose from 'mongoose';
import readline from 'readline';

migrate();

/**
 * Resolves MongoDB connection string.
 *
 * Prefers the MIGRATE_DB_URL environment variable; falls back to a positional
 * CLI argument for convenience in local, non-sensitive runs. Reading credentials
 * from the environment avoids exposing the password in shell history, pnpm's
 * lifecycle command header, and the OS process list.
 *
 * @returns {string | undefined} MongoDB connection string
 */
function resolveUrl() {
  if (process.env.MIGRATE_DB_URL) {
    return process.env.MIGRATE_DB_URL;
  }

  if (process.argv[2]) {
    console.warn(
      'Warning: passing the connection string via CLI argument exposes credentials in shell history and the process list. Prefer the MIGRATE_DB_URL environment variable.',
    );

    return process.argv[2];
  }
}

/**
 * Prompts interactively for the connection string with hidden input when running in a terminal.
 *
 * @returns {Promise<string | undefined>} Connection string or undefined if cancelled or non-TTY
 */
async function readUrlFromStdin() {
  if (!process.stdin.isTTY) {
    return undefined;
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    process.stdout.write('Enter MongoDB connection string (input hidden): ');

    let isMuted = true;
    const originalWrite = rl._writeToOutput;
    rl._writeToOutput = function (stringToWrite) {
      if (isMuted) {
        if (stringToWrite === '\r\n' || stringToWrite === '\n') {
          rl.output.write('\n');
        }
      } else {
        originalWrite.call(rl, stringToWrite);
      }
    };

    let settled = false;

    rl.on('line', (line) => {
      settled = true;
      rl.close();
      resolve(line.trim() || undefined);
    });

    rl.on('close', () => {
      if (!settled) {
        settled = true;
        resolve(undefined);
      }
    });

    rl.on('SIGINT', () => {
      if (!settled) {
        settled = true;
        process.stdout.write('\n');
        process.exitCode = 1;
        rl.close();
        resolve(undefined);
      }
    });
  });
}

/**
 * Masks URI credentials before printing the connection string to standard output.
 *
 * @param {string} url - Raw MongoDB connection URL
 * @returns {string} Sanitized URL
 */
function sanitizeUrl(url) {
  return url.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
}

/**
 * Runs the database migration to transform legacy rate documents into the v4+ schema.
 */
async function migrate() {
  let url = resolveUrl();

  try {
    if (!url) {
      url = await readUrlFromStdin();
    }

    if (!url) {
      console.error(
        'No connection string provided. Pass MIGRATE_DB_URL=<url> or run interactively from a terminal.',
      );
      process.exitCode = 1;

      return;
    }

    await mongoose.connect(url);

    console.log(`Database '${sanitizeUrl(url)}' connected successfully. Starting in 3 seconds...`);

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const { db } = mongoose.connection;
    const collections = await db.listCollections().toArray();
    const collectionNames = new Set(collections.map((c) => c.name));

    // Handle collection renaming if migrating from legacy single 'tickers' collection
    if (!collectionNames.has('timestamps') && collectionNames.has('tickers')) {
      const legacyDocCount = await db
        .collection('tickers')
        .countDocuments({ tickers: { $exists: true } });

      if (legacyDocCount > 0) {
        console.log("Renaming legacy 'tickers' collection to 'timestamps'...");
        await db.renameCollection('tickers', 'timestamps');
      }
    }

    const timestamps = db.collection('timestamps');
    const tickers = db.collection('tickers');

    const legacyFilter = { tickers: { $exists: true, $ne: null } };
    const totalDocs = await timestamps.countDocuments(legacyFilter);

    if (totalDocs === 0) {
      console.log(
        "No legacy documents with 'tickers' field found to migrate. Database is up to date.",
      );

      return;
    }

    let processedDocs = 0;
    console.log(`Starting migration. Legacy documents to process: ${totalDocs}`);

    const cursor = timestamps.find(legacyFilter);

    for await (const doc of cursor) {
      processedDocs += 1;

      console.log(`Processing ${processedDocs}/${totalDocs} document: ${doc._id}`);

      const ops = [];

      for (const [pair, rate] of Object.entries(doc.tickers || {})) {
        const [base, quote] = pair.split('/');

        if (base && quote && typeof rate === 'number') {
          ops.push({
            updateOne: {
              filter: { date: doc.date, base, quote },
              update: { $set: { date: doc.date, base, quote, rate } },
              upsert: true,
            },
          });
        }
      }

      if (ops.length > 0) {
        await tickers.bulkWrite(ops, { ordered: false });
      }

      await timestamps.updateOne(
        { _id: doc._id },
        {
          $unset: {
            tickers: '',
          },
        },
      );
    }

    console.log('Migration successfully completed.');
  } catch (error) {
    console.error('Error during migration:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

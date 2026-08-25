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

async function readUrlFromStdin() {
  const rl = readline.createInterface({ input: process.stdin, terminal: true });

  process.stdout.write('Enter MongoDB connection string: ');

  const url = await new Promise((resolve) => {
    rl.once('line', resolve);
  });

  rl.close();

  return url.trim() || undefined;
}

/**
 * Masks URI credentials before printing the connection string to standard output.
 */
function sanitizeUrl(url) {
  return url.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
}

async function migrate() {
  let url = resolveUrl();

  try {
    if (!url) {
      url = await readUrlFromStdin();
    }

    if (!url) {
      console.error(
        'No connection string provided. Pass MIGRATE_DB_URL=<url> or run without arguments and enter it via stdin.',
      );
      process.exitCode = 1;

      return;
    }

    await mongoose.connect(url);

    console.log(`Database '${sanitizeUrl(url)}' connected successfully. Starting in 3 seconds...`);

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const { db } = mongoose.connection;

    await db.renameCollection('tickers', 'timestamps');

    const timestamps = db.collection('timestamps');
    const tickers = db.collection('tickers');

    const totalDocs = await timestamps.countDocuments();
    let processedDocs = 0;

    console.log(`Starting migration. Total documents: ${totalDocs}`);

    const cursor = timestamps.find();

    for await (const doc of cursor) {
      processedDocs += 1;

      console.log(`Processing ${processedDocs}/${totalDocs} document: ${doc._id}`);

      const tickerDocs = [];

      for (const [pair, rate] of Object.entries(doc.tickers || {})) {
        const [base, quote] = pair.split('/');

        tickerDocs.push({
          base,
          quote,
          rate,
          date: doc.date,
        });
      }

      if (tickerDocs.length > 0) {
        await tickers.insertMany(tickerDocs);
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

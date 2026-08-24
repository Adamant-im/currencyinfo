import mongoose from 'mongoose';

migrate();

async function migrate() {
  try {
    const url = process.argv[2];

    await mongoose.connect(url);

    const sanitizedUrl = url.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
    console.log(`Database '${sanitizedUrl}' connected successfully. Starting in 3 seconds...`);

    await new Promise((resolve) => setTimeout(() => resolve(), 3000));

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

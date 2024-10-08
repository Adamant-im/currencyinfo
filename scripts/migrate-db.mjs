import mongoose from 'mongoose';

migrate();

async function migrate() {
  try {
    const url = process.argv[2];

    await mongoose.connect(url);

    console.log(
      `Database '${url}' connected successfully. Starting in 3 seconds...`,
    );

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

      console.log(
        `Processing ${processedDocs}/${totalDocs} document: ${doc._id}`,
      );

      const tickeres = [];

      for (const [pair, rate] of Object.entries(doc.tickers)) {
        const [quote, base] = pair.split('/');

        tickeres.push({
          base,
          quote,
          rate,
          date: doc.date,
        });
      }

      await tickers.insertMany(tickeres);

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
  } finally {
    await mongoose.disconnect();
  }
}

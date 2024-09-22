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

    const tickers = db.collection('tickers');

    console.log('Starting switching coins...');

    const cursor = tickers.find({ date: { $lte: 1723404948930 } });

    for await (const doc of cursor) {
      processedDocs += 1;

      console.log(`Processing ${processedDocs} document: ${doc._id}`);

      const originalBase = doc.base;
      const originalQuote = doc.quote;

      await tickers.updateOne(
        { _id: doc._id },
        {
          $set: {
            base: originalQuote,
            quote: originalBase,
          },
        },
      );
    }

    console.log('Switching successfully completed.');
  } catch (error) {
    console.error('Error during switching coins:', error);
  } finally {
    await mongoose.disconnect();
  }
}

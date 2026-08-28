import 'dotenv/config';
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const r = await mongoose.connection.db.collection('items').updateMany(
  { source: 'nps' },
  { $unset: { summary: '' } }
);
console.log('cleared summaries on', r.modifiedCount, 'NPS items');
process.exit(0);

import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }

const client = new MongoClient(uri);

export async function getDb() {
  await client.connect();
  return client.db('nps-dashboard');
}

export async function closeDb() {
  await client.close();
}

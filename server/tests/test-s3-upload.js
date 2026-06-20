require('dotenv').config();
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.S3_BUCKET_NAME;
const KEY = 'test-upload/empty-test.txt';

async function run() {
  console.log(`Bucket : ${BUCKET}`);
  console.log(`Region : ${process.env.AWS_REGION}`);
  console.log(`Key    : ${KEY}`);
  console.log('');

  // --- Upload empty file ---
  console.log('Uploading empty .txt file...');
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: KEY,
    Body: '',
    ContentType: 'text/plain',
  }));

  const url = `${process.env.S3_BUCKET_URL}/${KEY}`;
  console.log(`✓ Upload succeeded!`);
  console.log(`  URL: ${url}`);
  console.log('');

  // --- Clean up ---
  console.log('Deleting test file from S3...');
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: KEY }));
  console.log('✓ Test file deleted. S3 upload is working correctly.');
}

run().catch(err => {
  console.error('✗ Upload failed:', err.message);
  process.exit(1);
});

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const config = require('./config');

const s3Client = new S3Client({
  region: config.aws.region,
  credentials: config.aws.accessKeyId ? {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  } : undefined, // Falls back to IAM role in production
});

const ALLOWED_MIME_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function validateFile(mimeType, size) {
  if (!ALLOWED_MIME_TYPES[mimeType]) {
    throw Object.assign(new Error(`File type ${mimeType} not allowed`), { statusCode: 400 });
  }
  if (size > MAX_FILE_SIZE) {
    throw Object.assign(new Error(`File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`), { statusCode: 400 });
  }
}

async function uploadFile(buffer, mimeType, chatId) {
  const ext = ALLOWED_MIME_TYPES[mimeType];
  const key = `chats/${chatId}/${uuidv4()}.${ext}`;

  await s3Client.send(new PutObjectCommand({
    Bucket: config.aws.s3Bucket,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
    CacheControl: 'max-age=31536000', // 1 year, immutable content
  }));

  return {
    key,
    url: `https://${config.aws.s3Bucket}.s3.${config.aws.region}.amazonaws.com/${key}`,
  };
}

async function getPresignedUploadUrl(chatId, fileName, mimeType) {
  const ext = path.extname(fileName) || `.${ALLOWED_MIME_TYPES[mimeType]}`;
  const key = `chats/${chatId}/${uuidv4()}${ext}`;

  const url = await getSignedUrl(s3Client, new PutObjectCommand({
    Bucket: config.aws.s3Bucket,
    Key: key,
    ContentType: mimeType,
  }), { expiresIn: 3600 }); // 1 hour

  return { key, uploadUrl: url };
}

async function getPresignedDownloadUrl(key) {
  return getSignedUrl(s3Client, new GetObjectCommand({
    Bucket: config.aws.s3Bucket,
    Key: key,
  }), { expiresIn: 3600 });
}

async function deleteFile(key) {
  await s3Client.send(new DeleteObjectCommand({
    Bucket: config.aws.s3Bucket,
    Key: key,
  }));
}

module.exports = {
  validateFile,
  uploadFile,
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  deleteFile,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
};

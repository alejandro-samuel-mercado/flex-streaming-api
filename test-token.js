const crypto = require('crypto');
const secret = 'change_this_to_a_long_random_secret_for_signed_urls_64chars';
const videoFileId = 'cmplpz5uc02fugrtz5dklfrm4';
const token = '2febe47a8402a693ad89711a11dcadda1be640eefa9798dd91b7a8e5627779fa.1781166850';

const [hmac, expiresStr] = token.split('.');
const expires = parseInt(expiresStr, 10);

const expected = crypto.createHmac('sha256', secret).update(`${videoFileId}:${expires}`).digest('hex');
console.log({hmac, expected, match: hmac === expected});

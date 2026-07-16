const LOGO = require('../logo-b64.js');
module.exports = (req, res) => {
  const buf = Buffer.from(LOGO, 'base64');
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(buf);
};

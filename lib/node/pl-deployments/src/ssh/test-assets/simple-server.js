const http = require('http');
const PORT = 3001;
const MESSAGE = "Hello, this is a simple Node.js server!";
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(MESSAGE);
});
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

FROM node:20-alpine

WORKDIR /app

COPY package.json server.js index.html ./
COPY css ./css
COPY js ./js
COPY assets ./assets
COPY data/default-data.json ./data/default-data.json

ENV NODE_ENV=production

CMD ["node", "server.js"]

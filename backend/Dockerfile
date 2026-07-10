FROM docker:24-dind

# Install Node.js on top of Docker-in-Docker base image
RUN apk add --no-cache nodejs npm

WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY src/ ./src/

ENV PORT=8000
ENV NODE_ENV=production
ENV DOCKER_HOST=unix:///var/run/docker.sock

EXPOSE 8000

ENTRYPOINT []
CMD ["node", "src/index.js"]

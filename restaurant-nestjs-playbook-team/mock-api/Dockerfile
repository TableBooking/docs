FROM node:22-alpine
WORKDIR /app
COPY server.mjs ./server.mjs
USER node
ENV PORT=4010 HOST=0.0.0.0
EXPOSE 4010
CMD ["node", "server.mjs"]

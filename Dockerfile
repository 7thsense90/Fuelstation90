FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=4310 BIND_ADDRESS=0.0.0.0 FUEL_DATA_DIR=/data
WORKDIR /app
COPY --chown=node:node *.cjs index.html package.json ./
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 4310
CMD ["node", "server.cjs"]

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY index.js ./
EXPOSE 8787
USER node
CMD ["node", "index.js"]

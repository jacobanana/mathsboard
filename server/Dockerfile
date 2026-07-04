FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY index.js ./
# Passed by publish.yml (see .github/actions/app-version); read at runtime by
# index.js and served at /api/version. After the npm ci layer so a version-only
# change doesn't reinstall deps.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
EXPOSE 8787
USER node
CMD ["node", "index.js"]

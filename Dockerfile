FROM oven/bun:latest AS base
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src
COPY tsconfig.json ./

RUN bunx @tailwindcss/cli -i src/web/styles/app.css -o src/web/styles/dist/app.css --minify

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "src/web/index.ts"]

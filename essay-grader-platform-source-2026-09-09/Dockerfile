# 议论文智能批改系统 —— 多阶段构建
# 说明：P0 MVP 使用 JSON 文件存储；PostgreSQL schema 见 db/schema.sql（迁移目标）
FROM node:24-alpine AS client
WORKDIR /app/client
COPY client/package.json ./
RUN npm install
COPY client/ ./
RUN npm run build

FROM node:24-alpine AS server
WORKDIR /app/server
COPY server/package.json ./
RUN npm install --omit=dev
COPY server/ ./
COPY --from=client /app/client/dist /app/client/dist
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
CMD ["node", "src/index.ts"]

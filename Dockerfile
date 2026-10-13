# Navyk: build lessons (Python) → run the zero-dependency Node server.
FROM python:3.13-slim AS content
ENV PIP_NO_CACHE_DIR=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /build
RUN pip install pyyaml
COPY scripts ./scripts
COPY content ./content
RUN python scripts/build_content.py

FROM node:22-alpine
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0 TRUST_PROXY=1
WORKDIR /app
COPY server ./server
COPY web ./web
COPY --from=content /build/content ./content
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/src/http.ts"]

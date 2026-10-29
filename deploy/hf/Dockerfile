# Floorplan Intelligence on a Hugging Face Docker Space: the viewer and the AegisPlan API in one process.
# The local GGUF model isn't shipped; Nemotron 3 Ultra runs on Nebius Token Factory (NEBIUS_API_KEY secret).

FROM node:22-slim AS web
WORKDIR /src/viz
COPY viz/package.json viz/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY viz/ ./
# `npm run build` also typechecks; CI covers that, the image only needs the bundle
RUN npx vite build

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 \
    AEGISPLAN_DISABLE_MODEL=1
RUN useradd -m -u 1000 user
WORKDIR /app
COPY aegis/requirements.txt aegis/requirements.txt
RUN pip install --no-cache-dir -r aegis/requirements.txt
COPY --chown=user aegis/ aegis/
COPY --from=web --chown=user /src/viz/dist viz/dist
USER user
WORKDIR /app/aegis
EXPOSE 7860
CMD ["uvicorn", "aegisplan.server:app", "--host", "0.0.0.0", "--port", "7860"]

# Marker API - RunPod Serverless

Self-hosted document-to-markdown converter using [Marker](https://github.com/VikParuchuri/marker) on RunPod Serverless GPU.

See [ADR-017](../../docs/adr/017-self-hosted-marker-runpod.md) for the full decision record.

## How it works

1. Convex submits a job to RunPod with a file URL and webhook callback
2. RunPod spins up a GPU worker, downloads the file, runs Marker
3. RunPod delivers the markdown result via webhook to the Convex HTTP endpoint

## Supported formats

- **PDF** - via `PdfConverter` (GPU-accelerated)
- **EPUB** - via `EpubConverter` (EPUB -> PDF -> Markdown internally)

Format is auto-routed based on `file_type` in the job input.

## Setup

### Prerequisites

- Docker
- A [RunPod](https://runpod.io) account
- A container registry (Docker Hub, GHCR, etc.)

### Build and push

```bash
docker build -t tomaszgoral/scrollect-marker:latest .
docker push tomaszgoral/scrollect-marker:latest
```

### Create RunPod endpoint

1. Go to **Serverless** -> **Endpoints** -> **New Endpoint**
2. **Endpoint Name:** `scrollect-marker`
3. **Endpoint Type:** Queue
4. **Container Image:** `tomaszgoral/scrollect-marker:latest`
5. **GPU:** 16 GB (A4000/RTX 4000)
6. **Min Workers:** 0 (scale to zero)
7. **Max Workers:** 3
8. **Idle Timeout:** 300s

### Set Convex environment variables

```bash
cd packages/backend
npx convex env set RUNPOD_ENDPOINT_ID <endpoint-id-from-dashboard>
npx convex env set RUNPOD_API_KEY <your-runpod-api-key>
npx convex env set MARKER_WEBHOOK_SECRET $(openssl rand -hex 32)
```

Note: `CONVEX_SITE_URL` is automatically set by Convex - no manual configuration needed.

## Job input format

```json
{
  "input": {
    "file_url": "https://storage.example.com/document.pdf",
    "document_id": "abc123",
    "file_type": "pdf"
  },
  "webhook": "https://your-app.convex.site/api/marker-webhook?secret=..."
}
```

## Job output format

Success:

```json
{
  "markdown": "# Chapter 1\n\nContent...",
  "document_id": "abc123"
}
```

Failure (always includes `document_id` for webhook routing):

```json
{
  "document_id": "abc123",
  "error": "Error description"
}
```

## Testing

Submit a test job via RunPod dashboard or curl:

```bash
curl -X POST "https://api.runpod.ai/v2/<endpoint-id>/run" \
  -H "Authorization: Bearer <api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "file_url": "https://example.com/test.pdf",
      "document_id": "test-123",
      "file_type": "pdf"
    }
  }'
```

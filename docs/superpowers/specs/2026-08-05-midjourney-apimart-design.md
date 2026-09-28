# APIMart Midjourney Integration Design

## Goal

Add a separate midjourney image model backed by APIMart while preserving the existing gpt-image-2-apimart channel and configuration. The online image generator and canvas image generator nodes expose the same Midjourney-specific controls.

## Architecture

The server keeps the existing APIMart GPT Image endpoint and adds a dedicated Midjourney endpoint and request helper. Both use APIMART_IMAGE_API_KEY; Midjourney has optional endpoint overrides so existing deployments remain compatible. The client sends structured Midjourney fields only when the selected model is midjourney, and the server validates and normalizes them before submitting an asynchronous task and polling the existing APIMart task endpoint.

## Parameters

- Version: 8.2, 8.1, 7, 6.1, 5.2, 5.1
- Mode: standard or Niji (niji: true)
- Speed: relax, fast, turbo
- Style: raw or standard
- Stylize: integer 0 through 1000, default 100
- Size: existing UI aspect-ratio selections converted to W:H for Midjourney

Niji uses niji: true with the selected version and never uses a model ID such as niji-7. Midjourney requests omit model from the upstream request body because the route identifies the model.

## Compatibility

Existing GPT Image behavior, aliases, environment variables, model labels, resolution logic, history, and image extraction remain unchanged. The new model is added to /api/image-models only when the shared APIMart key is configured.

## Error Handling and Verification

The server rejects unsupported versions, speeds, styles, non-boolean Niji values, and stylize values outside the documented range. It reports APIMart submission/task errors through the existing image endpoint. Static checks cover model registration, request-body shape, and both UI surfaces; Node syntax checks and local endpoint smoke tests provide regression coverage for the existing APIMart channel.

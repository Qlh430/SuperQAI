# MiniMax H3 Canvas Video Design

## Goal

Add a dedicated MiniMax H3 reference-to-video workflow to the canvas without changing existing image generation, Midjourney, or ComfyUI node behavior. The feature supports the model's complete reference set: up to 9 images, 3 videos, and 3 standalone audio clips, with generated video delivered to a separate output node.

## Canvas Model

The canvas gains four node roles:

- `Video material`: upload, preview, replace, download, persist, and reuse a local video asset.
- `Audio material`: upload, play, replace, download, persist, and reuse a local audio asset.
- `MiniMax H3 video`: collect references, edit generation parameters, submit the ComfyUI task, and report progress.
- `Video output`: play and download the generated MP4 and expose it as a reusable video connection.

Existing image nodes and galleries remain the image-reference source. The H3 node displays incoming references as three ordered collections. Image groups and galleries expand into their contained images. Each media type has its own stable ordering and official prompt labels: `<Picture n>`, `<Video n>`, and `<Audio n>`.

The H3 node contains only orchestration controls, not the generated player. It includes:

- Prompt textarea, also accepting an incoming text-node prompt.
- Aspect ratio: `16:9`, `9:16`, and `1:1`.
- Megapixels: fast preview `0.6 MP` and full-quality `1.0 MP`.
- Duration in seconds, clamped to the supported 5-15 second range.
- Reference image size: `match` or `max`.
- Seed: blank means random; a numeric value makes the run reproducible.
- Generate button and asynchronous status.

On the first successful run, a video output node is created to the right and connected automatically. Later runs update the connected output node instead of creating duplicates. Users may also create an empty video output node manually.

## Connection Rules

Connections carry a media kind inferred from the source node:

- Image nodes, image galleries, and image groups provide image references.
- Video material and video output nodes provide video references.
- Audio material nodes provide audio references.
- Text and LLM text outputs provide the H3 prompt.

The H3 node accepts mixed incoming connections and partitions them by media kind. Frontend and backend both enforce the limits of 9 images, 3 videos, and 3 audio clips. A run requires a non-empty prompt and at least one reference of any supported media type. Existing connections remain backward compatible because connection records retain the current `from`, `to`, and `toPort` shape.

Empty image-upload, video-material, and audio-material nodes may be connected to H3 before a file is selected. These structural connections remain visible but do not count as H3 references until the node receives a local media URL. Uploading into an already connected node refreshes the H3 collections automatically. This permits either workflow order: upload then connect, or connect then upload.

## Uploads And Persistence

Media assets are uploaded to the local server before being stored in canvas data. A generic chunked media upload endpoint accepts image, video, and audio MIME types and returns an `/output/...` URL. It reuses the current size limit and temporary chunk assembly but writes an extension consistent with the uploaded media.

Serialized canvas nodes store:

- Video material: local URL, filename, MIME type, and optional duration metadata.
- Audio material: local URL, filename, MIME type, and optional duration metadata.
- H3: prompt, aspect ratio, megapixels, duration, reference image size, seed, and per-type reference order.
- Video output: local URL, filename, MIME type, prompt summary, and creation timestamp.

Save/restore, copy/paste, undo/redo, node deletion, and connection rendering follow the existing canvas mechanisms. Large media bytes never enter the board JSON.

## ComfyUI Execution

The source workflow is copied into `workflows/minimax-h3-video.json` as a valid API-format JSON workflow. It retains the supplied turbo four-step sampler, native video and audio VAEs, 24 fps output, and `SaveVideo` pipeline.

The server exposes `POST /api/minimax-h3-video` and uses the existing asynchronous task store and `GET /api/upscale/status` polling contract. The new runner:

1. Validates prompt, parameters, and media counts.
2. Fetches local `/output` media safely or accepts data URLs, then uploads each item to the appropriate ComfyUI upload endpoint.
3. Creates `LoadImage`, `LoadVideo`, and `LoadAudio` nodes dynamically and connects them to `MiniMaxH3ReferenceToVideo` as `ref_images.ref_image_n`, `ref_videos.ref_video_n`, and `ref_audios.ref_audio_n`.
4. Removes unused sample reference nodes and unused dynamic inputs.
5. Injects prompt, aspect ratio, megapixels, duration, reference-size mode, seed, and a unique output prefix.
6. Submits the workflow and polls ComfyUI history.
7. Extracts the preferred `SaveVideo` output, downloads it through ComfyUI `/view`, saves it under local `output/`, and returns `videos: [localUrl]`.

The runner uses the `minimax_h3_ref2va` model already named in the supplied workflow. It does not add T2V, I2V, or first/last-frame modes.

## Errors And Progress

Validation errors identify the exact missing or excessive media type. Upload, ComfyUI queue, generation, and local-save phases produce distinct progress messages. Task failures are returned through the existing status object and do not overwrite the previous successful video output.

If ComfyUI history contains no video output, the error includes the observed output node IDs without exposing secrets. Unsupported local files or path traversal attempts are rejected before any outbound request.

## Verification

Automated checks cover:

- Workflow file validity and required MiniMax H3 node IDs.
- Dynamic injection of 9 images, 3 videos, and 3 audio clips.
- Limit validation and removal of unused sample inputs.
- `SaveVideo` history extraction and local MIME/extension handling.
- Canvas menu entries, node factories, media-kind partitioning, request payload, separate video output behavior, and serialization/restoration.
- Regression execution through the full existing `npm run check` suite.

Visual verification covers desktop and mobile viewports, node control overflow, media previews, ordered reference collections, connection rendering, progress, and the separate video player node.

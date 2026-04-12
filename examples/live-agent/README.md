# Sone Live Agent

A local example that pairs `json-render` prompt generation with a custom Sone catalog and a live canvas preview.

## What it does

- Streams JSONL patches from a local API
- Compiles them into a prompt-friendly Sone spec
- Translates that spec into real `SoneNode` trees
- Renders and exports the result in the browser
- Supports a deterministic fixture path for offline development and tests

## Environment

Copy `.env.example` to `.env` and provide values when you want live model generation.

## Scripts

- `npm run dev` - start the local API and Vite frontend together
- `npm run build` - build the frontend bundle
- `npm run check` - run TypeScript checks
- `npm run test` - run the example test suite

## Notes

- This example currently follows `examples/live-editor` and depends on `sone` from npm.
- The fixture path is the first debugging surface when renderer, schema, or translator changes break the preview.

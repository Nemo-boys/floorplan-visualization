# Deploy

The app is a static site. `npm run build` typechecks and writes everything to `dist/`:

```
dist/index.html
dist/assets/index-<hash>.css
dist/assets/index-<hash>.js           the app (about 260 KB gzipped)
dist/assets/three.webgpu-<hash>.js    loaded only in browsers with WebGPU (about 200 KB gzipped)
```

There is nothing to configure: no environment variables, no keys and no backend. The only request to another site is the Google Fonts stylesheet for Atkinson Hyperlegible.

## Any static host

Serve `dist/` as it is. The app uses hash links (`#review`, `#simulate`, …), so no rewrite rules are needed. Hashed files in `assets/` can be cached for a long time; `index.html` shouldn't be cached.

To try the build locally:

```sh
npm run build
npx vite preview          # http://localhost:4173
```

## A Nebius AI Cloud VM (optional)

A VM isn't needed, but if the team wants the app next to other services, any small VM with a web server works. For example, with nginx:

```sh
npm ci && npm run build
sudo cp -r dist/* /var/www/html/
```

The app needs HTTPS for WebGPU on a public address (browsers expose WebGPU only in secure contexts). Without HTTPS it falls back to WebGL2 and still works.

## Browser support

- WebGPU: recent Chrome and Edge. The badge in the top bar reads “WebGPU”.
- WebGL2: everywhere else. The badge reads “WebGL2”.
- Without either, the 3D view is off with a notice, and the plan, simulation and results still work.

# Three.js 0.185.1

Vendored from the official npm package [`three@0.185.1`](https://www.npmjs.com/package/three/v/0.185.1), under the included MIT [LICENSE](LICENSE).

- Package: `https://registry.npmjs.org/three/-/three-0.185.1.tgz`
- SHA-512: `5aojFCXKwnjBRZvUnt3WFfEcvUJgkN5LlijRFN95hMy8WVkG4I0QNcJE+OuWvuJ0bOdStrbfXn0pkd6/QyiAlg==`
- Files: minified renderer/core modules, GLTFLoader, OBJLoader, MTLLoader, OrbitControls, BufferGeometryUtils, SkeletonUtils.
- Addon imports are changed to local relative module paths. No other vendor source is modified.
- 2026-09-07: restored the missing SkeletonUtils dependency required by GLTFLoader; extracted from the same integrity-checked 0.185.1 package.
- 2026-09-08: added OBJLoader and MTLLoader for Mika's optional standalone halo, extracted from the same SHA-512-verified 0.185.1 package. Only the bare `three` imports are adapted to the local renderer.

The runtime is loaded only when the 3D view is requested. It makes no CDN requests. Serve the project over HTTP; browser ES modules and GLB loading are restricted on `file://` pages.

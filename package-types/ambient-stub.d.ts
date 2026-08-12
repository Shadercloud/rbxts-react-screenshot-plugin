// Empty on purpose. roblox-ts projects (including this package's own consumers) set
// `typeRoots: ["node_modules/@rbxts"]`, which sweeps every `@rbxts/*` package into the compiled
// program (the same mechanism that auto-includes `@rbxts/types`/`@rbxts/compiler-types`) - not just
// as an ambient global, but as a real file TypeScript type-checks. Since this package's own npm
// scope is `@rbxts/`, it gets swept into that same scan, so `package.json`'s top-level `types` field
// (what `typeRoots` scanning and any classic-`moduleResolution` explicit import both resolve to)
// must point somewhere that type-checks cleanly with NO Node globals (`Buffer`, `NodeJS`, etc.) -
// those aren't available in a `noLib` roblox-ts project with no `@types/node`, and pointing `types`
// at this package's real Node-side declarations (as this file's sibling, `dist/src/index.d.ts`,
// does) breaks that scan with "Cannot find name 'Buffer'" and similar errors in every consumer's
// project, even in files that never import this package at all.
//
// This file is that safe target - it contributes no ambient declarations and type-checks trivially
// anywhere. The real, usable declarations for this package's Node-side programmatic API
// (`runCapture`, `decodePng`, etc.) are still published: they're reached via `package.json`'s
// `exports` field (`"types": "./dist/src/index.d.ts"`), which only applies under modern
// `moduleResolution` (`bundler`/`node16`/`nodenext`) - exactly what a plain Node/TypeScript script
// (a test runner, a build script) outside the roblox-ts/Luau compilation graph would use, and where
// `typeRoots`'s restrictive `@rbxts` sweep never applies in the first place.
export {};

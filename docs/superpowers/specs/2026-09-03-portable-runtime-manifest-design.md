# Portable Runtime Manifest Design

## Goal

Make the Windows portable package include `canvas-media-cleanup.js` and prevent future runtime JavaScript files from being omitted because a hand-maintained batch-file list was not updated.

## Design

Introduce one Node module that builds the portable package manifest. It includes the fixed package files, every root-level JavaScript runtime file, browser scripts referenced by `index.html`, transitive local `require()` dependencies of `server.js`, and declared production dependency directories. A copy helper consumes this manifest and copies files into the target directory, creating parent directories as needed.

`build-portable.bat` invokes the copy helper instead of maintaining a duplicate JavaScript list. `tools/check-portable-package.js` imports the same manifest, so packaging and verification use identical dependency discovery. Existing directory handling, data exclusion, ZIP creation, and credential checks remain unchanged.

## Safety and compatibility

- Development checks under `tools/` are not copied by the root-level JavaScript scan.
- The existing `assets`, `workflows`, and `skills` directory copies remain in place.
- Missing source files and copy failures remain fatal.
- The portable verifier still rejects `.env`, machine-specific route state, embedded credentials, and unexpected tools.

## Verification

Add a regression check that builds a temporary fixture containing a newly added root JavaScript file and a transitive server dependency, verifies both appear in the manifest, and verifies the copy helper places them in a temporary target. Run the regression check, the portable verifier, syntax checks, and the actual no-pause portable build.

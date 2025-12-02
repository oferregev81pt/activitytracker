---
description: Deploy to Production with Versioning and Git Push
---

# Production Deployment Workflow

This workflow ensures that every production deployment is versioned, documented, and pushed to git.

## Prerequisites
- Ensure all changes are tested in Staging.
- Ensure `git status` is clean (except for version bump changes).

## Steps

1. **Determine Version Bump**
   - Decide if this is a Major (X.0.0), Minor (x.Y.0), or Patch (x.y.Z) release.
   - Update `version` in `package.json`.

2. **Update Changelog**
   - Edit `CHANGELOG.md`.
   - Add a new section for the version: `## [Version] - YYYY-MM-DD`.
   - List added, changed, and fixed items.

3. **Commit and Push**
   - Run: `git add .`
   - Run: `git commit -m "chore: release v<VERSION> - <SHORT_SUMMARY>"`
   - Run: `git push origin main`

4. **Deploy**
   - Run: `npm run deploy:prod`

5. **Verify**
   - Check the production URL.
   - Verify the version number in the UI (top header).

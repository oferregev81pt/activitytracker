# Deployment Workflow

**⚠️ CRITICAL: ALWAYS DEPLOY TO STAGING FIRST ⚠️**

This project follows a strict deployment pipeline to ensure stability. Never deploy directly to production without verifying changes on the staging environment first.

## 1. Deploy to Staging
Deploy the current build to a temporary preview channel to verify changes.

```bash
npm run deploy:staging
```

**Verification Steps:**
1.  Open the "Channel URL" provided in the terminal output.
2.  Verify the new features or bug fixes.
3.  Check for any regressions (e.g., console errors, broken UI).
4.  Test on both Desktop and Mobile if applicable.

## 2. Deploy to Production
**ONLY** after verifying the staging build, proceed to deploy to the live production environment.

```bash
npm run deploy:prod
```

**Post-Deployment:**
1.  Open the production URL: [https://activity-tracker-1eee6.web.app](https://activity-tracker-1eee6.web.app)
2.  Perform a final sanity check.

---

## Script Reference

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start local development server. |
| `npm run deploy:staging` | Builds and deploys to a Firebase Hosting preview channel (expires in 30 days). |
| `npm run deploy:prod` | Builds and deploys to the live Firebase Hosting site. |

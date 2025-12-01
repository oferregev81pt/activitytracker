---
description: How to deploy to Staging and Production
---

# Deployment Workflow

**⚠️ CRITICAL RULE: ALWAYS DEPLOY TO STAGING FIRST ⚠️**
**NEVER** deploy directly to production. You must verify your changes on the staging environment first.

## 1. Staging Environment
Use this environment to test changes before they go live to all users.
The staging environment uses a Firebase Preview Channel.

**To deploy to Staging:**
```bash
npm run deploy:staging
```
*   This will build the app and deploy it to a temporary URL (e.g., `https://activity-tracker-1eee6--staging.web.app`).
*   The URL will be displayed in the terminal output.
*   **ACTION REQUIRED:** You must explicitly ask the user to verify the staging URL before proceeding.

## 2. Production Environment
**ONLY** after the user has verified the staging build and given approval, proceed to deploy to the live production environment.

**To deploy to Production:**
```bash
npm run deploy:prod
```
*   This will build the app and deploy it to the live URL: `https://activity-tracker-1eee6.web.app`.

## Summary
1.  Make changes.
2.  Run `npm run deploy:staging`.
3.  **STOP and ASK** the user to verify the staging URL.
4.  **ONLY** if the user approves, run `npm run deploy:prod`.

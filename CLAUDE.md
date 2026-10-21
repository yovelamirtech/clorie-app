# CLAUDE.md

## Git workflow
- Open regular pull requests, not drafts.
- Merge the PR yourself (squash) once `npm run build` passes. The project has no tests or linter; the build (`tsc -b && vite build`) is the check.
- Merging to `main` deploys to GitHub Pages automatically.

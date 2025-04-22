# Contributing to env-snapper

Thank you for your interest in contributing! This project welcomes issues, feature requests, bug reports, and pull requests.

## Getting Started

1. **Fork the repository** and clone your fork locally.
2. **Install dependencies:**
   ```sh
   npm install
   ```
3. **Build the project:**
   ```sh
   npm run build
   ```
4. **Run/test locally:**
   ```sh
   npm start
   # or
   npx env-snapper <command>
   ```

## Development Guidelines
- Use clear, descriptive commit messages.
- Write and update documentation as needed (README, code comments).
- Add or update tests if you add new features or fix bugs.
- Keep pull requests focused and minimal—one feature/fix per PR.
- Follow the existing code style and structure.

## GitHub Actions & Releases
- All pushes and PRs to `main` run CI via GitHub Actions.
- To automate npm releases:
  1. Bump the version in `package.json`.
  2. Commit and push.
  3. Tag the release (e.g. `git tag v0.2.0 && git push --tags`).
  4. Ensure the `NPM_TOKEN` secret is set in GitHub repo settings (see below).

## Maintainers: Setting up NPM_TOKEN for Automated Releases
1. Generate a new npm token:
   ```sh
   npm token create
   ```
2. In your GitHub repo, go to **Settings → Secrets and variables → Actions → New repository secret**.
3. Name: `NPM_TOKEN`, Value: (your token).
4. The release workflow will now publish new versions automatically when you push a tag.

## Code of Conduct
Be respectful, collaborative, and inclusive. Harassment or abuse will not be tolerated.

## Questions?
Open an issue or start a discussion!

---

**Happy snapping!**

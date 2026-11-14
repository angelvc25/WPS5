# Contributing to WPS5 Launcher

Thank you for your interest in contributing to **WPS5**! Community contributions help make this PC console experience better for everyone. Please take a moment to review these guidelines before submitting issues or pull requests.

## 🐛 Reporting Bugs

Before creating a new issue, please check the [existing issues](https://github.com) to avoid duplicates. When submitting a bug report, please include:

* **WPS5 Version:** (e.g., v1.1.6, portable or installer).
* **Operating System:** (e.g., Windows 10, Windows 11).
* **Steps to Reproduce:** Clear, step-by-step instructions to trigger the issue.
* **Expected vs. Actual Behavior:** What you expected to happen and what actually occurred.
* **Screenshots or Logs:** Any visual evidence or error messages that can help diagnose the problem.

## Suggesting Features

We welcome ideas for new widgets, UI improvements, and emulator integrations! Open an issue with a clear title and describe:

* The problem or limitation the feature solves.
* How it fits into the PS5-inspired user experience.
* Any mockups or references, if applicable.

## 🛠️ Development Setup

Make sure you have **Node.js** and **npm** installed on your machine.

1. **Fork the repository** and clone it locally:
   ```bash
   git clone https://github.com
   cd WPS5
   ```

2. **Create a new branch** for your feature or bug fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Run and test locally:**
   First, start the web server in one terminal:
   ```bash
   npm run web
   ```
   Then, in a second terminal, launch the Electron app:
   ```bash
   npm run electron:dev
   ```

5. **Create a production build (optional):**
   If you need to test the packaged executable or installer:
   ```bash
   npm run electron:build
   ```

## Pull Request Process

1. Ensure your code follows the existing project structure (`frontend` and `backend`) and formatting style.
2. Keep pull requests focused on a single feature or bug fix.
3. Update the `README.md` or `docs/` folder if your changes affect setup instructions or user features.
4. Provide a clear description of your changes in the Pull Request summary and link any related issues.

## Important Rules & Legal Guidelines

* **No Copyrighted Assets:** Do not include official Sony/PlayStation proprietary binaries, BIOS files, copyrighted audio, or game ROMs/ISOs in your pull requests.
* **License Agreement:** By contributing to this project, you agree that your contributions will be licensed under the **GNU AGPL-3.0 License** (see [LICENSE.md](LICENSE.md)).

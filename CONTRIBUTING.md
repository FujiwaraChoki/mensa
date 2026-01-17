# Contributing to Mensa

Thank you for your interest in contributing to Mensa! This document provides guidelines for contributing to this project.

## License

Mensa is released under the **MIT License with Commons Clause**. This means:

- You **CAN** use, copy, modify, merge, and distribute the software for free
- You **CAN** use it for personal projects, internal company use, and non-commercial purposes
- You **CANNOT** sell the software or offer paid services primarily based on it without permission

For commercial licensing inquiries, please contact:
- **Sami Hindi** - sami@samihindi.com

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/FujiwaraChoki/mensa/issues)
2. If not, create a new issue with:
   - A clear, descriptive title
   - Steps to reproduce the bug
   - Expected vs actual behavior
   - Your environment (OS, version, etc.)

### Suggesting Features

1. Open a new issue with the `enhancement` label
2. Describe the feature and its use case
3. Explain why it would benefit users

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and ensure the build passes
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to your branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Setup

```bash
# Install dependencies
bun install

# Run in development mode
bun run tauri dev

# Build for production
bun run tauri build
```

### Code Style

- Follow existing code conventions in the project
- Use TypeScript for frontend code
- Use Rust for Tauri backend code
- Write meaningful commit messages

## Code of Conduct

Be respectful and constructive in all interactions. We welcome contributors of all experience levels.

## Questions?

Feel free to open an issue for any questions about contributing.

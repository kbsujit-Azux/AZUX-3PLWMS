# Testing Guide — AZUX 3PL WMS

## Quick Start

```bash
# Install dependencies
npm install

# Run tests once
npm run test

# Run tests in watch mode (development)
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Lint + format
npm run lint
npm run format
```

## Test Structure

```
src/test/
├── setup.ts                 # Global test setup (jest-dom)
├── auth.test.ts             # Authority/RBAC tests
├── allocation-engine.test.ts # Order lifecycle business logic
└── ...
```

## Writing Tests

### Unit Tests (Vitest + React Testing Library)

```ts
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SomeComponent } from "@/components/some-component";

describe("SomeComponent", () => {
  it("renders correctly", () => {
    render(<SomeComponent />);
    expect(screen.getByText("Hello")).toBeDefined();
  });
});
```

### Testing Authority / RBAC

```ts
import { ROLE_ROUTES, can } from "@/lib/auth";

describe("Admin Authority", () => {
  it("Admin can access all routes", () => {
    const adminRoutes = ROLE_ROUTES["Admin"];
    expect(adminRoutes).toContain("/settings");
    expect(adminRoutes).toContain("/billing");
    // ... all routes
  });
});
```

### Testing Firestore CRUD (Integration)

For integration tests that hit Firestore, use the emulator:

```bash
# Start Firestore emulator
firebase emulators:start --only firestore

# Run integration tests
npm run test -- --run src/test/integration/
```

## CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/ci-cd.yml`) runs on every push/PR:

1. **Lint & Test** — `npm run lint && npm run test && npm run build`
2. **Deploy Rules** — `firebase deploy --only firestore:rules` (on main only)
3. **Deploy Hosting** — `firebase deploy --only hosting` (on main only)

### Required GitHub Secrets

| Secret | Description |
|---|---|
| `FIREBASE_TOKEN` | Run `firebase login:ci` and paste the token |

## Pre-commit Hooks

Husky + lint-staged runs on every commit:

```bash
# Install hooks (one-time)
npm run prepare

# The pre-commit hook automatically runs:
# - ESLint --fix on staged .ts/.tsx files
# - Prettier on staged files
```

## Manual QA Checklist

Before marking a feature as ready:

- [ ] `npm run lint` passes
- [ ] `npm run test` passes
- [ ] `npm run build` succeeds
- [ ] Firestore rules deployed: `npm run firebase:deploy:rules`
- [ ] Manual test as Admin: add/edit/delete warehouses, employees, clients
- [ ] Manual test as other roles: verify RBAC restrictions
- [ ] Real-time sync works across browser tabs
- [ ] No `permission-denied` errors in console

## Current Test Coverage

| Module | Tests | Status |
|---|---|---|
| Auth / RBAC | 4 | ✅ Passing |
| Allocation Engine | 5 | ✅ Passing |
| Settings CRUD | 0 | 🔄 Next |
| Firestore Rules | 0 | 🔄 Next |

## Next Steps

1. Add component tests for Settings page (CRUD dialogs)
2. Add integration tests for Firestore operations (with emulator)
3. Add E2E tests with Playwright for critical user flows
4. Set up Codecov for coverage tracking

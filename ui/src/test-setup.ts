import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Explicit (not vitest `globals: true`) config, so @testing-library/react's
// own automatic-afterEach-cleanup detection doesn't fire on its own —
// without this, each test's rendered tree from the previous test stays in
// the DOM and later queries like getByTestId() match multiple elements.
afterEach(cleanup);


import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isHostedBrowser,
  isHosted,
  isLoopbackHostname,
  isLoopbackUrl,
  getPublicOrigin,
} from "../../src/shared/utils/deploymentMode.js";

describe("deploymentMode utilities", () => {
  const originalEnv = { ...process.env };
  const originalWindow = globalThis.window;

  beforeEach(() => {
    delete process.env.DEPLOYMENT_MODE;
    delete process.env.BASE_URL;
    delete process.env.NEXT_PUBLIC_BASE_URL;
    delete globalThis.window;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    } else {
      delete globalThis.window;
    }
  });

  describe("isLoopbackHostname", () => {
    it("identifies loopback hostnames", () => {
      expect(isLoopbackHostname("localhost")).toBe(true);
      expect(isLoopbackHostname("127.0.0.1")).toBe(true);
      expect(isLoopbackHostname("::1")).toBe(true);
      expect(isLoopbackHostname("[::1]")).toBe(true);
    });

    it("identifies non-loopback hostnames", () => {
      expect(isLoopbackHostname("example.com")).toBe(false);
      expect(isLoopbackHostname("9router-online-production.up.railway.app")).toBe(false);
      expect(isLoopbackHostname("")).toBe(false);
      expect(isLoopbackHostname(null)).toBe(false);
    });
  });

  describe("isHostedBrowser (SSR-safe)", () => {
    it("returns false in SSR environment where window is undefined", () => {
      delete globalThis.window;
      expect(isHostedBrowser()).toBe(false);
    });

    it("returns false if window is present but location is missing", () => {
      globalThis.window = {};
      expect(isHostedBrowser()).toBe(false);
    });

    it("returns false when protocol is http", () => {
      globalThis.window = {
        location: {
          protocol: "http:",
          hostname: "9router-online-production.up.railway.app",
        },
      };
      expect(isHostedBrowser()).toBe(false);
    });

    it("returns false when on https localhost", () => {
      globalThis.window = {
        location: {
          protocol: "https:",
          hostname: "localhost",
        },
      };
      expect(isHostedBrowser()).toBe(false);
    });

    it("returns true on https public domain (e.g. Railway)", () => {
      globalThis.window = {
        location: {
          protocol: "https:",
          hostname: "9router-online-production.up.railway.app",
        },
      };
      expect(isHostedBrowser()).toBe(true);
    });
  });

  describe("isHosted", () => {
    it("delegates to isHostedBrowser when window is defined", () => {
      globalThis.window = {
        location: {
          protocol: "https:",
          hostname: "9router-online-production.up.railway.app",
        },
      };
      expect(isHosted()).toBe(true);
    });

    it("uses DEPLOYMENT_MODE on server", () => {
      delete globalThis.window;
      process.env.DEPLOYMENT_MODE = "hosted";
      expect(isHosted()).toBe(true);

      process.env.DEPLOYMENT_MODE = "local";
      expect(isHosted()).toBe(false);
    });

    it("uses BASE_URL on server", () => {
      delete globalThis.window;
      process.env.BASE_URL = "https://9router-online-production.up.railway.app";
      expect(isHosted()).toBe(true);

      process.env.BASE_URL = "http://localhost:20128";
      expect(isHosted()).toBe(false);
    });
  });
});


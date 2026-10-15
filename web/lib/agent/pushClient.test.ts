import { describe, expect, it } from "vitest";

import { base64UrlToBytes, deviceLabel } from "./pushClient";

describe("base64UrlToBytes", () => {
  it("decodes base64url without padding, as VAPID public keys are written", () => {
    expect([...base64UrlToBytes("AQID")]).toEqual([1, 2, 3]);
    expect([...base64UrlToBytes("-_8")]).toEqual([251, 255]);
    // A real P-256 public key: 65 bytes, starting 0x04 (uncompressed point).
    const key = base64UrlToBytes(
      "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
    );
    expect(key.length).toBe(65);
    expect(key[0]).toBe(4);
  });
});

describe("deviceLabel", () => {
  it("names the browser and the system, coarsely", () => {
    expect(
      deviceLabel(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      ),
    ).toBe("Chrome · macOS");
    expect(
      deviceLabel(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
      ),
    ).toBe("Edge · Windows");
    expect(deviceLabel("Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0")).toBe("Firefox · Linux");
    expect(
      deviceLabel(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
      ),
    ).toBe("Safari · macOS");
    expect(deviceLabel("curl/8.0")).toBeNull();
  });
});

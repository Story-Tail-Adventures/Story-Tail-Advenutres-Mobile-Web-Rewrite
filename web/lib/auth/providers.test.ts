import { describe, expect, it } from "vitest";
import { isIdentityCollision, isOAuthProvider } from "./providers";

describe("isOAuthProvider", () => {
  it.each(["google", "apple"])("accepts %s", (value) => {
    expect(isOAuthProvider(value)).toBe(true);
  });

  it.each(["Google", "facebook", "", null, undefined, 1, {}, ["google"]])(
    "rejects %j",
    (value) => {
      expect(isOAuthProvider(value)).toBe(false);
    },
  );
});

describe("isIdentityCollision", () => {
  it.each(["identity_already_exists", "email_exists", "user_already_exists"])(
    "treats %s as the 2.1.8 entry point",
    (code) => {
      expect(isIdentityCollision(code)).toBe(true);
    },
  );

  it.each(["invalid_credentials", "server_error", "", null, undefined])(
    "leaves %j to the ordinary failure path",
    (code) => {
      expect(isIdentityCollision(code)).toBe(false);
    },
  );
});

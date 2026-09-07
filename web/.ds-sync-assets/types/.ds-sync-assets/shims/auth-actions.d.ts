import type { OAuthProvider } from "../../lib/auth/providers";
export declare function signInWithProviderAction(_provider: OAuthProvider, _formData: FormData): Promise<void>;
export declare function signOutAction(): Promise<void>;

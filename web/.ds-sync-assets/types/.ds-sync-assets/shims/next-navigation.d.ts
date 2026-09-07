export declare function setPathname(next: string): void;
export declare function usePathname(): string;
export declare function useSearchParams(): URLSearchParams;
export declare function useRouter(): {
    push: () => void;
    replace: () => void;
    back: () => void;
    forward: () => void;
    refresh: () => void;
    prefetch: () => void;
};
export declare function useParams(): Record<string, string>;
export declare function redirect(_url: string): never;
export declare function notFound(): never;

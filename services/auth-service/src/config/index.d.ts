interface Config {
    env: string;
    port: number;
    supabase: {
        url: string;
        anonKey: string;
        serviceRoleKey?: string;
    };
    jwt: {
        secret: string;
        accessTokenExpiry: string;
        refreshTokenExpiry: string;
    };
    otp: {
        length: number;
        expiryMinutes: number;
        maxAttempts: number;
        resendLimitPerHour: number;
    };
    email: {
        from: {
            email: string;
            name: string;
        };
    };
    google: {
        clientId: string;
        clientSecret: string;
        redirectUri: string;
    };
    apple: {
        teamId: string;
        keyId: string;
        privateKey: string;
        serviceId: string;
        bundleId: string;
        redirectUri: string;
    };
    rateLimit: {
        registrationPerHour: number;
        loginFailureLimit: number;
        loginBlockDurationMinutes: number;
    };
    security: {
        bcryptRounds: number;
    };
    cors: {
        allowedOrigins: string[];
    };
    frontend: {
        url: string;
        mobileDeepLink: string;
    };
}
declare const config: Config;
export default config;
//# sourceMappingURL=index.d.ts.map
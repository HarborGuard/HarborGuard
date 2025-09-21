/**
 * Secure logging utility to redact sensitive information from logs
 * Compatible with Next.js and modern TypeScript
 */

// Fields that should be redacted from logs
const SENSITIVE_FIELDS = [
    'password',
    'encryptedPassword',
    'token',
    'secret',
    'key',
    'auth',
    'authorization',
    'credentials',
    'apiKey',
    'accessToken',
    'refreshToken',
    'privateKey',
    'clientSecret',
    'webhookSecret',
    'databaseUrl',
    'connectionString',
    'finalCommand',
    'command'
];

// Fields that should be partially redacted (show first/last few characters)
const PARTIAL_REDACT_FIELDS = [
    'username',
    'email',
    'registryurl',
    'authurl',
    'url',
    'cleanedregistry',
    'registry'
];

/**
 * Redact credentials and registry URLs from skopeo commands for safe logging
 */
function redactSkopeoCommand(command: string): string {
    let redacted = command;

    // Redact --creds "username:password" patterns
    redacted = redacted.replace(/--creds\s+"[^"]+"/g, '--creds "***"')
        .replace(/--creds\s+[^\s]+/g, '--creds ***');

    // Redact registry URLs in docker:// references
    // Pattern: docker://registry.domain.com/image:tag -> docker://***/image:tag
    redacted = redacted.replace(/docker:\/\/([^\/]+)\//g, 'docker://***/');

    return redacted;
}

/**
 * Deep clone an object to avoid mutating the original
 */
function deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (obj instanceof Date) {
        return new Date(obj.getTime()) as T;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => deepClone(item)) as T;
    }

    const cloned = {} as T;
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            cloned[key] = deepClone(obj[key]);
        }
    }

    return cloned;
}

/**
 * Redact sensitive information from an object
 */
function redactObject(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    const redacted = deepClone(obj);

    function redactRecursive(target: any) {
        if (target === null || typeof target !== 'object') {
            return;
        }

        for (const key in target) {
            if (target.hasOwnProperty(key)) {
                const lowerKey = key.toLowerCase();

                // Full redaction for sensitive fields
                if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field))) {
                    // Special handling for skopeo commands
                    if (lowerKey.includes('command') && typeof target[key] === 'string') {
                        target[key] = redactSkopeoCommand(target[key]);
                    } else {
                        target[key] = '[REDACTED]';
                    }
                }
                // Partial redaction for semi-sensitive fields
                else if (PARTIAL_REDACT_FIELDS.some(field => lowerKey === field || lowerKey.includes(field))) {
                    const value = String(target[key]);
                    if (value.length > 6) {
                        target[key] = `${value.substring(0, 3)}***${value.substring(value.length - 3)}`;
                    } else {
                        target[key] = '***';
                    }
                }
                // Recursively process nested objects
                else if (typeof target[key] === 'object') {
                    redactRecursive(target[key]);
                }
            }
        }
    }

    redactRecursive(redacted);
    return redacted;
}

/**
 * Secure console.log that redacts sensitive information
 */
export function secureLog(message: string, data?: any): void {
    if (data) {
        const redactedData = redactObject(data);
        console.log(message, redactedData);
    } else {
        console.log(message);
    }
}

/**
 * Secure console.error that redacts sensitive information
 */
export function secureError(message: string, error?: any): void {
    if (error) {
        const redactedError = redactObject(error);
        console.error(message, redactedError);
    } else {
        console.error(message);
    }
}

/**
 * Secure console.warn that redacts sensitive information
 */
export function secureWarn(message: string, data?: any): void {
    if (data) {
        const redactedData = redactObject(data);
        console.warn(message, redactedData);
    } else {
        console.warn(message);
    }
}

/**
 * Secure console.info that redacts sensitive information
 */
export function secureInfo(message: string, data?: any): void {
    if (data) {
        const redactedData = redactObject(data);
        console.info(message, redactedData);
    } else {
        console.info(message);
    }
}

/**
 * Create a secure logger object that can be used as a drop-in replacement
 */
export const secureLogger = {
    log: secureLog,
    error: secureError,
    warn: secureWarn,
    info: secureInfo,
    debug: secureLog // debug uses the same as log
};

/**
 * Redact sensitive information from any object (utility function)
 */
export function redactSensitiveData<T>(data: T): T {
    return redactObject(data);
}

/**
 * Check if a field name is considered sensitive
 */
export function isSensitiveField(fieldName: string): boolean {
    const lowerField = fieldName.toLowerCase();
    return SENSITIVE_FIELDS.some(field => lowerField.includes(field)) ||
        PARTIAL_REDACT_FIELDS.some(field => lowerField.includes(field));
}

import db from '../database/db.js';


class AuditLogService {
    static normalizeSeverity(severity) {
        const normalized = String(severity || '').trim().toLowerCase();
        if (normalized === 'high') return 'High';
        if (normalized === 'low') return 'Low';
        return 'Medium';
    }

    static normalizeModule(moduleName) {
        return String(moduleName || 'GENERAL')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9_]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '') || 'GENERAL';
    }

    static normalizeAction(action) {
        return String(action || 'UNKNOWN_ACTION')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9_]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '') || 'UNKNOWN_ACTION';
    }

    static resolveIpAddress(req) {
        const forwarded = String(req?.headers?.['x-forwarded-for'] || '').trim();
        if (forwarded) {
            return forwarded.split(',')[0].trim().slice(0, 64);
        }

        return String(req?.ip || req?.socket?.remoteAddress || '').trim().slice(0, 64) || null;
    }

    static compactDetails(details = {}) {
        return Object.entries(details || {}).reduce((accumulator, [key, value]) => {
            if (value === undefined || value === null || value === '') {
                return accumulator;
            }

            if (typeof value === 'string') {
                accumulator[key] = value.slice(0, 280);
                return accumulator;
            }

            accumulator[key] = value;
            return accumulator;
        }, {});
    }

    static normalizeChangeValue(value) {
        if (value === undefined || value === null) {
            return null;
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            return trimmed || null;
        }

        return value;
    }

    static areChangeValuesEqual(previousValue, nextValue) {
        const normalizedPrevious = AuditLogService.normalizeChangeValue(previousValue);
        const normalizedNext = AuditLogService.normalizeChangeValue(nextValue);

        if (normalizedPrevious === null && normalizedNext === null) {
            return true;
        }

        return JSON.stringify(normalizedPrevious) === JSON.stringify(normalizedNext);
    }

    static toHumanLabel(fieldName) {
        return String(fieldName || '')
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\b\w/g, (character) => character.toUpperCase()) || 'Field';
    }

    static buildFieldChanges({ before = {}, after = {}, fieldLabels = {} } = {}) {
        const keys = [...new Set([
            ...Object.keys(before || {}),
            ...Object.keys(after || {})
        ])];

        return keys.reduce((changes, fieldKey) => {
            const previousValue = before?.[fieldKey];
            const nextValue = after?.[fieldKey];

            if (AuditLogService.areChangeValuesEqual(previousValue, nextValue)) {
                return changes;
            }

            changes.push({
                field: fieldKey,
                label: fieldLabels[fieldKey] || AuditLogService.toHumanLabel(fieldKey),
                previous: AuditLogService.normalizeChangeValue(previousValue),
                next: AuditLogService.normalizeChangeValue(nextValue)
            });

            return changes;
        }, []);
    }

    static async logAdminAction(clientOrDb = db, req, {
        action,
        module,
        description,
        severity = 'Medium',
        details = {}
    }) {
        const actorAdminId = Number(req?.user?.id) || null;
        const ipAddress = AuditLogService.resolveIpAddress(req);
        const userAgent = String(req?.headers?.['user-agent'] || '').slice(0, 255) || null;
        const safeDescription = String(description || '').slice(0, 400);

        const payload = {
            actorRole: req?.user?.role || null,
            actorEmail: req?.user?.email || null,
            ...AuditLogService.compactDetails(details)
        };

        await clientOrDb.query(`
            INSERT INTO audit_logs (
                administrator_id,
                action,
                module,
                description,
                severity,
                ip_address,
                user_agent,
                details,
                created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW());
        `, [
            actorAdminId,
            AuditLogService.normalizeAction(action),
            AuditLogService.normalizeModule(module),
            safeDescription,
            AuditLogService.normalizeSeverity(severity),
            ipAddress,
            userAgent,
            JSON.stringify(payload)
        ]);
    }

    static async logAdminFailedLoginThrottled(clientOrDb = db, req, {
        emailAttempted = null,
        reason = 'Invalid credentials',
        windowSeconds = 120
    } = {}) {
        const ipAddress = AuditLogService.resolveIpAddress(req);
        const userAgent = String(req?.headers?.['user-agent'] || '').slice(0, 255) || null;
        const normalizedEmailAttempt = String(emailAttempted || '').trim().toLowerCase();
        const safeReason = String(reason || 'Invalid credentials').trim().slice(0, 280) || 'Invalid credentials';

        const existingResult = await clientOrDb.query(`
            SELECT id, details
            FROM audit_logs
            WHERE action = 'ADMIN_LOGIN_FAILED'
              AND module = 'AUTH'
              AND COALESCE(ip_address, '') = COALESCE($1, '')
              AND LOWER(TRIM(COALESCE(details->>'emailAttempted', ''))) = $2
              AND created_at >= (NOW() - ($3::int * INTERVAL '1 second'))
            ORDER BY created_at DESC, id DESC
            LIMIT 1;
        `, [ipAddress, normalizedEmailAttempt, windowSeconds]);

        if (existingResult.rowCount > 0) {
            const existing = existingResult.rows[0];
            const existingDetails = existing?.details && typeof existing.details === 'object' ? existing.details : {};
            const nextFailureCount = Math.max(1, Number(existingDetails.failureCount) || 1) + 1;

            const mergedDetails = {
                ...existingDetails,
                eventType: 'admin_authentication',
                authOutcome: 'failed',
                emailAttempted: normalizedEmailAttempt || null,
                reason: safeReason,
                failureCount: nextFailureCount,
                lastAttemptAt: new Date().toISOString()
            };

            await clientOrDb.query(`
                UPDATE audit_logs
                SET description = $1,
                    severity = 'High',
                    user_agent = $2,
                    details = $3::jsonb
                WHERE id = $4;
            `, [
                `Administrator login failed (${nextFailureCount} attempts in throttle window).`,
                userAgent,
                JSON.stringify(mergedDetails),
                existing.id
            ]);

            return;
        }

        await AuditLogService.logAdminAction(clientOrDb, req, {
            action: 'ADMIN_LOGIN_FAILED',
            module: 'AUTH',
            description: 'Administrator login failed.',
            severity: 'High',
            details: {
                eventType: 'admin_authentication',
                authOutcome: 'failed',
                emailAttempted: normalizedEmailAttempt || null,
                reason: safeReason,
                failureCount: 1,
                firstAttemptAt: new Date().toISOString(),
                lastAttemptAt: new Date().toISOString()
            }
        });
    }

    static async logAdminResendEventThrottled(clientOrDb = db, req, {
        action,
        module = 'AUTH',
        emailAttempted = null,
        authOutcome = 'code_resent',
        description = 'Verification/reset code resent.',
        severity = 'Medium',
        windowSeconds = 120,
        details = {}
    } = {}) {
        const normalizedAction = AuditLogService.normalizeAction(action);
        const normalizedModule = AuditLogService.normalizeModule(module);
        const ipAddress = AuditLogService.resolveIpAddress(req);
        const userAgent = String(req?.headers?.['user-agent'] || '').slice(0, 255) || null;
        const normalizedEmailAttempt = String(emailAttempted || '').trim().toLowerCase();

        const existingResult = await clientOrDb.query(`
            SELECT id, details
            FROM audit_logs
            WHERE action = $1
              AND module = $2
              AND COALESCE(ip_address, '') = COALESCE($3, '')
              AND LOWER(TRIM(COALESCE(details->>'emailAttempted', ''))) = $4
              AND created_at >= (NOW() - ($5::int * INTERVAL '1 second'))
            ORDER BY created_at DESC, id DESC
            LIMIT 1;
        `, [normalizedAction, normalizedModule, ipAddress, normalizedEmailAttempt, windowSeconds]);

        if (existingResult.rowCount > 0) {
            const existing = existingResult.rows[0];
            const existingDetails = existing?.details && typeof existing.details === 'object' ? existing.details : {};
            const nextResendCount = Math.max(1, Number(existingDetails.resendCount) || 1) + 1;

            const mergedDetails = {
                ...existingDetails,
                ...AuditLogService.compactDetails(details),
                eventType: 'admin_authentication',
                authOutcome,
                emailAttempted: normalizedEmailAttempt || null,
                resendCount: nextResendCount,
                lastAttemptAt: new Date().toISOString()
            };

            await clientOrDb.query(`
                UPDATE audit_logs
                SET description = $1,
                    severity = $2,
                    user_agent = $3,
                    details = $4::jsonb
                WHERE id = $5;
            `, [
                `${description} (${nextResendCount} attempts in throttle window).`,
                AuditLogService.normalizeSeverity(severity),
                userAgent,
                JSON.stringify(mergedDetails),
                existing.id
            ]);

            return;
        }

        await AuditLogService.logAdminAction(clientOrDb, req, {
            action: normalizedAction,
            module: normalizedModule,
            description,
            severity,
            details: {
                eventType: 'admin_authentication',
                authOutcome,
                emailAttempted: normalizedEmailAttempt || null,
                resendCount: 1,
                firstAttemptAt: new Date().toISOString(),
                lastAttemptAt: new Date().toISOString(),
                ...AuditLogService.compactDetails(details)
            }
        });
    }
}

export default AuditLogService;

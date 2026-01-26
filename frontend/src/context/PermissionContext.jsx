import React, { createContext, useContext, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { jwtDecode } from 'jwt-decode';

const PermissionContext = createContext(null);

export const usePermissions = () => useContext(PermissionContext);

export const PermissionProvider = ({ children }) => {
    const { isAuthenticated } = useAuth();

    const permissions = useMemo(() => {
        const token = localStorage.getItem('authToken');
        if (isAuthenticated && token) {
            try {
                const decoded = jwtDecode(token);
                return decoded.permissions || [];
            } catch (e) {
                return [];
            }
        }
        return [];
    }, [isAuthenticated]);

    const hasPermission = (requiredPermission) => {
        const requiredPermissions = Array.isArray(requiredPermission)
            ? requiredPermission
            : [requiredPermission];
        if (!requiredPermission || requiredPermissions.length === 0) return true; // No permission required
        // 'Administrator' role from token bypasses frontend checks
        const token = localStorage.getItem('authToken');
        if (token) {
            try {
                const decoded = jwtDecode(token);
                const roles = Array.isArray(decoded.roles)
                    ? decoded.roles
                    : (decoded.role ? [decoded.role] : []);
                if (roles.includes('Administrator')) return true;
            } catch (e) { /* ignore */ }
        }
        return requiredPermissions.some((perm) => permissions.includes(perm));
    };

    const value = { permissions, hasPermission };

    return (
        <PermissionContext.Provider value={value}>
            {children}
        </PermissionContext.Provider>
    );
};

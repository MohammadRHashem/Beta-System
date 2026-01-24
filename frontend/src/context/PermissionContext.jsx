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
        if (!requiredPermission) return true; // No permission required
        // 'Administrator' role from token bypasses frontend checks
        const token = localStorage.getItem('authToken');
        if (token) {
            try {
                const decoded = jwtDecode(token);
                if (decoded.role === 'Administrator') return true;
            } catch (e) { /* ignore */ }
        }
        return permissions.includes(requiredPermission);
    };

    const value = { permissions, hasPermission };

    return (
        <PermissionContext.Provider value={value}>
            {children}
        </PermissionContext.Provider>
    );
};
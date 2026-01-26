const checkPermission = (requiredPermission) => {
    return (req, res, next) => {
        const userPermissions = req.user?.permissions || [];
        const roles = Array.isArray(req.user?.roles)
            ? req.user.roles
            : (req.user?.role ? [req.user.role] : []);
        const requiredPermissions = Array.isArray(requiredPermission)
            ? requiredPermission
            : [requiredPermission];

        if (!requiredPermission || requiredPermissions.length === 0) {
            return next();
        }

        // Universal access for "Administrator" role to prevent lockouts
        const hasRequired = requiredPermissions.some((perm) => userPermissions.includes(perm));
        if (roles.includes('Administrator') || hasRequired) {
            return next();
        }

        return res.status(403).json({ message: 'Forbidden: You do not have the required permission to perform this action.' });
    };
};

module.exports = checkPermission;

const checkPermission = (requiredPermission) => {
    return (req, res, next) => {
        const userPermissions = req.user?.permissions || [];
        const roles = Array.isArray(req.user?.roles)
            ? req.user.roles
            : (req.user?.role ? [req.user.role] : []);

        // Universal access for "Administrator" role to prevent lockouts
        if (roles.includes('Administrator') || userPermissions.includes(requiredPermission)) {
            return next();
        }

        return res.status(403).json({ message: 'Forbidden: You do not have the required permission to perform this action.' });
    };
};

module.exports = checkPermission;
